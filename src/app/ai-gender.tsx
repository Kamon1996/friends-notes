import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
import { HIDDEN, RunList, type RunGeo } from '@/components/ai/RunList';
import { FriendsHeader } from '@/components/FriendsHeader';
import { Sheet, SheetHandle } from '@/components/Sheet';
import { Fab, SearchField, useTheme } from '@/components/ui';
import { BEND, SPIN_START, flowBend, flowEnd, flowShift, runItems } from '@/lib/bendFlow';
import { plural, todayISO } from '@/lib/dates';
import { buildFriendList } from '@/lib/friendList';
import type { Gender } from '@/lib/gender';
import { useStore } from '@/lib/store';
import type { Friend } from '@/lib/types';
import { doneBucket, leftBucket, startBucket, voice } from '@/lib/voice';
import { WHEEL, revealAt } from '@/lib/wheel';
import { zodiacShown } from '@/lib/zodiac';

type Stage = 'run' | 'done' | 'ask' | 'between' | 'cards' | 'bye';

const EASE = Easing.inOut(Easing.cubic);
/** Поиск становится плашкой и обратно, мс. */
const MORPH = 420;

/**
 * «Пол друзей» прямо в списке. Экран рисует «Друзей» точь-в-точь — шапку, поиск, подзаголовки групп, строки — и
 * подменяет их мгновенно, без проявления: глазу нечего заметить. Поле поиска вырастает в плашку с фразой ИИ; список
 * с группами как есть чуть изгибается сверху и снизу, его оттягивают и выдёргивают — полный круг через рамку, у
 * проехавших проявляется пол; список выпрямляется. В конце — всё обратно: пол гаснет, плашка сворачивается в поиск,
 * и экран уходит так же незаметно. Всё определилось — «Готово»; остались загадки — шторка «Помочь · Оставить так»,
 * «Помочь» — карточки «Кто это?».
 */
export default function AiGenderScreen() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const { data, detectGenders, saveFriend, genderBusy } = useStore();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const today = todayISO();
  const total = data.friends.length;
  const tabBar = Number(params.tab) || 0;

  // Кто едет: список «по имени», как в «Друзьях», с подзаголовками групп; очень много — первые WHEEL.maxRows друзей.
  const [base] = useState(() => runItems(buildFriendList(data.friends, '', 'name', today), WHEEL.minRows, WHEEL.maxRows));
  const live = useMemo(() => new Map(data.friends.map((f) => [f.id, f])), [data.friends]);
  const items = useMemo(() => base.map((it) => (it.kind === 'row' ? { ...it, friend: live.get(it.friend.id) ?? it.friend } : it)), [base, live]);
  const [onList] = useState(() => base.flatMap((it) => (it.kind === 'row' && it.real ? [it.friend.id] : [])));

  // Ход списка (px вдоль списка) и когда у кого проявляется пол — в px «что сейчас в середине рамки».
  const shift = useSharedValue(0);
  const bend = useSharedValue(0);
  const outro = useSharedValue(0);
  const morph = useSharedValue(0);
  const geo = useSharedValue<RunGeo | null>(null);
  const [geoJs, setGeoJs] = useState<RunGeo | null>(null);
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

  // Ответ пришёл — строка проявится, когда в следующий раз подъедет к рамке; «загадка» — когда всё готово.
  // Кто на старте в рамке или выше, проявится на втором проходе — в самом начале список чист, как в «Друзьях».
  useEffect(() => {
    if (!geoJs) return;
    const { y, h, lap, mid, row } = geoJs;
    const at = mid + shift.get() + 0.5 * row;
    const prev = revealRef.current ?? items.map(() => HIDDEN);
    const next = prev.map((r, i) => {
      const it = items[i];
      if (r !== HIDDEN || it?.kind !== 'row' || !(it.friend.gender || workDone)) return r;
      return revealAt(y[i] + h[i] / 2, lap, at);
    });
    revealRef.current = next;
    reveal.set(next);
    const first = onList.map(() => HIDDEN);
    items.forEach((it, i) => {
      if (it.kind === 'row' && it.friend.gender) first[it.slot] = Math.min(first[it.slot], next[i]);
    });
    firstReveal.set(first);
  }, [geoJs, items, workDone, onList, shift, reveal, firstReveal]);

  // Где что: шапка, поле поиска и плашка — меряем на себе, а пока не измерили, экран прозрачен (видно «Друзей»).
  const [headH, setHeadH] = useState(0);
  const [search, setSearch] = useState({ y: 0, height: 0 });
  const bannerH = useSharedValue(0);
  const ready = !!geoJs && headH > 0 && search.height > 0;
  useEffect(() => {
    if (!base.length) router.back();
  }, [base]);

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
      setTimeout(() => setPhrase((p) => (workDoneRef.current ? voice.say('gender.end') : voice.say('gender.slow')) ?? p), (SPIN_START + BEND.spin * 0.72) * 1000),
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

  // Часы — на UI-потоке, каждый кадр; идут, как только всё измерено.
  const [stopped, setStopped] = useState(false);
  const doneFlag = useSharedValue(0);
  const start = useSharedValue(-1);
  const doneAt = useSharedValue(HIDDEN);
  const ended = useSharedValue(0);
  useEffect(() => {
    if (workDone) doneFlag.set(1);
  }, [workDone, doneFlag]);
  const onEnd = useCallback(() => setStopped(true), []);
  const frame = useFrameCallback((f) => {
    'worklet';
    const g = geo.get();
    if (!g) return;
    if (start.get() < 0) start.set(f.timestamp);
    const t = (f.timestamp - start.get()) / 1000;
    if (doneFlag.get() && doneAt.get() >= HIDDEN) doneAt.set(t);
    const da = doneAt.get() >= HIDDEN ? Infinity : doneAt.get();
    shift.set(flowShift(t, da, g.lap, BEND.pullRows * g.row));
    bend.set(flowBend(t, da, g.lap));
    if (!ended.get() && t >= flowEnd(da, g.lap)) {
      ended.set(1);
      scheduleOnRN(onEnd);
    }
  }, false);
  useEffect(() => {
    if (!ready) return;
    morph.set(reduce ? 1 : withDelay(40, withTiming(1, { duration: MORPH, easing: EASE })));
    if (!reduce) frame.setActive(true);
  }, [ready, reduce, frame, morph]);
  useEffect(() => {
    if (stopped) frame.setActive(false);
  }, [stopped, frame]);

  // Финал.
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);
  // Уходим, когда всё вернулось как было: пол погас, плашка снова поиск. Экран уже закрыли кнопкой «назад» — молчим.
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
    router.back();
  }, []);
  const closing = useRef(false);
  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    if (reduce) return leaveNow();
    outro.set(withTiming(1, { duration: 260 }));
    morph.set(
      withDelay(
        140,
        withTiming(0, { duration: MORPH, easing: EASE }, (fin) => {
          if (fin) scheduleOnRN(leaveNow);
        }),
      ),
    );
    setTimeout(leaveNow, 140 + MORPH + 400);
  }, [reduce, leaveNow, outro, morph]);
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
      setFinal({ title: voice.say('gender.done', { n }, doneBucket(n)) ?? `Готово! Все ${n} как на ладони`, sub: counts(friends) });
      setStage('done');
      setTimeout(close, 2600);
      return;
    }
    const k = unknown.length;
    setFinal({ title: voice.say('gender.left', { k }, leftBucket(k, n)) ?? 'Почти!', sub: `${n - k} из ${n}` });
    setAsk(unknown);
    setPrompt({
      title: voice.say('gender.choice.title', { k }, k === 1 ? 'one' : undefined) ?? `${k} ${plural(k, 'загадка', 'загадки', 'загадок')}`,
      text: voice.say('gender.choice.text') ?? 'По именам не угадать. Поможешь?',
    });
    setTimeout(() => setStage('ask'), 450);
  }, [close]);
  useEffect(() => {
    if (stopped) finish();
  }, [stopped, finish]);
  // Без анимаций (так настроен телефон) — сразу итог, как только ответ готов.
  useEffect(() => {
    if (reduce && workDone && ready) setTimeout(finish, 0);
  }, [reduce, workDone, ready, finish]);

  const leave = () => {
    if (stage === 'bye') return;
    setStage('bye');
    setFinal((f) => ({ title: voice.say('gender.choice.leave') ?? 'Ладно, оставим', sub: f?.sub ?? '' }));
    setTimeout(close, 1900);
  };
  const help = () => {
    setStage('between');
    setTimeout(() => setStage('cards'), 300);
  };
  const solved = () => {
    setStage('bye');
    setTimeout(() => setFinal({ title: voice.say('gender.solved') ?? 'Готово! Ни одной загадки', sub: counts(dataRef.current.friends) }), 250);
    setTimeout(close, 2300);
  };
  const [buttons] = useState(() => (voice.say('gender.choice.buttons') ?? 'Помочь · Оставить так').split(' · '));

  const busy = stage === 'run' && !stopped;
  const known = data.friends.filter((f) => f.gender).length;
  const glow = stage === 'done' || (stage === 'bye' && !!final && known === total);

  // Поле поиска растёт в плашку: сперва гаснут сортировки и подсказка поиска, потом проявляется фраза.
  const searchH = search.height;
  const boxStyle = useAnimatedStyle(() => {
    const k = morph.get();
    const bh = bannerH.get() || searchH;
    return { height: searchH + (bh - searchH) * k, borderRadius: 12 + 8 * k };
  });
  const edgeStyle = useAnimatedStyle(() => ({ borderRadius: 12 + 8 * morph.get() }));
  const searchCopy = useAnimatedStyle(() => ({ opacity: Math.max(0, 1 - morph.get() / 0.35) }));
  const bannerIn = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, (morph.get() - 0.45) / 0.55)) }));
  const chipsStyle = useAnimatedStyle(() => {
    const k = Math.min(1, morph.get() / 0.25);
    return { opacity: 1 - k, transform: [{ translateY: -8 * k }] };
  });
  const measured = useRef(false);
  const onBanner = (h: number) => {
    if (!measured.current) {
      measured.current = true;
      bannerH.set(h);
    } else bannerH.set(withTiming(h, { duration: 200 }));
  };

  return (
    <View style={{ flex: 1, opacity: ready ? 1 : 0 }}>
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: tabBar, backgroundColor: colors.bg, overflow: 'hidden' }}>
        <RunList
          items={items}
          top={headH}
          clipTop={search.y}
          shift={shift}
          bend={bend}
          reveal={reveal}
          outro={outro}
          geo={geo}
          onGeo={setGeoJs}
          today={today}
          zodiac={zodiacShown(data.settings)}
          finished={workDone}
        />
        <View
          style={{ position: 'absolute', left: 0, right: 0, top: 0 }}
          onLayout={(e) => setHeadH(e.nativeEvent.layout.height)}
          pointerEvents="none"
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          <FriendsHeader
            friends={data.friends}
            today={today}
            aiBusy={busy || genderBusy}
            onAi={noop}
            onImport={noop}
            onSettings={noop}
            query=""
            onQuery={noop}
            sort="name"
            onSort={noop}
            chipsStyle={chipsStyle}
            onSearchLayout={(f) => setSearch((p) => (p.y === f.y && p.height === f.height ? p : f))}
          />
        </View>
        <View style={StyleSheet.absoluteFill} pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <Fab onPress={noop} label="Добавить друга" />
        </View>
        {searchH > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[{ position: 'absolute', left: 20, right: 20, top: search.y, boxShadow: glow ? '0 0 28px rgba(224, 96, 126, 0.35)' : undefined }, boxStyle]}
          >
            <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.card, overflow: 'hidden' }, edgeStyle]}>
              <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: 0 }, searchCopy]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                <SearchField value="" onChangeText={noop} placeholder="Поиск по имени" />
              </Animated.View>
              <Animated.View
                style={[{ position: 'absolute', left: 0, right: 0, top: 0, paddingVertical: 12, paddingHorizontal: 16 }, bannerIn]}
                onLayout={(e) => onBanner(e.nativeEvent.layout.height)}
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
                  busy={busy}
                />
              </Animated.View>
            </Animated.View>
            <Animated.View
              style={[StyleSheet.absoluteFill, { borderWidth: glow ? 1.5 : 1, borderColor: glow ? '#E0607E' : colors.hairline }, edgeStyle]}
            />
          </Animated.View>
        )}
      </View>

      <Sheet visible={stage === 'ask'} onClose={leave} style={{ paddingTop: 10, paddingBottom: insets.bottom + 20, paddingHorizontal: 20 }}>
        <SheetHandle />
        {prompt && <AskBody title={prompt.title} text={prompt.text} help={buttons[0] ?? 'Помочь'} leaveLabel={buttons[1] ?? 'Оставить так'} onHelp={help} onLeave={leave} />}
      </Sheet>
      <RiddleCards visible={stage === 'cards'} friends={ask} onPick={(f, g: Gender) => saveFriend({ ...f, gender: g, genderBy: 'manual' })} onDone={solved} onClose={leave} />
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
          <Animated.Text key={phrase} entering={FadeIn.duration(180)} style={[s.title, { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20 }]} numberOfLines={2}>
            {phrase}
          </Animated.Text>
          <Text style={s.muted} accessibilityLiveRegion={stopped ? 'polite' : 'none'}>
            {line}
          </Text>
        </View>
      </View>
      <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.chip, marginTop: 10, overflow: 'hidden' }}>
        <View style={{ height: 4, width: `${Math.round(share * 1000) / 10}%`, borderRadius: 2, overflow: 'hidden' }}>
          <AiGradient />
        </View>
      </View>
    </View>
  );
}

/** Шторка «остались загадки»: помочь или оставить так. */
function AskBody({ title, text, help, leaveLabel, onHelp, onLeave }: { title: string; text: string; help: string; leaveLabel: string; onHelp: () => void; onLeave: () => void }) {
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
          style={({ pressed }) => ({ flex: 1, height: 52, borderRadius: 16, backgroundColor: colors.chip, borderWidth: 1, borderColor: colors.hairline, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
        >
          <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: colors.text }}>{leaveLabel}</Text>
        </Pressable>
        <Pressable
          onPress={onHelp}
          accessibilityRole="button"
          style={({ pressed }) => ({ flex: 1, height: 52, borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}
        >
          <AiGradient />
          <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: '#17130F' }}>{help}</Text>
        </Pressable>
      </View>
    </View>
  );
}
