import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { Avatar } from '@/components/Avatar';
import { useSvgId } from '@/components/ai/AiIcon';
import { Icon } from '@/components/Icon';
import { TabSwipe } from '@/components/TabSwipe';
import { Group, IconButton, ListRow, ScreenHeader, Tag, useTheme } from '@/components/ui';
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
 * Цвета значков событий — палитра «В тон приложению»: торт — градиент от мёда к терракоте, сердце — пыльная роза,
 * встречи — спокойный голубой. В светлой теме — те же оттенки темнее, чтобы читались на бумаге.
 */
const KIND_PALETTE = {
  dark: { birthday: ['#E9B44C', '#E0704F'], date: ['#E45D7B'], meeting: ['#86B6E0'] },
  light: { birthday: ['#C98A1E', '#C4502F'], date: ['#C2405F'], meeting: ['#3F78AE'] },
} as const;

function useKindColors() {
  const { scheme } = useTheme();
  return KIND_PALETTE[scheme === 'dark' ? 'dark' : 'light'];
}

/** Значок события: цвет или градиент из палитры. */
function KindIcon({ kind, size, strokeWidth = 2.2 }: { kind: CalendarEvent['kind']; size: number; strokeWidth?: number }) {
  const stops = useKindColors()[kind];
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

  const grid = useMemo(() => monthGrid(view.year, view.month), [view]);
  const events = useMemo(() => calendarEvents(data, grid[0], grid[41]), [data, grid]);
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
      <ScrollView style={s.screen} contentContainerStyle={{ paddingBottom: 40 }}>
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
            {!isCurrent && (
              <Pressable onPress={goToday} hitSlop={8} accessibilityRole="button" style={{ paddingHorizontal: 10, paddingVertical: 6, marginRight: 4 }}>
                <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.accentText }}>Сегодня</Text>
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
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {grid.map((date) => {
              const d = parseISODate(date);
              const own = d.getMonth() === view.month;
              const isToday = date === today;
              const isSel = date === selected;
              const list = byDay.get(date) ?? [];
              const kinds = [...new Set(list.map((e) => e.kind))];
              return (
                <Pressable
                  key={date}
                  onPress={() => pick(date)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSel }}
                  accessibilityLabel={`${formatDateLong(date)}${isToday ? ', сегодня' : ''}${list.length ? `, ${list.length} ${plural(list.length, 'событие', 'события', 'событий')}` : ''}`}
                  style={{ width: cellW, height: 56, alignItems: 'center', paddingTop: 4 }}
                >
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 17,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: isSel ? colors.accent : isToday ? colors.soft : 'transparent',
                    }}
                  >
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
    </TabSwipe>
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
