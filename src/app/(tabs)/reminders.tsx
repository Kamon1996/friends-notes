import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Text, View } from 'react-native';

import { ReminderRow } from '@/components/ReminderRow';
import { Chip, Empty, Fab, GroupedRow, ScreenHeader, useTheme } from '@/components/ui';
import { combine, plural, todayISO } from '@/lib/dates';
import { useStore } from '@/lib/store';
import type { Reminder } from '@/lib/types';

type Filter = 'active' | 'personal' | 'friends' | 'done';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'active', label: 'Активные' },
  { key: 'personal', label: 'Для себя' },
  { key: 'friends', label: 'Друзья' },
  { key: 'done', label: 'Сделанные' },
];

type Item = { type: 'label'; key: string; text: string } | { type: 'reminder'; key: string; reminder: Reminder; first: boolean; last: boolean };

export default function RemindersScreen() {
  const { data } = useStore();
  const { s } = useTheme();
  const [filter, setFilter] = useState<Filter>('active');

  const friendById = useMemo(() => new Map(data.friends.map((f) => [f.id, f])), [data.friends]);

  const items = useMemo(() => {
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
    const t = (r: Reminder) => combine(r.date, r.time).getTime();
    list.sort((a, b) => (filter === 'done' ? t(b) - t(a) : t(a) - t(b)));
    const groups: { text: string; rows: Reminder[] }[] =
      filter === 'done'
        ? [{ text: 'Сделанные', rows: list }]
        : [
            { text: 'Повторяющиеся', rows: list.filter((r) => r.repeat) },
            { text: 'Однократные', rows: list.filter((r) => !r.repeat) },
          ];
    const out: Item[] = [];
    for (const g of groups) {
      if (!g.rows.length) continue;
      out.push({ type: 'label', key: `l-${g.text}`, text: g.text });
      g.rows.forEach((r, i) => out.push({ type: 'reminder', key: r.id, reminder: r, first: i === 0, last: i === g.rows.length - 1 }));
    }
    return out;
  }, [data.reminders, filter]);

  const active = data.reminders.filter((r) => !r.done);
  const today = todayISO();
  const todayCount = active.filter((r) => r.date === today).length;

  return (
    <View style={s.screen}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.key}
        contentContainerStyle={{ paddingBottom: 120 }}
        ListHeaderComponent={
          <>
            <ScreenHeader
              title="Напоминания"
              subtitle={active.length ? `${active.length} ${plural(active.length, 'активное', 'активных', 'активных')}${todayCount ? ` · ${todayCount} сегодня` : ''}` : undefined}
            />
            <View style={[s.chips, { padding: 20, paddingTop: 14, paddingBottom: 8 }]}>
              {FILTERS.map((f) => (
                <Chip key={f.key} label={f.label} selected={filter === f.key} onPress={() => setFilter(f.key)} />
              ))}
            </View>
          </>
        }
        renderItem={({ item }) =>
          item.type === 'label' ? (
            <Text style={[s.sectionLabel, { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 8 }]}>{item.text}</Text>
          ) : (
            <View style={{ paddingHorizontal: 20 }}>
              <GroupedRow first={item.first} last={item.last} inset={item.reminder.friendId ? 96 : 56}>
                <ReminderRow reminder={item.reminder} friend={item.reminder.friendId ? friendById.get(item.reminder.friendId) : null} />
              </GroupedRow>
            </View>
          )
        }
        ListEmptyComponent={
          <Empty
            icon="bell"
            title={filter === 'done' ? 'Пока ничего не сделано' : 'Напоминаний нет'}
            text="Создай напоминание: «купить цветы раз в 2 месяца», «написать маме раз в неделю» или свой дедлайн."
          />
        }
      />
      <Fab onPress={() => router.push('/reminder/edit')} label="Новое напоминание" />
    </View>
  );
}
