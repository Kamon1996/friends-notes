import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedReaction,
  useAnimatedStyle,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { AiGradient, AiIcon } from '@/components/ai/AiIcon';
import { RiddleCards } from '@/components/ai/RiddleCards';
import { HIDDEN, LATE, RunList, RunProbe } from '@/components/ai/RunList';
import { Sheet, SheetHandle } from '@/components/Sheet';
import { Fab, useTheme } from '@/components/ui';
import { RUN, SPIN_START, flowEnd, flowFocus, flowShift, runGeometry, runItems, type RunGeo } from '@/lib/runFlow';
import { plural, todayISO } from '@/lib/dates';
import { buildFriendList } from '@/lib/friendList';
import type { Gender } from '@/lib/gender';
import { useStore } from '@/lib/store';
import type { Friend } from '@/lib/types';
import { doneBucket, leftBucket, startBucket, voice } from '@/lib/voice';
import { WHEEL, revealAt } from '@/lib/wheel';
import { zodiacShown } from '@/lib/zodiac';

type Stage = 'run' | 'done' | 'ask' | 'between' | 'cards' | 'bye';

/** Плашка выезжает сверху и уезжает обратно, мс. */
const SLIDE = { in: 460, out: 360 };

/**
 * «Пол друзей» прямо на экране «Друзья»: слой поверх списка, шапка экрана остаётся настоящей.
 *
 * Слой рисует список точь-в-точь (подзаголовки, карточки групп, строки) и появляется, только когда всё измерено, —
 * подмены не видно. Сверху выезжает плашка с фразой; вокруг рамки в середине списка всё чуть темнеет; список оттягивают
 * и выдёргивают — полный круг через рамку (медленно → очень быстро → медленно; ответа нет — крутится, пока не придёт,
 * не дольше 20 с), у проехавших проявляется пол; список встаёт, как стоял. Всё определилось — «Готово»; остались
 * загадки — шторка «Помочь · Оставить так», «Помочь» — карточки «Кто это?». В конце пол гаснет, плашка уезжает наверх,
 * слой исчезает — под ним тот же список.
 *
 * `listTop` — где на экране начинается список (высота шапки списка); список должен быть прокручен к началу и
 * отсортирован по имени (это делает экран «Друзья» перед запуском).
 */
export function GenderRun({ listTop, onClose }: { listTop: number; onClose: () => void }) {
  const { data, detectGenders, saveFriend, genderBusy } = useStore();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const reduce = useReducedMotion();
  const today = todayISO();
  const total = data.friends.length;

  // Кто едет: список «по имени», как в «Друзьях», с подзаголовками групп; очень много — первые WHEEL.maxRows друзей.
  const [base] = useState(() => runItems(buildFriendList(data.friends, '', 'name', today), WHEEL.maxRows));
  const live = useMemo(() => new Map(data.friends.map((f) => [f.id, f])), [data.friends]);
  const items = useMemo(() => base.map((it) => (it.kind === 'row' ? { ...it, friend: live.get(it.friend.id) ?? it.friend } : it)), [base, live]);
  const [onList] = useState(() => base.flatMap((it) => (it.kind === 'row' ? [it.friend.id] : [])));
  const firstFriend = base.find((it) => it.kind === 'row');

  // Геометрия — из двух замеров (подзаголовок и строка); пока не измерили, слой не виден и часы стоят.
  const [viewH, setViewH] = useState(0);
  const [sizes, setSizes] = useState<{ label: number; row: number } | null>(null);
  const geoJs = useMemo(() => (sizes && viewH ? runGeometry(items, sizes.label, sizes.row, viewH) : null), [items, sizes, viewH]);
  const geo = useSharedValue<RunGeo | null>(null);
  useEffect(() => {
    geo.set(geoJs);
  }, [geoJs, geo]);
  const ready = !!geoJs;

  // Ход списка (px вдоль списка) и когда у кого проявляется пол — в px «что сейчас в середине рамки».
  const shift = useSharedValue(0);
  const focus = useSharedValue(0);
  const outro = useSharedValue(0);
  const slide = useSharedValue(0);
  const reveal = useSharedValue<number[]>([]);
  const revealRef = useRef<number[] | null>(null);
  const firstReveal = useSharedValue<number[]>([]);

  const [workDone, setWorkDone] = useState(false);
  useEffect(() => {
    let alive = true;
    detectGenders().finally(() => alive && setWorkDone(true));
    return () => {
      alive = false;
    };
  }, [detectGenders]);

  // Ответ пришёл — строка проявится, когда подъедет к рамке; «загадка» — когда всё готово. Кто на старте в рамке
  // или выше, проявится, когда список, сделав круг, снова его привезёт. Ответ запоздал и список уже стоит — пол
  // проявляется на месте, все опоздавшие разом.
  const [stopped, setStopped] = useState(false);
  const late = useSharedValue(0);
  useEffect(() => {
    if (!geoJs) return;
    const { y, h, lap, mid, row } = geoJs;
    const at = mid + shift.get() + 0.5 * row;
    const prev = revealRef.current ?? items.map(() => HIDDEN);
    let lateOnes = 0;
    const next = prev.map((r, i) => {
      const it = items[i];
      if (r !== HIDDEN || it?.kind !== 'row' || !(it.friend.gender || workDone)) return r;
      if (stopped) {
        lateOnes++;
        return LATE;
      }
      return revealAt(y[i] + h[i] / 2, lap, at);
    });
    revealRef.current = next;
    reveal.set(next);
    if (lateOnes) {
      late.set(0);
      late.set(withDelay(120, withTiming(1, { duration: 360, easing: Easing.out(Easing.cubic) })));
    }
    const first = onList.map(() => HIDDEN);
    items.forEach((it, i) => {
      if (it.kind === 'row' && it.friend.gender) first[it.slot] = Math.min(first[it.slot], next[i]);
    });
    firstReveal.set(first);
  }, [geoJs, items, workDone, stopped, onList, shift, reveal, late, firstReveal]);

  // Что говорит ИИ.
  const [phrase, setPhrase] = useState(() => {
    voice.newFlow();
    return voice.say('gender.start', { n: total }, startBucket(total)) ?? 'Листаю друзей…';
  });
  const workDoneRef = useRef(false);
  useEffect(() => {
    workDoneRef.current = workDone;
  }, [workDone]);
  const [stage, setStage] = useState<Stage>('run');
  useEffect(() => {
    if (reduce || !ready) return;
    const timers = [
      setTimeout(() => setPhrase((p) => voice.say('gender.spin') ?? p), (SPIN_START + 1.1) * 1000),
      setTimeout(
        () => setPhrase((p) => (workDoneRef.current ? voice.say('gender.end') : voice.say('gender.slow')) ?? p),
        (SPIN_START + RUN.spin * 0.72) * 1000,
      ),
    ];
    // ответ задерживается — изредка напоминаем, что работаем
    const slow = setInterval(() => {
      if (!workDoneRef.current) setPhrase((p) => voice.say('gender.slow') ?? p);
    }, 4500);
    return () => {
      timers.forEach(clearTimeout);
      clearInterval(slow);
    };
  }, [reduce, ready]);

  // Часы — на UI-потоке, каждый кадр; идут, как только всё измерено. Круг всегда один.
  const start = useSharedValue(-1);
  const ended = useSharedValue(0);
  const onEnd = useCallback(() => setStopped(true), []);
  const frame = useFrameCallback((f) => {
    'worklet';
    const g = geo.get();
    if (!g) return;
    if (start.get() < 0) start.set(f.timestamp);
    const t = (f.timestamp - start.get()) / 1000;
    shift.set(flowShift(t, g.lap, RUN.pullRows * g.row));
    focus.set(flowFocus(t, g.lap));
    if (!ended.get() && t >= flowEnd(g.lap)) {
      ended.set(1);
      scheduleOnRN(onEnd);
    }
  }, false);
  useEffect(() => {
    if (!ready) return;
    slide.set(
      reduce
        ? 1
        : withDelay(
            40,
            withTiming(1, {
              duration: SLIDE.in,
              easing: Easing.out(Easing.cubic),
            }),
          ),
    );
    if (!reduce) frame.setActive(true);
  }, [ready, reduce, frame, slide]);
  useEffect(() => {
    if (stopped) frame.setActive(false);
  }, [stopped, frame]);

  // Уход: пол гаснет, метки и стрелки возвращаются, плашка уезжает наверх — и слой исчезает. Один раз.
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );
  const gone = useRef(false);
  const leaveNow = useCallback(() => {
    if (gone.current || !mounted.current) return;
    gone.current = true;
    frame.setActive(false);
    onClose();
  }, [onClose, frame]);
  const closing = useRef(false);
  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    if (reduce) return leaveNow();
    outro.set(withTiming(1, { duration: 260 }));
    slide.set(
      withDelay(
        140,
        withTiming(0, { duration: SLIDE.out, easing: Easing.in(Easing.cubic) }, (fin) => {
          if (fin) scheduleOnRN(leaveNow);
        }),
      ),
    );
    setTimeout(leaveNow, 140 + SLIDE.out + 400);
  }, [reduce, leaveNow, outro, slide]);
  useEffect(() => {
    if (!base.length) leaveNow();
  }, [base, leaveNow]);

  const [final, setFinal] = useState<{ title: string; sub: string } | null>(null);
  const [ask, setAsk] = useState<Friend[]>([]);
  const [prompt, setPrompt] = useState<{ title: string; text: string } | null>(null);
  const counts = (friends: readonly Friend[]) => {
    const f = friends.filter((x) => x.gender === 'f').length;
    const m = friends.filter((x) => x.gender === 'm').length;
    return `${f} ${plural(f, 'женщина', 'женщины', 'женщин')} · ${m} ${plural(m, 'мужчина', 'мужчины', 'мужчин')}`;
  };
  const finish = useCallback(() => {
    const friends = dataRef.current.friends;
    const unknown = friends.filter((f) => !f.gender).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    const n = friends.length;
    if (!unknown.length) {
      setFinal({
        title: voice.say('gender.done', { n }, doneBucket(n)) ?? `Готово! Все ${n} как на ладони`,
        sub: counts(friends),
      });
      setStage('done');
      setTimeout(close, 2600);
      return;
    }
    const k = unknown.length;
    setFinal({
      title: voice.say('gender.left', { k }, leftBucket(k, n)) ?? 'Почти!',
      sub: `${n - k} из ${n}`,
    });
    setAsk(unknown);
    setPrompt({
      title: voice.say('gender.choice.title', { k }, k === 1 ? 'one' : undefined) ?? `${k} ${plural(k, 'загадка', 'загадки', 'загадок')}`,
      text: voice.say('gender.choice.text') ?? 'По именам не угадать. Поможешь?',
    });
    setTimeout(() => setStage('ask'), 450);
  }, [close]);
  // Круг закончился: ответ есть — итог; нет — ждём на месте (опоздавшие проявятся сами), но не дольше RUN.wait.
  useEffect(() => {
    if (!stopped) return;
    if (workDone) {
      const t = setTimeout(finish, 0);
      return () => clearTimeout(t);
    }
    const say = setTimeout(() => setPhrase((p) => voice.say('gender.slow') ?? p), 0);
    const t = setTimeout(finish, RUN.wait * 1000);
    return () => {
      clearTimeout(say);
      clearTimeout(t);
    };
  }, [stopped, workDone, finish]);
  // Без анимаций (так настроен телефон) — сразу итог, как только ответ готов.
  useEffect(() => {
    if (reduce && workDone && ready) setTimeout(finish, 0);
  }, [reduce, workDone, ready, finish]);

  const stageRef = useRef(stage);
  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);
  const leave = useCallback(() => {
    if (stageRef.current === 'bye') return;
    setStage('bye');
    setFinal((f) => ({
      title: voice.say('gender.choice.leave') ?? 'Ладно, оставим',
      sub: f?.sub ?? '',
    }));
    setTimeout(close, 1900);
  }, [close]);
  const help = () => {
    setStage('between');
    setTimeout(() => setStage('cards'), 300);
  };
  const solved = () => {
    setStage('bye');
    setTimeout(
      () =>
        setFinal({
          title: voice.say('gender.solved') ?? 'Готово! Ни одной загадки',
          sub: counts(dataRef.current.friends),
        }),
      250,
    );
    setTimeout(close, 2300);
  };
  const [buttons] = useState(() => (voice.say('gender.choice.buttons') ?? 'Помочь · Оставить так').split(' · '));

  // «Назад» на телефоне: пока список крутится — дождаться итога нельзя, поэтому уходим сразу, как «Оставить так».
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stageRef.current === 'cards' || stageRef.current === 'ask') return false; // шторки закрываются сами
      if (stageRef.current === 'run' || stageRef.current === 'done') close();
      return true;
    });
    return () => sub.remove();
  }, [close]);

  const busy = stage === 'run' && !stopped;
  const known = data.friends.filter((f) => f.gender).length;
  const glow = stage === 'done' || (stage === 'bye' && !!final && known === total);

  // Плашка выезжает сверху, над заголовком, и в конце уезжает обратно; поиск и сортировки остаются на месте.
  const bannerH = useSharedValue(0);
  const topGap = insets.top + 6;
  const slideStyle = useAnimatedStyle(() => {
    const h = bannerH.get() || 160;
    return {
      transform: [{ translateY: -(1 - slide.get()) * (h + topGap + 24) }],
    };
  });

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Слой списка: от верха списка до низа экрана, непрозрачный — под ним настоящий список. */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: listTop,
          bottom: 0,
          overflow: 'hidden',
          backgroundColor: ready ? colors.bg : 'transparent',
        }}
        onLayout={(e) => setViewH((v) => v || e.nativeEvent.layout.height || screenH - listTop)} // первый замер — на весь ход
      >
        {firstFriend?.kind === 'row' && !sizes && (
          <RunProbe friend={firstFriend.friend} today={today} zodiac={zodiacShown(data.settings)} onMeasure={(label, row) => setSizes({ label, row })} />
        )}
        {geoJs && (
          <RunList
            items={items}
            geo={geoJs}
            viewH={viewH}
            shift={shift}
            focus={focus}
            reveal={reveal}
            late={late}
            outro={outro}
            today={today}
            zodiac={zodiacShown(data.settings)}
            finished={workDone}
          />
        )}
      </View>
      {ready && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <Fab onPress={noop} label="Добавить друга" />
        </View>
      )}
      <Animated.View
        pointerEvents="none"
        onLayout={(e) => bannerH.set(e.nativeEvent.layout.height)}
        style={[
          {
            position: 'absolute',
            left: 20,
            right: 20,
            top: topGap,
            backgroundColor: colors.card,
            borderRadius: 20,
            borderWidth: glow ? 1.5 : 1,
            borderColor: glow ? '#E0607E' : colors.hairline,
            paddingVertical: 10,
            paddingHorizontal: 14,
            boxShadow: glow ? '0 0 28px rgba(224, 96, 126, 0.35)' : '0 12px 32px rgba(0, 0, 0, 0.35)',
          },
          slideStyle,
        ]}
      >
        <BannerBody
          phrase={final?.title ?? phrase}
          sub={final?.sub}
          shift={shift}
          geo={geo}
          firstReveal={firstReveal}
          total={total}
          known={known}
          outsideKnown={data.friends.filter((f) => f.gender && !onList.includes(f.id)).length}
          knownOnList={onList.filter((id) => live.get(id)?.gender).length}
          stopped={stopped || !!final}
          busy={busy || genderBusy}
        />
      </Animated.View>

      <Sheet
        visible={stage === 'ask'}
        onClose={leave}
        style={{
          paddingTop: 10,
          paddingBottom: insets.bottom + 20,
          paddingHorizontal: 20,
        }}
      >
        <SheetHandle />
        {prompt && (
          <AskBody
            title={prompt.title}
            text={prompt.text}
            help={buttons[0] ?? 'Помочь'}
            leaveLabel={buttons[1] ?? 'Оставить так'}
            onHelp={help}
            onLeave={leave}
          />
        )}
      </Sheet>
      <RiddleCards
        visible={stage === 'cards'}
        friends={ask}
        onPick={(f, g: Gender) => saveFriend({ ...f, gender: g, genderBy: 'manual' })}
        onDone={solved}
        onClose={leave}
      />
    </View>
  );
}

function noop() {}

/** Плашка над списком: фраза ИИ, счётчик и полоска хода. Перерисовывается сама — список её не ждёт. */
function BannerBody({
  phrase,
  sub,
  shift,
  geo,
  firstReveal,
  total,
  known,
  outsideKnown,
  knownOnList,
  stopped,
  busy,
}: {
  phrase: string;
  sub?: string;
  shift: SharedValue<number>;
  geo: SharedValue<RunGeo | null>;
  firstReveal: SharedValue<number[]>;
  total: number;
  known: number;
  outsideKnown: number;
  knownOnList: number;
  stopped: boolean;
  busy: boolean;
}) {
  const { s, colors, fonts } = useTheme();
  const [shown, setShown] = useState(0);
  useAnimatedReaction(
    () => {
      const g = geo.get();
      if (!g) return 0;
      const fr = firstReveal.get();
      const at = g.mid + shift.get() + 0.4 * g.row;
      let c = 0;
      for (let j = 0; j < fr.length; j++) if (fr[j] <= at) c++;
      return c;
    },
    (c, prev) => {
      if (c !== prev) scheduleOnRN(setShown, c);
    },
  );
  // Друзья, что не поместились в круг, «досчитываются» вместе с теми, кто едет.
  const counted = stopped ? known : Math.min(known, shown + Math.round((outsideKnown * shown) / Math.max(1, knownOnList)));
  const line = sub ?? `Разобралась с ${counted} из ${total}`;
  const share = total ? (stopped ? known : counted) / total : 0;
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <AiIcon size={36} busy={busy} />
        <View style={{ flex: 1, gap: 2 }}>
          {/* Фраза — в одну или две строки, а место под неё всегда на две: плашка не меняет высоту от фразы к фразе. */}
          <View style={{ height: 40, justifyContent: 'center' }}>
            <Animated.Text
              key={phrase}
              entering={FadeIn.duration(180)}
              style={[s.title, { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20 }]}
              numberOfLines={2}
            >
              {phrase}
            </Animated.Text>
          </View>
          <Text style={s.muted} numberOfLines={1} accessibilityLiveRegion={stopped ? 'polite' : 'none'}>
            {line}
          </Text>
        </View>
      </View>
      <View
        style={{
          height: 4,
          borderRadius: 2,
          backgroundColor: colors.chip,
          marginTop: 10,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            height: 4,
            width: `${Math.round(share * 1000) / 10}%`,
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          <AiGradient />
        </View>
      </View>
    </View>
  );
}

/** Шторка «остались загадки»: помочь или оставить так. */
function AskBody({
  title,
  text,
  help,
  leaveLabel,
  onHelp,
  onLeave,
}: {
  title: string;
  text: string;
  help: string;
  leaveLabel: string;
  onHelp: () => void;
  onLeave: () => void;
}) {
  const { s, colors, fonts } = useTheme();
  return (
    <View style={{ gap: 20, paddingTop: 16 }}>
      <View style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
        <AiIcon size={48} />
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={[s.h2, { fontSize: 22, lineHeight: 28 }]}>{title}</Text>
          <Text style={[s.body, { color: colors.text2, fontSize: 15, lineHeight: 21 }]}>{text}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Pressable
          onPress={onLeave}
          accessibilityRole="button"
          style={({ pressed }) => ({
            flex: 1,
            height: 52,
            borderRadius: 16,
            backgroundColor: colors.chip,
            borderWidth: 1,
            borderColor: colors.hairline,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text
            style={{
              fontFamily: fonts.semibold,
              fontSize: 16,
              color: colors.text,
            }}
          >
            {leaveLabel}
          </Text>
        </Pressable>
        <Pressable
          onPress={onHelp}
          accessibilityRole="button"
          style={({ pressed }) => ({
            flex: 1,
            height: 52,
            borderRadius: 16,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <AiGradient />
          <Text
            style={{
              fontFamily: fonts.semibold,
              fontSize: 16,
              color: '#17130F',
            }}
          >
            {help}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
