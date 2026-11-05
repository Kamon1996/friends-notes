import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';

import { ReminderRow } from '@/components/ReminderRow';
import { Chip, Empty, Fab, styles } from '@/components/ui';
import { combine } from '@/lib/dates';
import { useStore } from '@/lib/store';

type Filter = 'active' | 'personal' | 'friends' | 'done';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'active', label: 'Все активные' },
  { key: 'personal', label: '🙋 Личные' },
  { key: 'friends', label: '👥 Друзья' },
  { key: 'done', label: '✓ Выполненные' },
];

export default function RemindersScreen() {
  const { data } = useStore();
  const [filter, setFilter] = useState<Filter>('active');

  const friendById = useMemo(() => new Map(data.friends.map((f) => [f.id, f])), [data.friends]);

  const reminders = useMemo(() => {
    const list = data.reminders.filter((r) => {
      switch (filter) {
        case 'active':
          return !r.done;
        case 'personal':
          return !r.done && !r.friendId;
        case 'friends':
          return !r.done && !!r.friendId;
        case 'done':
          return r.done;
      }
    });
    const t = (r: (typeof list)[number]) => combine(r.date, r.time).getTime();
    return list.sort((a, b) => (filter === 'done' ? t(b) - t(a) : t(a) - t(b)));
  }, [data.reminders, filter]);

  return (
    <View style={styles.screen}>
      <FlatList
        data={reminders}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.chips}>
            {FILTERS.map((f) => (
              <Chip key={f.key} label={f.label} selected={filter === f.key} onPress={() => setFilter(f.key)} />
            ))}
          </View>
        }
        renderItem={({ item }) => (
          <ReminderRow reminder={item} friend={item.friendId ? friendById.get(item.friendId) : null} />
        )}
        ListEmptyComponent={
          <Empty
            emoji="⏰"
            title={filter === 'done' ? 'Пока ничего не выполнено' : 'Напоминаний нет'}
            text="Создай напоминание: «купить цветы раз в 2 месяца», «написать маме раз в неделю» или свой дедлайн."
          />
        }
      />
      <Fab onPress={() => router.push('/reminder/edit')} />
    </View>
  );
}
