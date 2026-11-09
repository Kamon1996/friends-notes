import { router, useIsFocused } from 'expo-router';
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { BackHandler, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Avatar } from '@/components/Avatar';
import { KindBadge, KindIcon, useKindColors } from '@/components/CalendarIcons';
import { Icon } from '@/components/Icon';
import { settleDuration } from '@/components/settle';
import { Sheet, SheetHandle } from '@/components/Sheet';
import { TabSwipe } from '@/components/TabSwipe';
import { Button, Fab, Group, IconButton, ListRow, ScreenHeader, Tag, useTheme } from '@/components/ui';
import { MONTHS, MONTHS_IN, WEEKDAYS_MON, calendarEvents, monthCounts, monthGrid, monthRange, nextEvents, type CalendarEvent } from '@/lib/calendar';
import { addInterval, daysBetween, formatDate, formatDateLong, parseISODate, plural, relativeDay, todayISO } from '@/lib/dates';
import { formatHolidayDays, holidayCountries, holidayCountry, holidayDatesInYear } from '@/lib/holidays';
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
 * месяца и года, «↶ Сегодня» — когда ушли от сегодня. События дня — цветными точками в углу числа, праздники —
 * красным числом; внизу карточки — обозначения со счётчиками (можно скрыть). Нажал на день с событиями — снизу
 * шторка с ними (календарь над ней живой: другой день — другое содержимое, пустой — шторка закрылась). Ниже —
 * ближайшие события. События — дни рождения, годовщины и важные даты друзей, дела-встречи, праздники стран.
 */
export default function CalendarScreen() {
  const { data, updateSettings } = useStore();
  const { s } = useTheme();
  const today = todayISO();
  const [view, setView] = useState<CalView>(() => atDay(today));
  const [picking, setPicking] = useState(false);
  // Подробности дня: какой день раскрыт (null — ничего) и какой был раскрыт последним — его показываем, пока
  // шторка или «гармошка» закрываются. Как показывать — в настройках: шторкой снизу или внутри календаря.
  const [opened, setOpened] = useState<string | null>(null);
  const [lastOpened, setLastOpened] = useState<string | null>(null);
  const inline = data.settings.calendarDayView === 'inline';
  const focused = useIsFocused();
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
  const openEvents = useMemo(() => (lastOpened ? (byDay.get(lastOpened) ?? []) : []), [byDay, lastOpened]);
  const isOpen = opened !== null && openEvents.length > 0;
  // «Гармошка»: высота раскрытой панели — на неё растёт карусель месяцев; меняется плавно.
  const panelH = useSharedValue(0);
  const [panelContentH, setPanelContentH] = useState(0);
  useEffect(() => {
    panelH.set(withTiming(inline && isOpen ? panelContentH : 0, { duration: 260, easing: Easing.out(Easing.cubic) }));
  }, [inline, isOpen, panelContentH, panelH]);
  // Ближайшие — начиная с выбранного дня (сегодняшний день рождения — первым).
  const later = useMemo(() => nextEvents(data, addInterval(selected, 'day', -1), 5), [data, selected]);
  const withHolidays = holidayCountries(data.settings).length > 0;
  const legend = data.settings.calendarLegend !== false;

  // Показать месяц k (жест, выбор месяца, диктор). Уже он — ничего не трогаем: выбранный день остаётся.
  const show = (k: number) => {
    setView((v) => (v.year * 12 + v.month === k ? v : monthView(k)));
    setOpened(null);
  };
  const goToday = () => {
    setView(atDay(today));
    setOpened(null);
  };
  // Нажал на день: есть события — подробности с ними (или сменили содержимое), тот же день ещё раз или пустой день —
  // закрылись.
  const pick = (date: string) => {
    setView(atDay(date));
    const has = (byDay.get(date) ?? []).length > 0;
    setOpened((o) => (has && o !== date ? date : null));
    if (has) setLastOpened(date);
  };
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
              extra={panelH}
              onShow={show}
              render={(k, active) => (
                <MonthPage
                  k={k}
                  active={active}
                  onTitle={() => setPicking(true)}
                  onStep={(d) => show(k + d)}
                  grid={
                    <MonthGrid
                      year={Math.floor(k / 12)}
                      month={((k % 12) + 12) % 12}
                      selected={selected}
                      today={today}
                      byDay={byDay}
                      onPick={pick}
                      // «Гармошка» — только в видимом месяце, под неделей раскрытого дня.
                      panel={
                        inline && active && lastOpened
                          ? {
                              date: lastOpened,
                              render: (col: number) => (
                                <DayPanel
                                  open={isOpen}
                                  col={col}
                                  height={panelH}
                                  date={lastOpened}
                                  events={openEvents}
                                  today={today}
                                  onMeasure={setPanelContentH}
                                />
                              ),
                            }
                          : undefined
                      }
                    />
                  }
                />
              )}
            />
            {/* «↶ Сегодня» стоит на месте, пока месяц едет под ним. */}
            {awayFromToday && <TodayPill onPress={goToday} />}
            {legend && <Legend month={view.month} counts={counts} holidays={withHolidays} onHide={() => updateSettings({ calendarLegend: false })} />}
          </View>

          {later.length > 0 && (
            <>
              <Text style={[s.sectionLabel, { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 8 }]}>Ближайшие</Text>
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
        {/* Новое событие — на выбранный день, «Дата и время», сразу в календаре. Пока открыта шторка — кнопка в ней. */}
        {!(isOpen && !inline) && (
          <Fab label="Новое событие" onPress={() => router.push({ pathname: '/reminder/edit', params: { date: selected, kind: 'at', calendar: '1' } })} />
        )}
        {!inline && lastOpened && (
          <DaySheet open={isOpen} active={focused} date={lastOpened} events={openEvents} today={today} onClose={() => setOpened(null)} />
        )}
        <MonthPicker visible={picking} k={cur} onPick={(k) => show(k)} onClose={() => setPicking(false)} />
      </View>
    </TabSwipe>
  );
}

/** Высоты страницы месяца: название, дни недели, шесть недель по 44 px (точки событий — в углу числа, не под ним). */
const TITLE_H = 40;
const WEEK_H = 24;
const ROW_H = 44;
const PAGE_H = TITLE_H + WEEK_H + 6 * ROW_H;

/**
 * Месяцы каруселью: страница — месяц целиком (название, дни недели, числа); соседние стоят слева и справа и едут за
 * пальцем. Отпустил дальше четверти ширины (или быстро) — страница доезжает на UI-потоке со скоростью пальца, и
 * только потом календарь пересчитывает месяц: перерисовка не мешает движению. Выбор месяца, «Сегодня», диктор —
 * тоже сюда: на соседний месяц — пролистыванием, дальше — сразу.
 */
function MonthCarousel({
  cur,
  extra,
  onShow,
  render,
}: {
  cur: number;
  /** Насколько карусель выше страницы месяца — раскрытая «гармошка» дня. */
  extra: SharedValue<number>;
  onShow: (k: number) => void;
  render: (k: number, active: boolean) => ReactNode;
}) {
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
  const heightStyle = useAnimatedStyle(() => ({ height: PAGE_H + extra.get() }));
  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[{ overflow: 'hidden' }, heightStyle]} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        {/* Три месяца лежат внутри ряда шириной 3w, который сдвигается вместе с текущим месяцем: видимая страница всегда
            в границах ряда — на Android нажатия за границами родителя могут не доходить. */}
        <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, left: (cur - 1 - base) * w, width: 3 * w }, style]}>
          {w > 0 &&
            [cur - 1, cur, cur + 1].map((k) => (
              <View
                key={k}
                style={{ position: 'absolute', top: 0, bottom: 0, left: (k - cur + 1) * w, width: w }}
                aria-hidden={k !== cur}
                importantForAccessibility={k === cur ? 'auto' : 'no-hide-descendants'}
                accessibilityElementsHidden={k !== cur}
              >
                {render(k, k === cur)}
              </View>
            ))}
        </Animated.View>
      </Animated.View>
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
  panel,
}: {
  year: number;
  month: number;
  selected: string;
  today: string;
  byDay: Map<string, CalendarEvent[]>;
  onPick: (date: string) => void;
  /** «Гармошка» дня — под его неделей; `col` — столбец дня (для стрелки). */
  panel?: { date: string; render: (col: number) => ReactNode };
}) {
  const { colors, fonts } = useTheme();
  const palette = useKindColors();
  const red = palette.holiday[0];
  const days = monthGrid(year, month);
  // Неделя — отдельной строкой из семи клеток flex: 1. Не перенос по ширине 1/7: на Android сумма семи округлённых
  // «14,2857 %» бывала шире ряда, в строку влезало шесть дней, и числа съезжали со своих дней недели.
  const panelAt = panel ? days.indexOf(panel.date) : -1;
  return (
    <View>
      {Array.from({ length: 6 }, (_, week) => (
        <Fragment key={week}>
          <View style={{ flexDirection: 'row' }}>
            {days.slice(week * 7, week * 7 + 7).map((date) => {
              const d = parseISODate(date);
              const own = d.getMonth() === month;
              const isToday = date === today;
              const isSel = date === selected && own;
              const list = byDay.get(date) ?? [];
              const kinds = GRID_ORDER.filter((k) => list.some((e) => e.kind === k));
              // Праздник — «красный день календаря»: само число красное, без точки.
              const holiday = list.some((e) => e.kind === 'holiday');
              return (
                <Pressable
                  key={date}
                  onPress={() => onPick(date)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSel }}
                  accessibilityLabel={`${formatDateLong(date)}${isToday ? ', сегодня' : ''}${list.length ? `, ${list.length} ${plural(list.length, 'событие', 'события', 'событий')}` : ''}`}
                  style={{ flex: 1, height: ROW_H, alignItems: 'center', justifyContent: 'center' }}
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
                    {/* События — цветными точками в правом верхнем углу числа, по точке на вид: персик — день рождения,
                      роза — важная дата, голубой — встреча. Кайма цвета карточки отделяет точку от кружка дня. */}
                    {kinds.map((k, i) => (
                      <View
                        key={k}
                        style={{
                          position: 'absolute',
                          top: -2,
                          right: -3 + i * 6,
                          zIndex: 3 - i,
                          width: 10,
                          height: 10,
                          borderRadius: 5,
                          borderWidth: 1.5,
                          borderColor: colors.card,
                          backgroundColor: palette[k][0],
                          opacity: own ? 1 : 0.5,
                        }}
                      />
                    ))}
                  </View>
                </Pressable>
              );
            })}
          </View>
          {panel && panelAt >= 0 && Math.floor(panelAt / 7) === week && panel.render(panelAt % 7)}
        </Fragment>
      ))}
    </View>
  );
}

/** Точки в углу числа — по порядку, первая — в самом углу; праздник точкой не отмечаем: он — красным числом. */
const GRID_ORDER = ['birthday', 'date', 'meeting'] as const;

/**
 * «Гармошка» дня — внутри календаря, под неделей раскрытого дня: плавно раскрывается, остальные недели отъезжают
 * вниз. Стрелка смотрит на сам день. Высоту ведёт календарь (panelH) — по ней же растёт карусель месяцев.
 */
function DayPanel({
  open,
  col,
  height,
  date,
  events,
  today,
  onMeasure,
}: {
  open: boolean;
  col: number;
  /** Текущая высота раскрытия — общая с каруселью, чтобы она росла вместе с панелью. */
  height: SharedValue<number>;
  date: string;
  events: CalendarEvent[];
  today: string;
  onMeasure: (h: number) => void;
}) {
  const { s, colors } = useTheme();
  const birthday = events.find((e) => e.kind === 'birthday');
  const style = useAnimatedStyle(() => ({ height: height.get() }));
  return (
    <Animated.View style={[{ overflow: 'hidden' }, style]} aria-hidden={!open} pointerEvents={open ? 'auto' : 'none'}>
      <View onLayout={(e) => onMeasure(e.nativeEvent.layout.height)} style={{ paddingTop: 8, paddingBottom: 8, paddingHorizontal: 2 }}>
        <View style={{ backgroundColor: colors.chip, borderRadius: 16, paddingHorizontal: 12, paddingTop: 6, paddingBottom: 8 }}>
          {/* Стрелка к раскрытому дню. */}
          <View
            style={{
              position: 'absolute',
              top: -6,
              left: `${((col + 0.5) / 7) * 100}%`,
              marginLeft: -7,
              width: 14,
              height: 14,
              backgroundColor: colors.chip,
              transform: [{ rotate: '45deg' }],
            }}
          />
          <Text style={[s.caption, { paddingTop: 4, paddingBottom: 2 }]}>
            {formatDateLong(date)} · {relativeDay(date, today)}
          </Text>
          <Group style={{ backgroundColor: 'transparent', borderWidth: 0, borderRadius: 0 }} inset={52}>
            {events.map((e) => (
              <EventRow key={e.key} event={e} today={today} showWhen={false} />
            ))}
          </Group>
          <View style={{ flexDirection: 'row', gap: 18, paddingTop: 4, paddingHorizontal: 2 }}>
            {birthday && birthday.kind === 'birthday' && (
              <Pressable onPress={() => router.push({ pathname: '/friend/[id]', params: { id: birthday.friend.id } })} hitSlop={8} accessibilityRole="button">
                <Text style={{ color: colors.accentText, fontWeight: '600', fontSize: 14 }}>Поздравить</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => router.push({ pathname: '/reminder/edit', params: { date, kind: 'at', calendar: '1' } })}
              hitSlop={8}
              accessibilityRole="button"
            >
              <Text style={{ color: colors.accentText, fontWeight: '600', fontSize: 14 }}>+ Событие</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

/**
 * Шторка дня — снизу, без затемнения: календарь над ней остаётся живым, нажатие на другой день меняет содержимое.
 * Закрывается смахиванием вниз, крестиком, системной «Назад», сменой месяца или нажатием на пустой день. Пока уезжает —
 * держит последнее содержимое.
 */
function DaySheet({
  open,
  active,
  date,
  events,
  today,
  onClose,
}: {
  open: boolean;
  /** Вкладка на экране — только тогда «Назад» закрывает шторку. */
  active: boolean;
  date: string;
  events: CalendarEvent[];
  today: string;
  onClose: () => void;
}) {
  const { s, colors, fonts } = useTheme();
  const { height: screenH } = useWindowDimensions();
  const [shown, setShown] = useState({ date, events });
  if (open && (shown.date !== date || shown.events !== events)) setShown({ date, events });
  const [h, setH] = useState(400);
  const y = useSharedValue(800);
  useEffect(() => {
    y.set(withTiming(open ? 0 : h + 40, { duration: open ? 260 : 200, easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.quad) }));
  }, [open, h, y]);
  useEffect(() => {
    if (!open || !active) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [open, active, onClose]);
  // Смахнул вниз за шапку — закрылась; немного — вернулась на место.
  const drag = Gesture.Pan()
    .activeOffsetY([-8, 8])
    .onUpdate((e) => {
      'worklet';
      y.set(Math.max(0, e.translationY));
    })
    .onEnd((e) => {
      'worklet';
      if (e.translationY > 70 || e.velocityY > 600) scheduleOnRN(onClose);
      else y.set(withTiming(0, { duration: 180, easing: Easing.out(Easing.cubic) }));
    });
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));
  const d = shown.date;
  const birthday = shown.events.find((e) => e.kind === 'birthday');
  return (
    <Animated.View
      pointerEvents={open ? 'auto' : 'none'}
      onLayout={(e) => setH(e.nativeEvent.layout.height)}
      accessibilityViewIsModal={false}
      aria-hidden={!open}
      style={[
        {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: screenH * 0.55,
          backgroundColor: colors.card,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          borderTopWidth: 1,
          borderColor: colors.hairline,
          boxShadow: '0 -8px 28px rgba(0, 0, 0, 0.28)',
          paddingBottom: 12,
        },
        style,
      ]}
    >
      <GestureDetector gesture={drag}>
        <View style={{ paddingTop: 10, paddingHorizontal: 20 }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.hairline, alignSelf: 'center' }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 8 }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <Text style={{ fontFamily: fonts.display, fontSize: 20, color: colors.text }} accessibilityRole="header">
                {formatDateLong(d)}
              </Text>
              <Text style={[s.caption, { fontSize: 13 }]}>{relativeDay(d, today)}</Text>
            </View>
            <IconButton icon="close" label="Закрыть" onPress={onClose} />
          </View>
        </View>
      </GestureDetector>
      <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 20 }}>
        <Group style={{ backgroundColor: 'transparent', borderWidth: 0, borderRadius: 0 }} inset={52}>
          {shown.events.map((e) => (
            // «Когда» — уже в заголовке шторки.
            <EventRow key={e.key} event={e} today={today} showWhen={false} />
          ))}
        </Group>
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 10 }}>
        {birthday && birthday.kind === 'birthday' && (
          <Button title="Поздравить" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/friend/[id]', params: { id: birthday.friend.id } })} />
        )}
        <Button
          title="Событие"
          icon="plus"
          variant="soft"
          style={{ flex: 1 }}
          onPress={() => router.push({ pathname: '/reminder/edit', params: { date: d, kind: 'at', calendar: '1' } })}
        />
      </View>
    </Animated.View>
  );
}

/** Строка события: аватар (у встречи без друга — часы), что за событие, когда. Нажатие — к другу или к делу. */
function EventRow({ event: e, today, showWhen = true }: { event: CalendarEvent; today: string; showWhen?: boolean }) {
  const { colors } = useTheme();
  const diff = daysBetween(today, e.date);
  const when = relativeDay(e.date, today);
  const tag = <Tag text={when} tone={diff === 0 ? 'solid' : diff > 0 && diff <= 7 ? 'accent' : 'neutral'} />;
  if (e.kind === 'holiday') {
    const where = e.holidays.map((h) => holidayCountry(h.country)).filter((c) => c !== undefined);
    const estimated = e.holidays.some((h) => h.estimated);
    // Когда: многодневный — все его дни («1–6 и 8 января»), иначе — само число («25 декабря»).
    const days = holidayDatesInYear(e.holidays[0].id, parseISODate(e.date).getFullYear());
    const when = days.length > 1 ? formatHolidayDays(days) : formatDate(e.date, false);
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
        subtitle={`${when} · ${where.map((c) => `${c.flag} ${c.name}`).join(' · ')}${estimated ? ' · дата примерная' : ''}`}
        trailing={showWhen ? tag : undefined}
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
        trailing={showWhen ? tag : undefined}
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
      trailing={showWhen ? tag : undefined}
    />
  );
}
