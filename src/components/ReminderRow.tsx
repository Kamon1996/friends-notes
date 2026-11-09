import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { combine, daysBetween, formatDayShort, formatRepeat, relativeDay, todayISO } from '@/lib/dates';
import { useStore } from '@/lib/store';
import type { Friend, Reminder } from '@/lib/types';
import { Avatar } from './Avatar';
import { Checkbox, IconCircle, ListRow, Tag, useTheme } from './ui';

/**
 * Строка напоминания: кружок-чекбокс, аватар друга (или значок «для себя»), текст, дата.
 * Справа — ярлык срока, как у событий. Сделанное зачёркивается, просроченное краснеет подписью.
 */
export function ReminderRow({
  reminder,
  friend,
  showFriend = true,
  showDate = true,
  selected = false,
  selecting = false,
  onPress,
  onLongPress,
}: {
  reminder: Reminder;
  friend?: Friend | null;
  showFriend?: boolean;
  showDate?: boolean;
  /** Режим выбора: строка отмечена. */
  selected?: boolean;
  /** Режим выбора включён — нажатие отмечает строку, а не открывает её. */
  selecting?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
}) {
  const { toggleReminderDone } = useStore();
  const { s, colors } = useTheme();
  const today = todayISO();
  const overdue = !reminder.done && combine(reminder.date, reminder.time) < new Date();
  const diff = daysBetween(today, reminder.date);

  // «Каждый день до срока»: срок в первой строке, а под ним — когда напоминаем (как повтор у повторяющихся).
  const daily = !reminder.repeat && !!reminder.daily;
  const when = daily && showDate ? `до ${formatDayShort(reminder.date)}` : showDate ? `${formatDayShort(reminder.date)} · ${reminder.time}` : reminder.time;
  const subtitle = reminder.done ? `Сделано · ${formatDayShort(reminder.date)}` : when;
  // Вторая строка: повтор или «каждый день в 12:00»; после срока ежедневные уже не приходят — строки нет.
  const dailyText = showDate ? `каждый день в ${reminder.time}` : 'каждый день до срока';
  const repeat = reminder.done ? null : reminder.repeat ? formatRepeat(reminder.repeat) : daily && !overdue ? dailyText : null;

  const trailing = reminder.done ? null : overdue ? (
    <Tag text="просрочено" tone="danger" />
  ) : showDate ? (
    <Tag text={relativeDay(reminder.date, today)} tone={diff === 0 ? 'solid' : diff <= 7 ? 'accent' : 'neutral'} />
  ) : null;

  return (
    <ListRow
      onPress={onPress ?? (() => router.push({ pathname: '/reminder/edit', params: { id: reminder.id } }))}
      onLongPress={onLongPress}
      style={selected ? { backgroundColor: colors.soft } : undefined}
      leading={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 6 }}>
          {selecting ? (
            <Checkbox checked={selected} onPress={onPress ?? (() => {})} />
          ) : (
            <Checkbox checked={reminder.done} done onPress={() => toggleReminderDone(reminder.id)} />
          )}
          {showFriend && (friend ? <Avatar friend={friend} size={30} /> : <IconCircle icon="person" size={30} />)}
        </View>
      }
      title={
        <Text style={[s.title, reminder.done && { textDecorationLine: 'line-through', color: colors.text3 }]} numberOfLines={2}>
          {reminder.title}
        </Text>
      }
      subtitle={
        <View style={{ gap: 1 }}>
          <Text style={[s.muted, { fontVariant: ['tabular-nums'] }, overdue && { color: colors.danger }, reminder.done && { color: colors.success }]} numberOfLines={1}>
            {subtitle}
          </Text>
          {repeat && (
            <Text style={s.caption} numberOfLines={1}>
              {repeat}
            </Text>
          )}
        </View>
      }
      trailing={trailing}
    />
  );
}
