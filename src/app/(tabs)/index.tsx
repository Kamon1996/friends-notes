import { router } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { ReminderRow } from '@/components/ReminderRow';
import { ReminderSwipe } from '@/components/ReminderSwipe';
import { TelegramImportCard } from '@/components/TelegramImportCard';
import { TodayCard, type TodayEvent } from '@/components/TodayCard';
import { Button, Empty, GroupedRow, IconButton, IconCircle, ListRow, ScreenHeader, Tag, useTheme } from '@/components/ui';
import { daysBetween, formatDateLong, formatDayShort, plural, relativeDay, todayISO } from '@/lib/dates';
import { upcomingItems, type UpcomingItem } from '@/lib/events';
import { useStore } from '@/lib/store';
import type { Friend } from '@/lib/types';
import { zodiacShown } from '@/lib/zodiac';

/** Сколько просроченных показывать на ленте; остальные — во вкладке «Напоминания». */
const OVERDUE_LIMIT = 5;
/** Сколько именинников показывать большими карточками; остальные за сегодня — компактными строками. */
const TODAY_CARDS = 3;

type Row =
  | { type: 'label'; key: string; title: string; tone?: 'danger' }
  | { type: 'today'; key: string; friend: Friend; events: TodayEvent[] }
  | { type: 'todayRow'; key: string; friend: Friend; events: TodayEvent[]; first: boolean; last: boolean }
  | { type: 'event'; key: string; item: UpcomingItem; first: boolean; last: boolean }
  | { type: 'reminder'; key: string; item: Extract<UpcomingItem, { kind: 'reminder' }>; first: boolean; last: boolean; showDate: boolean }
  | { type: 'more'; key: string; count: number }
  | { type: 'empty'; key: string; noFriends: boolean; withoutBirthday: number };

export default function UpcomingScreen() {
  const { data, ready } = useStore();
  const { s, colors } = useTheme();
  const today = todayISO();

  const rows = useMemo(() => {
    const groups: { key: string; title: string; tone?: 'danger'; items: UpcomingItem[] }[] = [
      { key: 'overdue', title: 'Просрочено', tone: 'danger', items: [] },
      { key: 'today', title: 'Сегодня', items: [] },
      { key: 'week', title: 'На этой неделе', items: [] },
      { key: 'month', title: 'В ближайший месяц', items: [] },
      { key: 'later', title: 'Позже', items: [] },
    ];
    for (const item of upcomingItems(data, 60, today)) {
      const diff = daysBetween(today, item.date);
      if (item.kind === 'reminder' && item.overdue) groups[0].items.push(item);
      else if (diff === 0) groups[1].items.push(item);
      else if (diff <= 7) groups[2].items.push(item);
      else if (diff <= 31) groups[3].items.push(item);
      else groups[4].items.push(item);
    }

    const out: Row[] = [];
    const pushGroup = (keyPrefix: string, items: UpcomingItem[], showDate: boolean) => {
      items.forEach((item, i) => {
        const first = i === 0;
        const last = i === items.length - 1;
        if (item.kind === 'reminder') out.push({ type: 'reminder', key: item.key, item, first, last, showDate });
        else out.push({ type: 'event', key: item.key, item, first, last });
      });
    };

    for (const g of groups) {
      if (!g.items.length) continue;
      const weekCount = g.key === 'week' ? ` · ${g.items.length}` : '';
      out.push({ type: 'label', key: `l-${g.key}`, title: g.title + weekCount, tone: g.tone });

      if (g.key === 'overdue') {
        // Самые свежие просроченные — ближе к делу; остальные ждут во вкладке «Напоминания».
        const recent = [...g.items].reverse();
        pushGroup(g.key, recent.slice(0, OVERDUE_LIMIT), true);
        if (recent.length > OVERDUE_LIMIT) out.push({ type: 'more', key: 'overdue-more', count: recent.length - OVERDUE_LIMIT });
        continue;
      }

      if (g.key === 'today') {
        // Все сегодняшние события одного человека — в одной карточке.
        const byFriend = new Map<string, { friend: Friend; events: TodayEvent[] }>();
        for (const item of g.items) {
          if (item.kind === 'reminder') continue;
          const entry = byFriend.get(item.friend.id) ?? { friend: item.friend, events: [] };
          entry.events.push(item.kind === 'birthday' ? { kind: 'birthday', years: item.age } : { kind: 'date', title: item.title, years: item.years });
          byFriend.set(item.friend.id, entry);
        }
        // Большие карточки достаются избранным, остальные — компактными строками.
        const people = [...byFriend.values()].sort((a, b) => Number(!!b.friend.favorite) - Number(!!a.friend.favorite));
        people.slice(0, TODAY_CARDS).forEach((c) => out.push({ type: 'today', key: `t-${c.friend.id}`, friend: c.friend, events: c.events }));
        const rest = people.slice(TODAY_CARDS);
        rest.forEach((c, i) => out.push({ type: 'todayRow', key: `tr-${c.friend.id}`, friend: c.friend, events: c.events, first: i === 0, last: i === rest.length - 1 }));
        pushGroup(g.key, g.items.filter((i) => i.kind === 'reminder'), false);
        continue;
      }

      // Праздники и дела одной группы — одним списком по датам: дело на 9-е не должно идти после праздника 12-го.
      pushGroup(g.key, g.items, true);
    }
    if (!out.length) out.push({ type: 'empty', key: 'empty', noFriends: data.friends.length === 0, withoutBirthday: data.friends.filter((f) => !f.birthday).length });
    return out;
  }, [data, today]);
  // Подсказку «можно провести» показывает первое дело в ленте.
  const hintKey = rows.find((r) => r.type === 'reminder')?.key;

  if (!ready) return <View style={s.screen} />;

  return (
    <View style={s.screen}>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        contentContainerStyle={{ paddingBottom: 120 }}
        ListHeaderComponent={
          <>
            <ScreenHeader
              title="Скоро"
              subtitle={formatDateLong(today)}
              right={
                <>
                  <IconButton icon="import" label="Импорт друзей" onPress={() => router.push('/import')} />
                  <IconButton icon="sliders" label="Настройки" onPress={() => router.push('/settings')} />
                </>
              }
            />
            <TelegramImportCard style={{ marginHorizontal: 20, marginTop: 16 }} />
          </>
        }
        renderItem={({ item: row }) => {
          switch (row.type) {
            case 'label':
              return (
                <Text style={[s.sectionLabel, { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 8 }, row.tone === 'danger' && { color: colors.danger }]}>{row.title}</Text>
              );
            case 'today':
              return (
                <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
                  <TodayCard friend={row.friend} events={row.events} zodiac={zodiacShown(data.settings)} />
                </View>
              );
            case 'todayRow':
              return (
                <View style={{ paddingHorizontal: 20, paddingTop: row.first ? 2 : 0, paddingBottom: row.last ? 8 : 0 }}>
                  <GroupedRow first={row.first} last={row.last}>
                    <TodayRow friend={row.friend} events={row.events} />
                  </GroupedRow>
                </View>
              );
            case 'event':
              return (
                <View style={{ paddingHorizontal: 20, paddingTop: row.first ? 2 : 0 }}>
                  <GroupedRow first={row.first} last={row.last}>
                    <EventRow item={row.item} />
                  </GroupedRow>
                </View>
              );
            case 'reminder':
              return (
                <View style={{ paddingHorizontal: 20, paddingTop: row.first ? 2 : 0 }}>
                  <GroupedRow first={row.first} last={row.last}>
                    <ReminderSwipe reminder={row.item.reminder} hint={row.key === hintKey}>
                      <ReminderRow reminder={row.item.reminder} friend={row.item.friend} showDate={row.showDate} />
                    </ReminderSwipe>
                  </GroupedRow>
                </View>
              );
            case 'more':
              return (
                <Pressable onPress={() => router.push('/reminders')} style={({ pressed }) => [s.row, { paddingHorizontal: 24, paddingVertical: 10, gap: 6, opacity: pressed ? 0.6 : 1 }]}>
                  <Text style={[s.muted, { color: colors.accent, fontFamily: s.title.fontFamily }]}>
                    Ещё {row.count} {plural(row.count, 'просроченное', 'просроченных', 'просроченных')} во вкладке «Напоминания»
                  </Text>
                  <Icon name="chevronRight" size={16} color={colors.accent} strokeWidth={2} />
                </Pressable>
              );
            case 'empty':
              return (
                <View style={{ padding: 20 }}>
                  {row.noFriends ? (
                    <Empty icon="people" title="Пока никого" text="Добавь первого друга или импортируй из контактов — дни рождения появятся здесь.">
                      <Button title="Импорт из контактов" icon="import" onPress={() => router.push('/import')} style={{ marginTop: 8, alignSelf: 'stretch' }} />
                      <Button title="Добавить друга" icon="plus" variant="secondary" onPress={() => router.push('/friend/edit')} style={{ alignSelf: 'stretch' }} />
                    </Empty>
                  ) : row.withoutBirthday > 0 ? (
                    <Empty
                      icon="calendar"
                      title="Всё спокойно"
                      text={`В ближайшие два месяца ничего не запланировано. У ${row.withoutBirthday} ${plural(row.withoutBirthday, 'друга', 'друзей', 'друзей')} не указан день рождения — добавь, и он появится здесь.`}
                    >
                      <Button title="Открыть друзей" variant="secondary" onPress={() => router.push('/friends')} style={{ marginTop: 8, alignSelf: 'stretch' }} />
                    </Empty>
                  ) : (
                    <Empty icon="calendar" title="Всё спокойно" text="В ближайшие два месяца ничего не запланировано." />
                  )}
                </View>
              );
          }
        }}
      />
    </View>
  );
}

/** Компактная строка именинника, когда карточек «Сегодня» слишком много. */
function TodayRow({ friend, events }: { friend: Friend; events: TodayEvent[] }) {
  const { s } = useTheme();
  const text = events
    .map((e) => (e.kind === 'birthday' ? 'День рождения' : e.title ?? 'Важная дата') + (e.years ? ` · ${e.years} ${plural(e.years, 'год', 'года', 'лет')}` : ''))
    .join(' · ');
  return (
    <ListRow
      onPress={() => router.push(`/friend/${friend.id}`)}
      leading={<Avatar friend={friend} size={40} />}
      title={<Text style={[s.name, { fontSize: 16 }]} numberOfLines={1}>{friend.name}</Text>}
      subtitle={text}
      trailing={<Tag text="сегодня" tone="solid" />}
    />
  );
}

function EventRow({ item }: { item: UpcomingItem }) {
  const { s } = useTheme();
  if (item.kind === 'reminder') return null;
  const diff = daysBetween(todayISO(), item.date);
  const subtitle =
    item.kind === 'birthday'
      ? item.age
        ? `День рождения · ${item.age} ${plural(item.age, 'год', 'года', 'лет')}`
        : 'День рождения'
      : item.years
        ? `${item.title} · ${item.years} ${plural(item.years, 'год', 'года', 'лет')}`
        : item.title;

  return (
    <ListRow
      onPress={() => router.push(`/friend/${item.friend.id}`)}
      leading={item.kind === 'birthday' ? <Avatar friend={item.friend} size={40} /> : <IconCircle icon="heart" tone="accent" size={40} />}
      title={<Text style={[s.name, { fontSize: 16 }]} numberOfLines={1}>{item.friend.name}</Text>}
      subtitle={subtitle}
      trailing={
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Text style={[s.title, { fontSize: 13, fontVariant: ['tabular-nums'] }]}>{formatDayShort(item.date)}</Text>
          <Tag text={relativeDay(item.date)} tone={diff <= 7 ? 'accent' : 'neutral'} />
        </View>
      }
    />
  );
}
