import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn, useAnimatedReaction, useFrameCallback, useReducedMotion, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { Avatar } from '@/components/Avatar';
import { AiGradient, AiIcon, Spark } from '@/components/ai/AiIcon';
import { GenderWheel, HIDDEN, type WheelRow } from '@/components/ai/GenderWheel';
import { AI_STOPS, genderTone } from '@/components/ai/palette';
import { Button, IconButton, useTheme } from '@/components/ui';
import type { Gender } from '@/lib/gender';
import { genderPending } from '@/lib/genderDetect';
import { useStore } from '@/lib/store';
import type { Friend } from '@/lib/types';
import { WHEEL, revealAt, wheelAt, wheelEnd, wheelRows } from '@/lib/wheel';

const byName = (a: Friend, b: Friend) => a.name.localeCompare(b.name, 'ru');

/** Кто едет на колесе: все по алфавиту; если друзей очень много — сперва те, кого ещё определяем. */
function pickRoster(friends: readonly Friend[]): Friend[] {
  const sorted = [...friends].sort(byName);
  if (sorted.length <= WHEEL.maxRows) return sorted;
  const pending = sorted.filter(genderPending);
  const rest = sorted.filter((f) => !genderPending(f));
  return [...pending, ...rest].slice(0, WHEEL.maxRows).sort(byName);
}

/**
 * «Пол друзей»: барабан, как выбор времени на iPhone, — друзья пролетают через полосу, и у каждого проявляется пол.
 * Около 4 секунд: медленно → очень быстро → медленно. Если ответ ещё не пришёл, колесо крутится, пока он не придёт.
 * Потом — итог: сколько женщин и мужчин и кого выбрать вручную.
 */
export default function AiGenderScreen() {
  const { data, detectGenders, saveFriend } = useStore();
  const { s: st, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();

  const [roster] = useState(() => pickRoster(data.friends));
  const live = useMemo(() => new Map(data.friends.map((f) => [f.id, f])), [data.friends]);
  const rows: WheelRow[] = useMemo(() => wheelRows(roster).map((f) => live.get(f.id) ?? f), [roster, live]);
  const R = rows.length;
  const rosterIds = useMemo(() => new Set(roster.map((f) => f.id)), [roster]);

  // Положение колеса (в строках) и когда у какой строки проявляется ответ.
  const pos = useSharedValue(0);
  const [initialReveal] = useState(() => rows.map((f, i) => (f.gender ? i : HIDDEN)));
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

  // Ответ пришёл — строка проявится, когда в следующий раз проедет полосу; «не знаю» — когда всё готово.
  useEffect(() => {
    const at = pos.get() + 0.5;
    const next = revealRef.current.map((r, i) => (r === HIDDEN && (rows[i]?.gender || workDone) ? revealAt(i, R, at) : r));
    revealRef.current = next;
    reveal.set(next);
    firstReveal.set(
      roster.map((_, j) => {
      if (!rows[j]?.gender) return HIDDEN;
      let m = HIDDEN;
        for (let i = j; i < R; i += roster.length) m = Math.min(m, next[i]);
        return m;
      }),
    );
  }, [rows, workDone, R, roster, pos, reveal, firstReveal]);

  // Часы колеса — на UI-потоке, каждый кадр.
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
    pos.set(wheelAt(t, da, R));
    if (!ended.get() && t >= wheelEnd(da, R)) {
      ended.set(1);
      scheduleOnRN(onEnd);
    }
  }, !reduce);

  const [phase, setPhase] = useState<'spin' | 'result'>('spin');
  useEffect(() => {
    if (!stopped) return;
    frame.setActive(false);
    const t = setTimeout(() => setPhase('result'), WHEEL.settle * 1000);
    return () => clearTimeout(t);
  }, [stopped, frame]);
  // Без анимаций (так настроен телефон) — сразу итог, как только ответ готов.
  const showResult = reduce ? workDone : phase === 'result';

  const total = data.friends.length;
  const known = data.friends.filter((f) => f.gender).length;
  const knownOnWheel = roster.filter((f) => live.get(f.id)?.gender).length;
  const outsideKnown = data.friends.filter((f) => f.gender && !rosterIds.has(f.id)).length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 8, paddingTop: 8, paddingBottom: 10 }}>
        <Text style={[st.h1, { flex: 1, fontSize: 28, lineHeight: 34 }]}>Пол друзей</Text>
        <IconButton icon="close" label="Закрыть" onPress={() => router.back()} />
      </View>
      {!showResult ? (
        <>
          <Banner
            pos={pos}
            firstReveal={firstReveal}
            stopped={stopped || (reduce && workDone)}
            waiting={!!reduce}
            total={total}
            known={known}
            knownOnWheel={knownOnWheel}
            outsideKnown={outsideKnown}
          />
          {!reduce && (
            <View style={{ flex: 1, marginBottom: insets.bottom }}>
              <GenderWheel rows={rows} s={pos} reveal={reveal} finished={workDone} />
            </View>
          )}
        </>
      ) : (
        <Result friends={data.friends} onPick={(f, g) => saveFriend({ ...f, gender: g, genderBy: 'manual' })} bottom={insets.bottom} />
      )}
    </View>
  );
}

/** Плашка над колесом: что происходит, счётчик и полоска хода. Перерисовывается сама — колесо её не ждёт. */
function Banner({
  pos,
  firstReveal,
  stopped,
  waiting,
  total,
  known,
  knownOnWheel,
  outsideKnown,
}: {
  pos: SharedValue<number>;
  firstReveal: SharedValue<number[]>;
  stopped: boolean;
  waiting: boolean;
  total: number;
  known: number;
  knownOnWheel: number;
  outsideKnown: number;
}) {
  const { s, colors, fonts } = useTheme();
  const [shown, setShown] = useState(0);
  useAnimatedReaction(
    () => {
      const fr = firstReveal.get();
      const at = pos.get() + 0.2;
      let c = 0;
      for (let j = 0; j < fr.length; j++) if (fr[j] <= at) c++;
      return c;
    },
    (c, prev) => {
      if (c !== prev) scheduleOnRN(setShown, c);
    },
  );
  // Друзья, что не поместились на колесо, «досчитываются» вместе с теми, кто едет.
  const counted = stopped ? known : Math.min(known, shown + Math.round((outsideKnown * shown) / Math.max(1, knownOnWheel)));
  const unknown = total - known;
  const title = stopped ? 'Готово' : waiting ? 'Определяю…' : 'Пролистываю друзей…';
  const sub = stopped ? (unknown ? `${known} из ${total} · ${unknown} выбери сам` : `Все ${total} определены`) : `Определено ${counted} из ${total}`;
  return (
    <View style={{ marginHorizontal: 20, marginBottom: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline, borderRadius: 20, padding: 14, paddingHorizontal: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <AiIcon size={36} busy={!stopped} />
        <View style={{ flex: 1 }}>
          <Text style={[s.title, { fontFamily: fonts.semibold, fontSize: 16 }]}>{title}</Text>
          <Text style={s.muted} accessibilityLiveRegion={stopped ? 'polite' : 'none'}>
            {sub}
          </Text>
        </View>
      </View>
      <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.chip, marginTop: 12, overflow: 'hidden' }}>
        <View style={{ height: 4, width: `${total ? (counted / total) * 100 : 0}%`, borderRadius: 2, overflow: 'hidden' }}>
          <AiGradient />
        </View>
      </View>
    </View>
  );
}

/** Итог: кольцо «женщины / мужчины / выбери сам» и список тех, кого по имени не понять, — с выбором в одно касание. */
function Result({ friends, onPick, bottom }: { friends: readonly Friend[]; onPick: (f: Friend, g: Gender) => void; bottom: number }) {
  const { s, colors, fonts, scheme } = useTheme();
  // Список «выбери сам» фиксируем на момент итога: выбранные не исчезают из-под пальца.
  const [askIds] = useState(() => friends.filter((f) => !f.gender).sort(byName).map((f) => f.id));
  const byId = new Map(friends.map((f) => [f.id, f]));
  const ask = askIds.map((id) => byId.get(id)).filter((f): f is Friend => !!f);
  const fem = friends.filter((f) => f.gender === 'f').length;
  const mal = friends.filter((f) => f.gender === 'm').length;
  const unk = friends.length - fem - mal;
  const total = Math.max(1, friends.length);
  const R = 62;
  const C = 2 * Math.PI * R;
  const seg = (from: number, len: number, color: string) =>
    len > 0 ? (
      <Circle cx={75} cy={75} r={R} stroke={color} strokeWidth={16} fill="none" strokeDasharray={`${(len / total) * C} ${C}`} strokeDashoffset={-(from / total) * C} transform="rotate(-90 75 75)" />
    ) : null;
  const tone = (g: Gender | undefined) => genderTone(scheme, g);
  const legend: [string, number, string][] = [
    ['Женщины', fem, tone('f').ring],
    ['Мужчины', mal, tone('m').ring],
    ['Выбери сам', unk, tone(undefined).ring],
  ];
  return (
    <Animated.View entering={FadeIn.duration(350)} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={{ marginHorizontal: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline, borderRadius: 20, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 18 }}>
          <View style={{ width: 150, height: 150 }}>
            <Svg width={150} height={150}>
              <Circle cx={75} cy={75} r={R} stroke={colors.chip} strokeWidth={16} fill="none" />
              {seg(0, fem, tone('f').ring)}
              {seg(fem, mal, tone('m').ring)}
            </Svg>
            <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: fonts.display, fontSize: 34, lineHeight: 40, color: colors.text }}>{fem + mal}</Text>
              <Text style={s.caption}>из {friends.length}</Text>
            </View>
            <Spark size={14} color={AI_STOPS[0]} style={{ position: 'absolute', left: 30, top: 4 }} />
            <Spark size={10} color={AI_STOPS[2]} style={{ position: 'absolute', right: 6, top: 18 }} />
            <Spark size={12} color={AI_STOPS[1]} style={{ position: 'absolute', right: 2, bottom: 16 }} />
          </View>
          <View style={{ flex: 1, gap: 10 }}>
            {legend.map(([label, n, color]) => (
              <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
                <Text style={[s.body, { fontSize: 15, flex: 1 }]}>{label}</Text>
                <Text style={[s.body, { fontSize: 15, color: colors.text2 }]}>{n}</Text>
              </View>
            ))}
          </View>
        </View>
        {ask.length > 0 ? (
          <>
            <Text style={[s.muted, { fontSize: 14, lineHeight: 20, paddingHorizontal: 24, paddingTop: 18, paddingBottom: 8 }]}>Этих по имени не понять — выбери сам, это секунда:</Text>
            <View style={{ marginHorizontal: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline, borderRadius: 20, overflow: 'hidden' }}>
              {ask.map((f, i) => (
                <View key={f.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: colors.separator }}>
                  <Avatar friend={f} size={36} />
                  <Text style={[s.body, { flex: 1 }]} numberOfLines={1}>
                    {f.name}
                  </Text>
                  {(['f', 'm'] as const).map((g) => {
                    const on = f.gender === g;
                    const t = tone(g);
                    return (
                      <Pressable
                        key={g}
                        onPress={() => onPick(f, g)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        accessibilityLabel={`${f.name}: ${g === 'f' ? 'женщина' : 'мужчина'}`}
                        hitSlop={4}
                        style={({ pressed }) => ({
                          minWidth: 40,
                          paddingHorizontal: 12,
                          paddingVertical: 7,
                          borderRadius: 999,
                          alignItems: 'center',
                          backgroundColor: on ? t.bg : 'transparent',
                          borderWidth: 1,
                          borderColor: on ? t.ring : colors.hairline,
                          opacity: pressed ? 0.7 : 1,
                        })}
                      >
                        <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: on ? t.fg : colors.text2 }}>{g === 'f' ? 'Ж' : 'М'}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          </>
        ) : (
          <Text style={[s.muted, { fontSize: 14, lineHeight: 20, paddingHorizontal: 24, paddingTop: 18 }]}>Пол определён у всех — к 8 Марта и 23 Февраля всё готово.</Text>
        )}
        <Text style={[s.caption, { paddingHorizontal: 24, paddingTop: 14, lineHeight: 17 }]}>Новых друзей определю сам, в фоне. Выбранное тобой — главнее, его я не трогаю.</Text>
      </ScrollView>
      <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: bottom + 16 }}>
        <Button title="Готово" onPress={() => router.back()} />
      </View>
    </Animated.View>
  );
}
