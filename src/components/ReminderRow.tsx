import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { combine, formatDateShort, formatRepeat, relativeDay } from '@/lib/dates';
import { useStore } from '@/lib/store';
import type { Friend, Reminder } from '@/lib/types';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { Checkbox, ListRow, Tag, useTheme } from './ui';

/**
 * Строка напоминания: кружок-чекбокс, текст, дата. Сделанное зачёркивается и уходит в шалфей,
 * просроченное краснеет только подписью.
 */
export function ReminderRow({
  reminder,
  friend,
  showFriend = true,
  showDate = true,
}: {
  reminder: Reminder;
  friend?: Friend | null;
  showFriend?: boolean;
  showDate?: boolean;
}) {
  const { toggleReminderDone } = useStore();
  const { s, colors } = useTheme();
  const overdue = !reminder.done && combine(reminder.date, reminder.time) < new Date();

  const when = showDate ? `${formatDateShort(reminder.date)}, ${reminder.time}` : reminder.time;
  const parts = [when, overdue ? 'просрочено' : showDate ? relativeDay(reminder.date) : null, reminder.repeat && formatRepeat(reminder.repeat)].filter(Boolean);

  return (
    <ListRow
      onPress={() => router.push({ pathname: '/reminder/edit', params: { id: reminder.id } })}
      leading={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 6 }}>
          <Checkbox checked={reminder.done} done onPress={() => toggleReminderDone(reminder.id)} />
          {showFriend && friend && <Avatar friend={friend} size={30} />}
        </View>
      }
      title={
        <Text style={[s.title, reminder.done && { textDecorationLine: 'line-through', color: colors.text3 }]} numberOfLines={2}>
          {reminder.title}
        </Text>
      }
      subtitle={
        <Text style={[s.muted, { fontVariant: ['tabular-nums'] }, overdue && { color: colors.danger }, reminder.done && { color: colors.success }]} numberOfLines={1}>
          {reminder.done ? 'Сделано' : parts.join(' · ')}
        </Text>
      }
      trailing={
        reminder.repeat ? (
          <Icon name="repeat" size={16} color={colors.text3} />
        ) : !showDate && !reminder.done ? null : showFriend && !friend ? (
          <Tag text="личное" />
        ) : null
      }
    />
  );
}
