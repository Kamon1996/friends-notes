import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, useAnimatedReaction, useAnimatedStyle, useFrameCallback, useReducedMotion, useSharedValue, withDelay, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { AiButton, AiGradient, AiIcon } from '@/components/ai/AiIcon';
import { RiddleCards } from '@/components/ai/RiddleCards';
import { HIDDEN, RunList, type RunRowData } from '@/components/ai/RunList';
import { friendSubtitle } from '@/components/FriendRow';
import { Sheet, SheetHandle } from '@/components/Sheet';
import { Chip, IconButton, ScreenHeader, SearchField, useTheme } from '@/components/ui';
import { BEND, SPIN_START, flowBend, flowEnd, flowShift } from '@/lib/bendFlow';
import { daysBetween, nextAnniversary, plural, todayISO } from '@/lib/dates';
import { buildFriendList } from '@/lib/friendList';
import type { Gender } from '@/lib/gender';
import { useStore } from '@/lib/store';
import type { Friend } from '@/lib/types';
import { doneBucket, leftBucket, startBucket, voice } from '@/lib/voice';
import { WHEEL, revealAt, wheelRows } from '@/lib/wheel';

type Stage = 'run' | 'done' | 'ask' | 'between' | 'cards' | 'bye';

/**
 * «Пол друзей» прямо в списке: экран проявляется поверх «Друзей» и выглядит как они же. Поиск уходит, вместо него —
 * плашка с фразой ИИ; список чуть изгибается сверху и снизу, его оттягивают и выдёргивают — полный круг через рамку,
 * у проехавших проявляется пол; список выпрямляется. Всё определилось — «Готово» и назад; остались загадки — шторка
 * «Помочь · Оставить так», «Помочь» — карточки «Кто это?».
 */
export default function AiGenderScreen() {
  const params = useLocalSearchParams<{ top?: string; tab?: string }>();
  const { data, detectGenders, saveFriend, genderBusy } = useStore();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const today = todayISO();
  const total = data.friends.length;
  const inMonth = data.friends.filter((f) => f.birthday && daysBetween(today, nextAnniversary(f.birthday, today)) <= 30).length;
  const subtitle = total ? `${total} ${plural(total, 'человек', 'человека', 'человек')}${inMonth ? ` · ${inMonth} ${plural(inMonth, 'день рождения', 'дня рождения', 'дней рождения')} в ближайший месяц` : ''}` : undefined;
  const tabBar = Number(params.tab) || 0;

  // Кто едет: как в списке «по имени» (избранные сверху); очень много — первые WHEEL.maxRows.
  const [order] = useState(() =>
    buildFriendList(data.friends, '', 'name', today)
      .flatMap((i) => (i.type === 'friend' ? [i.friend] : []))
      .slice(0, WHEEL.maxRows),
  );
  const live = useMemo(() => new Map(data.friends.map((f) => [f.id, f])), [data.friends]);
  const rows: RunRowData[] = useMemo(
    () =>
      wheelRows(order).map((f, i) => {
        const lf = live.get(f.id) ?? f;
        return { friend: lf, subtitle: friendSubtitle(lf, today), gender: lf.gender, real: i < order.length };
      }),
    [order, live, today],
  );
  const R = rows.length;

  // Ход списка и когда у какой строки проявляется пол (в «какая строка в рамке»).
  const shift = useSharedValue(0);
  const bend = useSharedValue(0);
  const [initialReveal] = useState(() => rows.map((r, i) => (r.gender ? revealAt(i, R, BEND.band) : HIDDEN)));
  const revealRef = useRef<number[]>(initialReveal);
  const reveal = useSharedValue<number[]>(initialReveal);
  const firstReveal = useSharedValue<number[]>([]);

  const [workDone, setWorkDone] = useState(false);
  useEffect(() => {
    let alive = true;
    detectGenders().finally(() => alive && setWorkDone(true));
    return () => {
      alive = false;
    };
  }, [detectGenders]);

  // Ответ пришёл — строка проявится, когда в следующий раз проедет рамку; «загадка» — когда всё готово.
  useEffect(() => {
    const at = BEND.band + shift.get() + 0.5;
    const next = revealRef.current.map((r, i) => (r === HIDDEN && (rows[i]?.gender || workDone) ? revealAt(i, R, at) : r));
    revealRef.current = next;
    reveal.set(next);
    firstReveal.set(
      order.map((_, j) => {
        if (!rows[j]?.gender) return HIDDEN;
        let m = HIDDEN;
        for (let i = j; i < R; i += order.length) m = Math.min(m, next[i]);
        return m;
      }),
    );
  }, [rows, workDone, R, order, shift, reveal, firstReveal]);

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
    if (reduce) return;
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
  }, [reduce]);

  // Часы — на UI-потоке, каждый кадр.
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
    if (start.get() < 0) start.set(f.timestamp);
    const t = (f.timestamp - start.get()) / 1000;
    if (doneFlag.get() && doneAt.get() >= HIDDEN) doneAt.set(t);
    const da = doneAt.get() >= HIDDEN ? Infinity : doneAt.get();
    shift.set(flowShift(t, da, R));
    bend.set(flowBend(t, da, R));
    if (!ended.get() && t >= flowEnd(da, R)) {
      ended.set(1);
      scheduleOnRN(onEnd);
    }
  }, !reduce);
  useEffect(() => {
    if (stopped) frame.setActive(false);
  }, [stopped, frame]);

  // Поиск уходит, плашка приходит.
  const searchOut = useSharedValue(0);
  useEffect(() => {
    searchOut.set(withDelay(120, withTiming(1, { duration: 260 })));
  }, [searchOut]);
  const searchStyle = useAnimatedStyle(() => ({ opacity: 1 - searchOut.get(), transform: [{ translateY: -8 * searchOut.get() }] }));
  const bannerStyle = useAnimatedStyle(() => ({ opacity: searchOut.get(), transform: [{ translateY: -8 * (1 - searchOut.get()) }] }));

  // Финал.
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);
  const closed = useRef(false);
  const close = useCallback(() => {
    if (closed.current) return;
    closed.current = true;
    router.back();
  }, []);
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
    if (reduce && workDone) setTimeout(finish, 0);
  }, [reduce, workDone, finish]);

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

  // Где что: шапка и поиск — как в «Друзьях», список — с той же высоты.
  const [headerBottom, setHeaderBottom] = useState(0);
  const listTop = Number(params.top) || headerBottom + 122;
  const busy = stage === 'run' && !stopped;
  const known = data.friends.filter((f) => f.gender).length;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: tabBar, backgroundColor: colors.bg, overflow: 'hidden' }}>
        <RunList rows={rows} top={listTop} clipTop={headerBottom + 100} shift={shift} bend={bend} reveal={reveal} finished={workDone} />
        <View onLayout={(e) => setHeaderBottom(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}>
          <ScreenHeader
            title="Друзья"
            subtitle={subtitle}
            right={
              <>
                <AiButton busy={busy || genderBusy} onPress={() => {}} />
                <IconButton icon="import" label="Импорт друзей" onPress={() => {}} />
                <IconButton icon="sliders" label="Настройки" onPress={() => {}} />
              </>
            }
          />
        </View>
        <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: headerBottom, padding: 20, paddingTop: 14, paddingBottom: 16, gap: 10 }, searchStyle]} pointerEvents="none">
          <SearchField value="" onChangeText={() => {}} placeholder="Поиск по имени" />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Chip label="По имени" selected onPress={() => {}} />
            <Chip label="Скоро день рождения" icon="cake" onPress={() => {}} />
          </View>
        </Animated.View>
        <Animated.View style={[{ position: 'absolute', left: 20, right: 20, top: headerBottom + 10 }, bannerStyle]}>
          <Banner
            phrase={final?.title ?? phrase}
            sub={final?.sub}
            shift={shift}
            firstReveal={firstReveal}
            total={total}
            known={known}
            outsideKnown={data.friends.filter((f) => f.gender && !order.some((o) => o.id === f.id)).length}
            knownOnList={order.filter((f) => live.get(f.id)?.gender).length}
            stopped={stopped || !!final}
            busy={busy}
            glow={stage === 'done' || (stage === 'bye' && !!final && known === total)}
          />
        </Animated.View>
      </View>

      <Sheet visible={stage === 'ask'} onClose={leave} style={{ paddingTop: 10, paddingBottom: insets.bottom + 20, paddingHorizontal: 20 }}>
        <SheetHandle />
        {prompt && <AskBody title={prompt.title} text={prompt.text} help={buttons[0] ?? 'Помочь'} leaveLabel={buttons[1] ?? 'Оставить так'} onHelp={help} onLeave={leave} />}
      </Sheet>
      <RiddleCards visible={stage === 'cards'} friends={ask} onPick={(f, g: Gender) => saveFriend({ ...f, gender: g, genderBy: 'manual' })} onDone={solved} onClose={leave} />
    </View>
  );
}

/** Плашка над списком: фраза ИИ, счётчик и полоска хода. Перерисовывается сама — список её не ждёт. */
function Banner({
  phrase,
  sub,
  shift,
  firstReveal,
  total,
  known,
  outsideKnown,
  knownOnList,
  stopped,
  busy,
  glow,
}: {
  phrase: string;
  sub?: string;
  shift: SharedValue<number>;
  firstReveal: SharedValue<number[]>;
  total: number;
  known: number;
  outsideKnown: number;
  knownOnList: number;
  stopped: boolean;
  busy: boolean;
  glow: boolean;
}) {
  const { s, colors, fonts } = useTheme();
  const [shown, setShown] = useState(0);
  useAnimatedReaction(
    () => {
      const fr = firstReveal.get();
      const at = BEND.band + shift.get() + 0.2;
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
    <View
      style={{
        backgroundColor: colors.card,
        borderWidth: glow ? 1.5 : 1,
        borderColor: glow ? '#E0607E' : colors.hairline,
        borderRadius: 20,
        paddingVertical: 12,
        paddingHorizontal: 16,
        boxShadow: glow ? '0 0 28px rgba(224, 96, 126, 0.35)' : undefined,
      }}
    >
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
