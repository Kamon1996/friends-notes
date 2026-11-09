import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { PanResponder, Pressable, ScrollView, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { Group, IconButton, IconCircle, ListRow, ScreenHeader, Tag, useTheme } from '@/components/ui';
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

/** Цвет точки и значка события: дни рождения — акцент, важные даты — тёплый, встречи — синий. */
function useKindColors() {
  const { colors } = useTheme();
  return { birthday: colors.accent, date: colors.warn, meeting: colors.info } as const;
}

/**
 * Календарь: месяц сеткой, в днях — точки событий; ниже — что в выбранный день и что дальше. События — дни рождения,
 * годовщины и важные даты друзей, дела «на дату и время». Дела «до срока» и повторяющиеся — в «Напоминаниях».
 */
export default function CalendarScreen() {
  const { data } = useStore();
  const { s, colors, fonts } = useTheme();
  const kindColor = useKindColors();
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

  // Листать месяцы пальцем по сетке: влево — следующий, вправо — прошлый. Вертикальная прокрутка не мешает.
  const [pan] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 18 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderRelease: (_, g) => {
        if (g.dx < -50) setView((v) => stepMonth(v, 1));
        else if (g.dx > 50) setView((v) => stepMonth(v, -1));
      },
    }),
  );

  const isCurrent = view.year === parseISODate(today).getFullYear() && view.month === parseISODate(today).getMonth();
  const cellW = `${100 / 7}%` as const;

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <ScreenHeader
        title="Календарь"
        subtitle={inMonth ? `В ${MONTHS_IN[view.month]} — ${inMonth} ${plural(inMonth, 'событие', 'события', 'событий')}` : `В ${MONTHS_IN[view.month]} событий нет`}
        right={<IconButton icon="sliders" label="Настройки" onPress={() => router.push('/settings')} />}
      />

      <View style={[s.group, { marginHorizontal: 20, marginTop: 14, paddingHorizontal: 8, paddingTop: 10, paddingBottom: 8 }]} {...pan.panHandlers}>
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
            <Text key={w} style={{ width: cellW, textAlign: 'center', fontFamily: fonts.medium, fontSize: 12, color: i >= 5 ? colors.text3 : colors.text2, paddingBottom: 6 }}>
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
                style={{ width: cellW, height: 50, alignItems: 'center', paddingTop: 6 }}
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
                <View style={{ position: 'absolute', bottom: 3, flexDirection: 'row', gap: 3, height: 5 }}>
                  {kinds.map((k) => (
                    <View key={k} style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: kindColor[k], opacity: own ? 1 : 0.5 }} />
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
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: kindColor[k] }} />
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
  );
}

/** Строка события: аватар (у встречи без друга — значок календаря), что за событие, когда. Нажатие — к другу или к делу. */
function EventRow({ event: e, today }: { event: CalendarEvent; today: string }) {
  const { colors } = useTheme();
  const kindColor = useKindColors();
  const diff = daysBetween(today, e.date);
  const when = relativeDay(e.date, today);
  const tag = <Tag text={when} tone={diff === 0 ? 'solid' : diff > 0 && diff <= 7 ? 'accent' : 'neutral'} />;
  if (e.kind === 'meeting') {
    const r = e.reminder;
    return (
      <ListRow
        onPress={() => router.push({ pathname: '/reminder/edit', params: { id: r.id } })}
        leading={e.friend ? <Avatar friend={e.friend} size={40} /> : <IconCircle icon="calendar" tone="info" size={40} />}
        title={r.title}
        titleStyle={r.done ? { textDecorationLine: 'line-through', color: colors.text3 } : undefined}
        subtitle={`${r.time}${e.friend ? ` · ${e.friend.name}` : ''}${r.done ? ' · сделано' : ''}`}
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
          <View
            style={{
              position: 'absolute',
              right: -3,
              bottom: -3,
              width: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: kindColor[e.kind],
              borderWidth: 2,
              borderColor: colors.card,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name={e.kind === 'birthday' ? 'cake' : 'heart'} size={9} color={colors.onAccent} strokeWidth={2.6} />
          </View>
        </View>
      }
      title={f.name}
      subtitle={what}
      trailing={tag}
    />
  );
}
