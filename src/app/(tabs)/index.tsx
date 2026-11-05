import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, SectionList, Text, View } from 'react-native';

import { ReminderRow } from '@/components/ReminderRow';
import { Card, Empty, Fab, SectionTitle, colors, styles } from '@/components/ui';
import { daysBetween, formatDateShort, plural, relativeDay, todayISO } from '@/lib/dates';
import { upcomingItems, type UpcomingItem } from '@/lib/events';
import { useStore } from '@/lib/store';

export default function UpcomingScreen() {
  const { data, ready } = useStore();

  const sections = useMemo(() => {
    const today = todayISO();
    const groups: Record<string, UpcomingItem[]> = {
      'Просрочено': [],
      'Сегодня': [],
      'Ближайшие 7 дней': [],
      'В этом месяце': [],
      'Позже': [],
    };
    for (const item of upcomingItems(data, 60, today)) {
      const diff = daysBetween(today, item.date);
      if (item.kind === 'reminder' && item.overdue) {
        groups['Просрочено'].push(item);
      } else if (diff === 0) groups['Сегодня'].push(item);
      else if (diff <= 7) groups['Ближайшие 7 дней'].push(item);
      else if (diff <= 31) groups['В этом месяце'].push(item);
      else groups['Позже'].push(item);
    }
    return Object.entries(groups)
      .filter(([, items]) => items.length)
      .map(([title, items]) => ({ title, data: items }));
  }, [data]);

  if (!ready) return <View style={styles.screen} />;

  return (
    <View style={styles.screen}>
      <SectionList
        sections={sections}
        keyExtractor={(i) => i.key}
        contentContainerStyle={styles.content}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => <SectionTitle>{section.title}</SectionTitle>}
        renderItem={({ item }) => <UpcomingRow item={item} />}
        ListEmptyComponent={
          data.friends.length === 0 ? (
            <Empty
              emoji="👋"
              title="Добро пожаловать!"
              text="Добавь первого друга во вкладке «Друзья» — его день рождения и напоминания появятся здесь."
            />
          ) : (
            <Empty emoji="🌿" title="Всё спокойно" text="В ближайшие два месяца ничего не запланировано." />
          )
        }
      />
      <Fab onPress={() => router.push('/reminder/edit')} />
    </View>
  );
}

function UpcomingRow({ item }: { item: UpcomingItem }) {
  if (item.kind === 'reminder') return <ReminderRow reminder={item.reminder} friend={item.friend} />;

  const isBirthday = item.kind === 'birthday';
  const today = item.date === todayISO();
  let subtitle: string;
  if (isBirthday) {
    subtitle = item.age ? `Исполнится ${item.age} ${plural(item.age, 'год', 'года', 'лет')}` : 'День рождения';
  } else {
    subtitle = item.years ? `${item.title} · ${item.years} ${plural(item.years, 'год', 'года', 'лет')}` : item.title;
  }

  return (
    <Pressable onPress={() => router.push(`/friend/${item.friend.id}`)}>
      <Card style={[styles.row, today && { backgroundColor: colors.primarySoft, borderColor: colors.primary }]}>
        <Text style={{ fontSize: 30 }}>{isBirthday ? '🎂' : '📅'}</Text>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.title}>
            {item.friend.emoji} {item.friend.name}
          </Text>
          <Text style={styles.muted}>{subtitle}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.muted, { fontWeight: '600', color: today ? colors.primary : colors.text }]}>
            {relativeDay(item.date)}
          </Text>
          <Text style={[styles.muted, { fontSize: 12 }]}>{formatDateShort(item.date)}</Text>
        </View>
      </Card>
    </Pressable>
  );
}
