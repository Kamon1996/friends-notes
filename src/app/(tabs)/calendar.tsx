import { router } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Avatar } from '@/components/Avatar';
import { KindBadge, KindIcon, useKindColors } from '@/components/CalendarIcons';
import { Icon } from '@/components/Icon';
import { settleDuration } from '@/components/settle';
import { Sheet, SheetHandle } from '@/components/Sheet';
import { TabSwipe } from '@/components/TabSwipe';
import { Fab, Group, IconButton, ListRow, ScreenHeader, Tag, useTheme } from '@/components/ui';
import { MONTHS, MONTHS_IN, WEEKDAYS_MON, calendarEvents, monthCounts, monthGrid, monthRange, nextEvents, type CalendarEvent } from '@/lib/calendar';
import { daysBetween, formatDateLong, parseISODate, plural, relativeDay, todayISO } from '@/lib/dates';
import { holidayCountries, holidayCountry } from '@/lib/holidays';
import { useStore } from '@/lib/store';

interface CalView {
  year: number;
  month: number;
  /** Выбранный день. */
  selected: string;
}

/** Месяц по номеру (год·12 + месяц): выбранным становится сегодня, если оно там, иначе первое число. */
function monthView(k: number): CalView {
  const today = todayISO();
  const year = Math.floor(k / 12);
  const month = ((k % 12) + 12) % 12;
  const [a, b] = monthRange(year, month);
  return { year, month, selected: today >= a && today <= b ? today : a };
}

function atDay(date: string): CalView {
  const d = parseISODate(date);
  return { year: d.getFullYear(), month: d.getMonth(), selected: date };
}

/**
 * Календарь: месяц карточкой — название, дни недели и числа листаются пальцем вместе; название — кнопка выбора
 * месяца и года, «↶ Сегодня» — когда ушли от сегодня. Под днём — значки событий, праздники — красным числом; внизу
 * карточки — обозначения со счётчиками (можно скрыть). Ниже — что в выбранный день и что дальше. События — дни
 * рождения, годовщины и важные даты друзей, дела-встречи, праздники выбранных стран.
 */
export default function CalendarScreen() {
  const { data, updateSettings } = useStore();
  const { s } = useTheme();
  const today = todayISO();
  const [view, setView] = useState<CalView>(() => atDay(today));
  const [picking, setPicking] = useState(false);
  const { selected } = view;
  const cur = view.year * 12 + view.month;

  // События сразу для соседних месяцев: их сетки видны, пока листаешь.
  const span = useMemo(() => [monthGrid(view.year, view.month - 1)[0], monthGrid(view.year, view.month + 1)[41]] as const, [view.year, view.month]);
  const events = useMemo(() => calendarEvents(data, span[0], span[1]), [data, span]);
  const byDay = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const e of events) m.set(e.date, [...(m.get(e.date) ?? []), e]);
    return m;
  }, [events]);
  const [monthFrom, monthTo] = monthRange(view.year, view.month);
  const inMonth = events.filter((e) => e.date >= monthFrom && e.date <= monthTo).length;
  const counts = useMemo(() => monthCounts(events, monthFrom, monthTo), [events, monthFrom, monthTo]);
  const dayEvents = byDay.get(selected) ?? [];
  const later = useMemo(() => nextEvents(data, selected, 5), [data, selected]);
  const withHolidays = holidayCountries(data.settings).length > 0;
  const legend = data.settings.calendarLegend !== false;

  // Показать месяц k (жест, выбор месяца, диктор). Уже он — ничего не трогаем: выбранный день остаётся.
  const show = (k: number) => setView((v) => (v.year * 12 + v.month === k ? v : monthView(k)));
  const goToday = () => setView(atDay(today));
  const pick = (date: string) => setView(atDay(date));
  const awayFromToday = selected !== today;

  return (
    <TabSwipe tab="/calendar">
      <View style={s.screen}>
        <ScrollView style={s.screen} contentContainerStyle={{ paddingBottom: 120 }}>
          <ScreenHeader
            title="Календарь"
            subtitle={
              inMonth ? `В ${MONTHS_IN[view.month]} — ${inMonth} ${plural(inMonth, 'событие', 'события', 'событий')}` : `В ${MONTHS_IN[view.month]} событий нет`
            }
            right={
              <>
                {/* Праздники каких стран показывать. */}
                <IconButton icon="flag" label="Праздники стран" onPress={() => router.push('/holidays')} />
                <IconButton icon="sliders" label="Настройки" onPress={() => router.push('/settings')} />
              </>
            }
          />

          <View style={[s.group, { marginHorizontal: 20, marginTop: 14, paddingTop: 10, paddingBottom: legend ? 0 : 6 }]}>
            <MonthCarousel
              cur={cur}
              onShow={show}
              render={(k, active) => (
                <MonthPage
                  k={k}
                  active={active}
                  onTitle={() => setPicking(true)}
                  onStep={(d) => show(k + d)}
                  grid={<MonthGrid year={Math.floor(k / 12)} month={((k % 12) + 12) % 12} selected={selected} today={today} byDay={byDay} onPick={pick} />}
                />
              )}
            />
            {/* «↶ Сегодня» стоит на месте, пока месяц едет под ним. */}
            {awayFromToday && <TodayPill onPress={goToday} />}
            {legend && <Legend month={view.month} counts={counts} holidays={withHolidays} onHide={() => updateSettings({ calendarLegend: false })} />}
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
        <MonthPicker visible={picking} k={cur} onPick={(k) => show(k)} onClose={() => setPicking(false)} />
      </View>
    </TabSwipe>
  );
}

/** Высоты страницы месяца: название, дни недели, шесть недель по 56 px. */
const TITLE_H = 40;
const WEEK_H = 24;
const PAGE_H = TITLE_H + WEEK_H + 6 * 56;

/**
 * Месяцы каруселью: страница — месяц целиком (название, дни недели, числа); соседние стоят слева и справа и едут за
 * пальцем. Отпустил дальше четверти ширины (или быстро) — страница доезжает на UI-потоке со скоростью пальца, и
 * только потом календарь пересчитывает месяц: перерисовка не мешает движению. Выбор месяца, «Сегодня», диктор —
 * тоже сюда: на соседний месяц — пролистыванием, дальше — сразу.
 */
function MonthCarousel({ cur, onShow, render }: { cur: number; onShow: (k: number) => void; render: (k: number, active: boolean) => ReactNode }) {
  const [base] = useState(cur);
  const [w, setW] = useState(0);
  const x = useSharedValue(0);
  // Месяц, к которому карусель едет или на котором стоит.
  const shown = useSharedValue(cur);
  useEffect(() => {
    if (!w || shown.get() === cur) return;
    const far = Math.abs(cur - shown.get()) > 1;
    shown.set(cur);
    const target = -(cur - base) * w;
    x.set(far ? target : withTiming(target, { duration: 280, easing: Easing.out(Easing.cubic) }));
  }, [cur, base, w, x, shown]);
  useEffect(() => {
    x.set(-(shown.get() - base) * w);
  }, [w, base, x, shown]);
  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      'worklet';
      x.set(-(shown.get() - base) * w + e.translationX);
    })
    .onEnd((e, success) => {
      'worklet';
      // Жест отменён (перехватил другой) — месяц не меняем.
      const d = !success ? 0 : e.translationX < -w / 4 || e.velocityX < -500 ? 1 : e.translationX > w / 4 || e.velocityX > 500 ? -1 : 0;
      const next = shown.get() + d;
      const target = -(next - base) * w;
      const easing = Easing.out(Easing.cubic);
      const duration = settleDuration(target - x.get(), e.velocityX);
      if (!d) {
        x.set(withTiming(target, { duration, easing }));
        return;
      }
      shown.set(next);
      // Месяц в календаре меняем, когда страница доехала (или её перебили новым свайпом).
      x.set(withTiming(target, { duration, easing }, () => scheduleOnRN(onShow, next)));
    });
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  return (
    <GestureDetector gesture={pan}>
      <View style={{ height: PAGE_H, overflow: 'hidden' }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        {/* Три месяца лежат внутри ряда шириной 3w, который сдвигается вместе с текущим месяцем: видимая страница всегда
            в границах ряда — на Android нажатия за границами родителя могут не доходить. */}
        <Animated.View style={[{ position: 'absolute', top: 0, height: PAGE_H, left: (cur - 1 - base) * w, width: 3 * w }, style]}>
          {w > 0 &&
            [cur - 1, cur, cur + 1].map((k) => (
              <View
                key={k}
                style={{ position: 'absolute', top: 0, height: PAGE_H, left: (k - cur + 1) * w, width: w }}
                aria-hidden={k !== cur}
                importantForAccessibility={k === cur ? 'auto' : 'no-hide-descendants'}
                accessibilityElementsHidden={k !== cur}
              >
                {render(k, k === cur)}
              </View>
            ))}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

/** Страница месяца: название-кнопка («Ноябрь 2026 ▾» — выбор месяца), дни недели и сетка. */
function MonthPage({ k, active, onTitle, onStep, grid }: { k: number; active: boolean; onTitle: () => void; onStep: (d: number) => void; grid: ReactNode }) {
  const { colors, fonts } = useTheme();
  const year = Math.floor(k / 12);
  const month = ((k % 12) + 12) % 12;
  return (
    <View style={{ paddingHorizontal: 8 }}>
      <View style={{ height: TITLE_H, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6 }}>
        <Pressable
          onPress={onTitle}
          disabled={!active}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`${MONTHS[month]} ${year}`}
          accessibilityHint="Выбрать месяц и год"
          // Без стрелок: диктор листает месяцы жестом вверх-вниз по названию.
          accessibilityActions={[
            { name: 'increment', label: 'Следующий месяц' },
            { name: 'decrement', label: 'Прошлый месяц' },
          ]}
          onAccessibilityAction={(e) => onStep(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 4, opacity: pressed ? 0.6 : 1 })}
        >
          <Text style={{ fontFamily: fonts.display, fontSize: 20, color: colors.text }} numberOfLines={1}>
            {MONTHS[month]} {year}
          </Text>
          <Icon name="chevronDown" size={18} color={colors.text2} strokeWidth={2.2} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', height: WEEK_H }}>
        {WEEKDAYS_MON.map((w, i) => (
          <Text key={w} style={{ flex: 1, textAlign: 'center', fontFamily: fonts.medium, fontSize: 12, color: i >= 5 ? colors.text3 : colors.text2 }}>
            {w}
          </Text>
        ))}
      </View>
      {grid}
    </View>
  );
}

/** Пилюля «↶ Сегодня» — в правом верхнем углу карточки, поверх листаемых месяцев. */
function TodayPill({ onPress }: { onPress: () => void }) {
  const { colors, fonts } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Вернуться к сегодня"
      style={({ pressed }) => ({
        position: 'absolute',
        top: 14,
        right: 14,
        zIndex: 2,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: colors.soft,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 6,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Icon name="undo" size={14} color={colors.accentText} strokeWidth={2.2} />
      <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: colors.accentText }}>Сегодня</Text>
    </Pressable>
  );
}

/** Обозначения внизу карточки: сетка 2×2 — значок, что это и сколько в месяце; «Скрыть» убирает (вернуть — в настройках). */
function Legend({ month, counts, holidays, onHide }: { month: number; counts: Record<CalendarEvent['kind'], number>; holidays: boolean; onHide: () => void }) {
  const { s, colors, fonts } = useTheme();
  const items: [CalendarEvent['kind'], string][] = [
    ['birthday', 'Дни рождения'],
    ['date', 'Важные даты'],
    ['meeting', 'Встречи'],
    ...(holidays ? ([['holiday', 'Праздники']] as [CalendarEvent['kind'], string][]) : []),
  ];
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: colors.separator, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, marginTop: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
        <Text style={[s.sectionLabel, { flex: 1, paddingHorizontal: 0 }]}>В {MONTHS_IN[month]}</Text>
        <Pressable onPress={onHide} hitSlop={10} accessibilityRole="button" accessibilityLabel="Скрыть обозначения">
          <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: colors.accentText }}>Скрыть</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {items.map(([kind, label]) => (
          <View key={kind} style={{ width: '50%', flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5, paddingRight: 14 }}>
            <View style={{ width: 16, alignItems: 'center' }}>
              {/* Праздник — листок «красный день календаря», как в списке дня. */}
              <KindIcon kind={kind} size={15} />
            </View>
            <Text style={{ flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.text }} numberOfLines={1}>
              {label}
            </Text>
            <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: colors.text3, fontVariant: ['tabular-nums'] }}>{counts[kind]}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Выбор месяца: год стрелками, месяцы сеткой 3×4. Текущий — акцентом, месяц «сегодня» — мягкой заливкой. */
function MonthPicker({ visible, k, onPick, onClose }: { visible: boolean; k: number; onPick: (k: number) => void; onClose: () => void }) {
  const { colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  const [year, setYear] = useState(Math.floor(k / 12));
  const [openedFor, setOpenedFor] = useState<number | null>(null);
  // Открыли заново — год того месяца, что сейчас на экране.
  if (visible && openedFor !== k) {
    setOpenedFor(k);
    setYear(Math.floor(k / 12));
  }
  if (!visible && openedFor !== null) setOpenedFor(null);
  const now = parseISODate(todayISO());
  const nowK = now.getFullYear() * 12 + now.getMonth();
  return (
    <Sheet visible={visible} onClose={onClose} style={{ paddingTop: 10, paddingBottom: insets.bottom + 18, paddingHorizontal: 16 }}>
      <SheetHandle />
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 10, paddingBottom: 8 }}>
        <IconButton icon="chevronLeft" label="Прошлый год" onPress={() => setYear((y) => y - 1)} />
        <Text style={{ flex: 1, textAlign: 'center', fontFamily: fonts.display, fontSize: 22, color: colors.text }} accessibilityRole="header">
          {year}
        </Text>
        <IconButton icon="chevronRight" label="Следующий год" onPress={() => setYear((y) => y + 1)} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {MONTHS.map((name, m) => {
          const key = year * 12 + m;
          const isCur = key === k;
          const isNow = key === nowK;
          return (
            <View key={m} style={{ width: '33.333%', padding: 4 }}>
              <Pressable
                onPress={() => {
                  onPick(key);
                  onClose();
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: isCur }}
                accessibilityLabel={`${name} ${year}`}
                style={({ pressed }) => ({
                  height: 46,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isCur ? colors.accent : isNow ? colors.soft : colors.chip,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text
                  style={{
                    fontFamily: isCur || isNow ? fonts.semibold : fonts.medium,
                    fontSize: 15,
                    color: isCur ? colors.onAccent : isNow ? colors.accentText : colors.text,
                  }}
                >
                  {name}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </Sheet>
  );
}

/** Сетка одного месяца: дни кружками, сегодня и выбранный — с заливкой, праздник — красным числом, под днём — значки событий. */
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
  const red = useKindColors().holiday[0];
  const days = monthGrid(year, month);
  // Неделя — отдельной строкой из семи клеток flex: 1. Не перенос по ширине 1/7: на Android сумма семи округлённых
  // «14,2857 %» бывала шире ряда, в строку влезало шесть дней, и числа съезжали со своих дней недели.
  return (
    <View>
      {Array.from({ length: 6 }, (_, week) => (
        <View key={week} style={{ flexDirection: 'row' }}>
          {days.slice(week * 7, week * 7 + 7).map((date) => {
            const d = parseISODate(date);
            const own = d.getMonth() === month;
            const isToday = date === today;
            const isSel = date === selected && own;
            const list = byDay.get(date) ?? [];
            const kinds = GRID_ORDER.filter((k) => list.some((e) => e.kind === k));
            // Праздник — «красный день календаря»: само число красное, значка нет — место под днём остаётся своим событиям.
            const holiday = list.some((e) => e.kind === 'holiday');
            return (
              <Pressable
                key={date}
                onPress={() => onPick(date)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSel }}
                accessibilityLabel={`${formatDateLong(date)}${isToday ? ', сегодня' : ''}${list.length ? `, ${list.length} ${plural(list.length, 'событие', 'события', 'событий')}` : ''}`}
                style={{ flex: 1, height: 56, alignItems: 'center', paddingTop: 4 }}
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
                      fontFamily: isSel || isToday || holiday ? fonts.semibold : fonts.body,
                      fontSize: 16,
                      fontVariant: ['tabular-nums'],
                      color: isSel ? colors.onAccent : holiday ? red : isToday ? colors.accentText : own ? colors.text : colors.text3,
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
      ))}
    </View>
  );
}

/** Значки под днём — по порядку; праздник значком не отмечаем: он — красным числом. */
const GRID_ORDER = ['birthday', 'date', 'meeting'] as const;

/** Строка события: аватар (у встречи без друга — часы), что за событие, когда. Нажатие — к другу или к делу. */
function EventRow({ event: e, today }: { event: CalendarEvent; today: string }) {
  const { colors } = useTheme();
  const diff = daysBetween(today, e.date);
  const when = relativeDay(e.date, today);
  const tag = <Tag text={when} tone={diff === 0 ? 'solid' : diff > 0 && diff <= 7 ? 'accent' : 'neutral'} />;
  if (e.kind === 'holiday') {
    const where = e.holidays.map((h) => holidayCountry(h.country)).filter((c) => c !== undefined);
    const estimated = e.holidays.some((h) => h.estimated);
    return (
      <ListRow
        onPress={() =>
          router.push({
            pathname: '/holiday',
            params: {
              id: e.holidays[0].id,
              date: e.date,
              also: e.holidays
                .slice(1)
                .map((h) => h.id)
                .join(','),
            },
          })
        }
        leading={
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center' }}>
            <KindIcon kind="holiday" size={20} strokeWidth={2} />
          </View>
        }
        title={e.name}
        subtitle={`${where.map((c) => `${c.flag} ${c.name}`).join(' · ')}${estimated ? ' · дата примерная' : ''}`}
        trailing={tag}
      />
    );
  }
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
