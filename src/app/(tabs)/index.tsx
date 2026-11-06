import { router } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { ReminderRow } from '@/components/ReminderRow';
import { TodayCard } from '@/components/TodayCard';
import { Empty, Fab, Group, IconButton, IconCircle, ListRow, ScreenHeader, SectionTitle, Tag, useTheme } from '@/components/ui';
import { daysBetween, formatDateLong, formatDayShort, plural, relativeDay, todayISO } from '@/lib/dates';
import { upcomingItems, type UpcomingItem } from '@/lib/events';
import { useStore } from '@/lib/store';

type Section = { key: string; title: string; items: UpcomingItem[]; tone?: 'danger' };

export default function UpcomingScreen() {
  const { data, ready } = useStore();
  const { s, colors } = useTheme();
  const today = todayISO();

  const sections = useMemo(() => {
    const groups: Section[] = [
      { key: 'overdue', title: 'Просрочено', items: [], tone: 'danger' },
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
    return groups.filter((g) => g.items.length);
  }, [data, today]);

  if (!ready) return <View style={s.screen} />;

  const weekCount = sections.filter((g) => g.key === 'today' || g.key === 'week').reduce((n, g) => n + g.items.length, 0);

  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <ScreenHeader
          title="Скоро"
          subtitle={weekCount ? `${formatDateLong(today)} · ${weekCount} ${plural(weekCount, 'событие', 'события', 'событий')} на неделе` : formatDateLong(today)}
          right={
            <>
              <IconButton icon="import" label="Импорт друзей" onPress={() => router.push('/import')} />
              <IconButton icon="sliders" label="Настройки" onPress={() => router.push('/settings')} />
            </>
          }
        />
        <View style={{ padding: 20, paddingTop: 14, gap: 20 }}>
          {sections.length === 0 &&
            (data.friends.length === 0 ? (
              <Empty
                icon="people"
                title="Пока никого"
                text="Добавь первого друга во вкладке «Друзья» или импортируй из контактов — дни рождения появятся здесь."
              />
            ) : (
              <Empty icon="calendar" title="Всё спокойно" text="В ближайшие два месяца ничего не запланировано." />
            ))}
          {sections.map((g) => {
            const events = g.items.filter((i) => i.kind !== 'reminder');
            const reminders = g.items.filter((i) => i.kind === 'reminder');
            return (
              <View key={g.key} style={{ gap: 8 }}>
                <SectionTitle style={{ marginBottom: 0 }}>
                  <Text style={[s.sectionLabel, g.tone === 'danger' && { color: colors.danger }]}>{g.title}</Text>
                </SectionTitle>
                {g.key === 'today' &&
                  events.map((item) =>
                    item.kind === 'birthday' ? (
                      <TodayCard key={item.key} friend={item.friend} kind="birthday" years={item.age} />
                    ) : item.kind === 'date' ? (
                      <TodayCard key={item.key} friend={item.friend} kind="date" title={item.title} years={item.years} />
                    ) : null,
                  )}
                {g.key !== 'today' && events.length > 0 && (
                  <Group>
                    {events.map((item) => (
                      <EventRow key={item.key} item={item} />
                    ))}
                  </Group>
                )}
                {reminders.length > 0 && (
                  <Group>
                    {reminders.map((item) =>
                      item.kind === 'reminder' ? (
                        <ReminderRow key={item.key} reminder={item.reminder} friend={item.friend} showDate={g.key !== 'today'} />
                      ) : null,
                    )}
                  </Group>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>
      <Fab onPress={() => router.push('/reminder/edit')} label="Новое напоминание" />
    </View>
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
