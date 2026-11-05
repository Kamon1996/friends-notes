import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { formatDateShort, formatRepeat, relativeDay, combine } from '@/lib/dates';
import { useStore } from '@/lib/store';
import type { Friend, Reminder } from '@/lib/types';
import { Checkbox, colors, styles } from './ui';

export function ReminderRow({ reminder, friend }: { reminder: Reminder; friend?: Friend | null }) {
  const { toggleReminderDone } = useStore();
  const overdue = !reminder.done && combine(reminder.date, reminder.time) < new Date();

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/reminder/edit', params: { id: reminder.id } })}
      style={({ pressed }) => [styles.card, styles.row, pressed && { opacity: 0.7 }]}
    >
      <Checkbox checked={reminder.done} onPress={() => toggleReminderDone(reminder.id)} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={[styles.title, reminder.done && { textDecorationLine: 'line-through', color: colors.muted }]}
          numberOfLines={2}
        >
          {reminder.title}
        </Text>
        <Text style={[styles.muted, overdue && { color: colors.danger, fontWeight: '600' }]}>
          {formatDateShort(reminder.date)}, {reminder.time} · {overdue ? 'просрочено' : relativeDay(reminder.date)}
        </Text>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
          {reminder.repeat && <Tag text={`🔁 ${formatRepeat(reminder.repeat)}`} />}
          {friend ? <Tag text={`${friend.emoji} ${friend.name}`} /> : <Tag text="🙋 личное" />}
        </View>
      </View>
    </Pressable>
  );
}

function Tag({ text }: { text: string }) {
  return (
    <View style={{ backgroundColor: colors.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Text style={{ fontSize: 12, color: colors.muted }}>{text}</Text>
    </View>
  );
}
