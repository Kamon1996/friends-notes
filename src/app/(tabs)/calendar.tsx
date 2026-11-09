import { router } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { Avatar } from '@/components/Avatar';
import { useSvgId } from '@/components/ai/AiIcon';
import { Icon } from '@/components/Icon';
import { TabSwipe } from '@/components/TabSwipe';
import { Fab, Group, IconButton, ListRow, ScreenHeader, Tag, useTheme } from '@/components/ui';
import { MONTHS, MONTHS_IN, WEEKDAYS_MON, calendarEvents, monthGrid, monthRange, nextEvents, type CalendarEvent } from '@/lib/calendar';
import { daysBetween, formatDateLong, parseISODate, plural, relativeDay, todayISO } from '@/lib/dates';
import { useStore } from '@/lib/store';

interface CalView {
  year: number;
  month: number;
  /** Выбранный день. */
  selected: string;
}

/** Соседний месяц: выбранным становится сегодня, если оно там, иначе первое число. */
function stepMonth(v: CalView, delta: number): CalView {
  const today = todayISO();
  const d = new Date(v.year, v.month + delta, 1);
  const [a, b] = monthRange(d.getFullYear(), d.getMonth());
  return { year: d.getFullYear(), month: d.getMonth(), selected: today >= a && today <= b ? today : a };
}

function atDay(date: string): CalView {
  const d = parseISODate(date);
  return { year: d.getFullYear(), month: d.getMonth(), selected: date };
}

/**
 * Цвета значков событий: торт — градиент от персика к розе (линия тоньше), сердце — пыльная роза,
 * встречи — спокойный голубой. В светлой теме — те же оттенки темнее, чтобы читались на бумаге.
 */
const KIND_PALETTE = {
  dark: { birthday: ['#FFB089', '#F0708C'], date: ['#E45D7B'], meeting: ['#86B6E0'] },
  light: { birthday: ['#E07F55', '#C94A6B'], date: ['#C2405F'], meeting: ['#3F78AE'] },
} as const;

function useKindColors() {
  const { scheme } = useTheme();
  return KIND_PALETTE[scheme === 'dark' ? 'dark' : 'light'];
}

/** Значок события: цвет или градиент из палитры. */
function KindIcon({ kind, size, strokeWidth }: { kind: CalendarEvent['kind']; size: number; strokeWidth?: number }) {
  const stops = useKindColors()[kind];
  // Торт — тоньше: так он читается легче остальных значков.
  strokeWidth ??= kind === 'birthday' ? 1.6 : 2.2;
  return <Icon name={KIND_ICON[kind]} size={size} strokeWidth={strokeWidth} color={stops[stops.length - 1]} gradient={stops.length > 1 ? stops : undefined} />;
}

/**
 * Календарь: месяц сеткой (стрелки и «Сегодня»; свайп по экрану — соседние вкладки), в днях — точки событий; ниже — что в выбранный день и что дальше. События — дни рождения,
 * годовщины и важные даты друзей, дела «на дату и время». Дела «до срока» и повторяющиеся — в «Напоминаниях».
 */
export default function CalendarScreen() {
  const { data } = useStore();
  const { s, colors, fonts } = useTheme();
  const today = todayISO();
  const [view, setView] = useState<CalView>(() => atDay(today));
  const { selected } = view;

  // События сразу для соседних месяцев: их сетки видны, пока листаешь.
  const span = useMemo(() => [monthGrid(view.year, view.month - 1)[0], monthGrid(view.year, view.month + 1)[41]] as const, [view]);
  const events = useMemo(() => calendarEvents(data, span[0], span[1]), [data, span]);
  const byDay = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const e of events) m.set(e.date, [...(m.get(e.date) ?? []), e]);
    return m;
  }, [events]);
  const [monthFrom, monthTo] = monthRange(view.year, view.month);
  const inMonth = events.filter((e) => e.date >= monthFrom && e.date <= monthTo).length;
  const dayEvents = byDay.get(selected) ?? [];
  const later = useMemo(() => nextEvents(data, selected, 5), [data, selected]);

  const go = (delta: number) => setView((v) => stepMonth(v, delta));
  const goToday = () => setView(atDay(today));
  const pick = (date: string) => setView(atDay(date));

  const isCurrent = view.year === parseISODate(today).getFullYear() && view.month === parseISODate(today).getMonth();
  const cellW = `${100 / 7}%` as const;

  return (
    <TabSwipe tab="/calendar">
      <View style={s.screen}>
        <ScrollView style={s.screen} contentContainerStyle={{ paddingBottom: 120 }}>
          <ScreenHeader
            title="Календарь"
            subtitle={
              inMonth ? `В ${MONTHS_IN[view.month]} — ${inMonth} ${plural(inMonth, 'событие', 'события', 'событий')}` : `В ${MONTHS_IN[view.month]} событий нет`
            }
            right={<IconButton icon="sliders" label="Настройки" onPress={() => router.push('/settings')} />}
          />

          <View style={[s.group, { marginHorizontal: 20, marginTop: 14, paddingHorizontal: 8, paddingTop: 10, paddingBottom: 8 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, marginBottom: 6 }}>
              <Text style={{ flex: 1, fontFamily: fonts.display, fontSize: 20, color: colors.text }} accessibilityRole="header">
                {MONTHS[view.month]} {view.year}
              </Text>
              {(!isCurrent || selected !== today) && (
                // Пилюля «↶ Сегодня» — видно, что это кнопка и куда она вернёт.
                <Pressable
                  onPress={goToday}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Вернуться к сегодня"
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                    backgroundColor: colors.soft,
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    marginRight: 4,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Icon name="undo" size={14} color={colors.accentText} strokeWidth={2.2} />
                  <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: colors.accentText }}>Сегодня</Text>
                </Pressable>
              )}
              <IconButton icon="chevronLeft" label="Прошлый месяц" onPress={() => go(-1)} />
              <IconButton icon="chevronRight" label="Следующий месяц" onPress={() => go(1)} />
            </View>
            <View style={{ flexDirection: 'row' }}>
              {WEEKDAYS_MON.map((w, i) => (
                <Text
                  key={w}
                  style={{
                    width: cellW,
                    textAlign: 'center',
                    fontFamily: fonts.medium,
                    fontSize: 12,
                    color: i >= 5 ? colors.text3 : colors.text2,
                    paddingBottom: 6,
                  }}
                >
                  {w}
                </Text>
              ))}
            </View>
            <MonthCarousel
              year={view.year}
              month={view.month}
              onStep={go}
              render={(y, m) => <MonthGrid year={y} month={m} selected={selected} today={today} byDay={byDay} onPick={pick} />}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 14, paddingTop: 6 }}>
              {(
                [
                  ['birthday', 'Дни рождения'],
                  ['date', 'Важные даты'],
                  ['meeting', 'Встречи'],
                ] as const
              ).map(([k, label]) => (
                <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <KindIcon kind={k} size={13} />
                  <Text style={[s.caption, { fontSize: 12 }]}>{label}</Text>
                </View>
              ))}
            </View>
          </View>

          <Text style={[s.sectionLabel, { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 8 }]}>
            {formatDateLong(selected)}
            {selected === today ? ' · сегодня' : ''}
          </Text>
          {dayEvents.length ? (
            <View style={{ paddingHorizontal: 20 }}>
              <Group>
                {dayEvents.map((e) => (
                  <EventRow key={e.key} event={e} today={today} />
                ))}
              </Group>
            </View>
          ) : (
            <Text style={[s.muted, { paddingHorizontal: 24 }]}>В этот день ничего нет.</Text>
          )}

          {later.length > 0 && (
            <>
              <Text style={[s.sectionLabel, { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 8 }]}>Дальше</Text>
              <View style={{ paddingHorizontal: 20 }}>
                <Group>
                  {later.map((e) => (
                    <EventRow key={e.key} event={e} today={today} />
                  ))}
                </Group>
              </View>
            </>
          )}

          {data.friends.length === 0 && (
            <Text style={[s.muted, { paddingHorizontal: 24, paddingTop: 16 }]}>Добавь друзей с днями рождения — они появятся в календаре сами.</Text>
          )}
        </ScrollView>
        {/* Новое событие — на выбранный день, «Дата и время», сразу в календаре. */}
        <Fab label="Новое событие" onPress={() => router.push({ pathname: '/reminder/edit', params: { date: selected, kind: 'at', calendar: '1' } })} />
      </View>
    </TabSwipe>
  );
}

/** Высота сетки месяца: шесть недель по 56 px. */
const GRID_H = 6 * 56;

/**
 * Месяцы каруселью: соседние месяцы стоят слева и справа, сетка едет за пальцем; отпустил дальше четверти ширины
 * (или быстро) — перелистнулось. Стрелки и «Сегодня» листают так же; прыжок дальше соседнего месяца — сразу, без
 * пролистывания. Жест сетки срабатывает раньше листания вкладок, поэтому внутри сетки листаются месяцы.
 */
function MonthCarousel({
  year,
  month,
  onStep,
  render,
}: {
  year: number;
  month: number;
  onStep: (delta: number) => void;
  render: (y: number, m: number) => ReactNode;
}) {
  const cur = year * 12 + month;
  const [base] = useState(cur);
  const [w, setW] = useState(0);
  const x = useSharedValue(0);
  const shown = useSharedValue(cur);
  useEffect(() => {
    if (!w) return;
    const target = -(cur - base) * w;
    const far = Math.abs(cur - shown.get()) > 1;
    shown.set(cur);
    x.set(far ? target : withTiming(target, { duration: 260, easing: Easing.out(Easing.cubic) }));
  }, [cur, base, w, x, shown]);
  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      'worklet';
      x.set(-(shown.get() - base) * w + e.translationX);
    })
    .onEnd((e) => {
      'worklet';
      const d = e.translationX < -w / 4 || e.velocityX < -500 ? 1 : e.translationX > w / 4 || e.velocityX > 500 ? -1 : 0;
      if (d) scheduleOnRN(onStep, d);
      else x.set(withTiming(-(shown.get() - base) * w, { duration: 200, easing: Easing.out(Easing.cubic) }));
    });
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  return (
    <GestureDetector gesture={pan}>
      <View style={{ height: GRID_H, overflow: 'hidden' }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        <Animated.View style={[StyleSheet.absoluteFill, style]}>
          {w > 0 &&
            [cur - 1, cur, cur + 1].map((k) => (
              <View
                key={k}
                style={{ position: 'absolute', top: 0, height: GRID_H, left: (k - base) * w, width: w }}
                aria-hidden={k !== cur}
                importantForAccessibility={k === cur ? 'auto' : 'no-hide-descendants'}
                accessibilityElementsHidden={k !== cur}
              >
                {render(Math.floor(k / 12), ((k % 12) + 12) % 12)}
              </View>
            ))}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

/** Сетка одного месяца: дни кружками, сегодня и выбранный — с заливкой, под днём — значки событий. */
function MonthGrid({
  year,
  month,
  selected,
  today,
  byDay,
  onPick,
}: {
  year: number;
  month: number;
  selected: string;
  today: string;
  byDay: Map<string, CalendarEvent[]>;
  onPick: (date: string) => void;
}) {
  const { colors, fonts } = useTheme();
  const cellW = `${100 / 7}%` as const;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {monthGrid(year, month).map((date) => {
        const d = parseISODate(date);
        const own = d.getMonth() === month;
        const isToday = date === today;
        const isSel = date === selected && own;
        const list = byDay.get(date) ?? [];
        const kinds = [...new Set(list.map((e) => e.kind))];
        return (
          <Pressable
            key={date}
            onPress={() => onPick(date)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSel }}
            accessibilityLabel={`${formatDateLong(date)}${isToday ? ', сегодня' : ''}${list.length ? `, ${list.length} ${plural(list.length, 'событие', 'события', 'событий')}` : ''}`}
            style={{ width: cellW, height: 56, alignItems: 'center', paddingTop: 4 }}
          >
            <View style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}>
              {/* Кружок — отдельным видом и заново при смене вида: на Android смена фона у вида со скруглением
                  теряла скругление, и выбранный день становился квадратом. */}
              {(isSel || isToday) && (
                <View
                  key={isSel ? 'sel' : 'today'}
                  style={{ position: 'absolute', width: 34, height: 34, borderRadius: 17, backgroundColor: isSel ? colors.accent : colors.soft }}
                />
              )}
              <Text
                style={{
                  fontFamily: isSel || isToday ? fonts.semibold : fonts.body,
                  fontSize: 16,
                  fontVariant: ['tabular-nums'],
                  color: isSel ? colors.onAccent : isToday ? colors.accentText : own ? colors.text : colors.text3,
                  opacity: own ? 1 : 0.6,
                }}
              >
                {d.getDate()}
              </Text>
            </View>
            {/* Значки — сразу под кружком дня, с зазором: кружок 4…38, значки 42…55. */}
            <View style={{ position: 'absolute', top: 42, flexDirection: 'row', gap: 3, height: 13, opacity: own ? 1 : 0.5 }}>
              {kinds.map((k) => (
                <KindIcon key={k} kind={k} size={13} />
              ))}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Значок события — в днях месяца, в подписи под ним и на аватаре в списке (набор «Линии»). Праздникам — флажок. */
const KIND_ICON = { birthday: 'cake', date: 'heart', meeting: 'clock' } as const;

/** Значок типа события в углу аватара: кружок цвета события (у дня рождения — градиентом) с белым значком. */
function KindBadge({ kind }: { kind: CalendarEvent['kind'] }) {
  const { colors } = useTheme();
  const stops = useKindColors()[kind];
  const id = useSvgId('badge');
  return (
    <View style={{ position: 'absolute', right: -3, bottom: -3, width: 18, height: 18, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={18} height={18} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={id} x1="2" y1="2" x2="16" y2="16" gradientUnits="userSpaceOnUse">
            {stops.map((c, i) => (
              <Stop key={i} offset={i / Math.max(1, stops.length - 1)} stopColor={c} />
            ))}
          </LinearGradient>
        </Defs>
        <Circle cx={9} cy={9} r={8} fill={`url(#${id})`} stroke={colors.card} strokeWidth={2} />
      </Svg>
      {/* Значок — поверх кружка (на вебе абсолютный кружок иначе ложится сверху). */}
      <View style={{ zIndex: 1 }}>
        <Icon name={KIND_ICON[kind]} size={9} color="#FFFFFF" strokeWidth={2.6} />
      </View>
    </View>
  );
}

/** Строка события: аватар (у встречи без друга — часы), что за событие, когда. Нажатие — к другу или к делу. */
function EventRow({ event: e, today }: { event: CalendarEvent; today: string }) {
  const { colors } = useTheme();
  const diff = daysBetween(today, e.date);
  const when = relativeDay(e.date, today);
  const tag = <Tag text={when} tone={diff === 0 ? 'solid' : diff > 0 && diff <= 7 ? 'accent' : 'neutral'} />;
  if (e.kind === 'meeting') {
    const r = e.reminder;
    // У повторяющегося «сделано» — только этот раз.
    const done = r.done && (!r.repeat || e.date === r.date);
    return (
      <ListRow
        onPress={() => router.push({ pathname: '/reminder/edit', params: { id: r.id } })}
        leading={
          e.friend ? (
            <View>
              <Avatar friend={e.friend} size={40} />
              <KindBadge kind="meeting" />
            </View>
          ) : (
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center' }}>
              <KindIcon kind="meeting" size={20} strokeWidth={2} />
            </View>
          )
        }
        title={r.title}
        titleStyle={done ? { textDecorationLine: 'line-through', color: colors.text3 } : undefined}
        subtitle={`${r.time}${e.friend ? ` · ${e.friend.name}` : ''}${done ? ' · сделано' : ''}`}
        trailing={tag}
      />
    );
  }
  const f = e.friend;
  const what =
    e.kind === 'birthday'
      ? `День рождения${e.age ? ` · ${e.age} ${plural(e.age, 'год', 'года', 'лет')}` : ''}`
      : `${e.title}${e.years ? ` · ${e.years} ${plural(e.years, 'год', 'года', 'лет')}` : ''}`;
  return (
    <ListRow
      onPress={() => router.push({ pathname: '/friend/[id]', params: { id: f.id } })}
      leading={
        <View>
          <Avatar friend={f} size={40} />
          <KindBadge kind={e.kind} />
        </View>
      }
      title={f.name}
      subtitle={what}
      trailing={tag}
    />
  );
}
