import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { daysBetween, formatDayShort, formatRepeat, relativeDay, toISODate, todayISO } from '@/lib/dates';
import { nextAfterCurrent, reminderFuse, reminderOverdue } from '@/lib/events';
import { PRIORITY_LABELS, alpha, formatMinutes, fuseColor } from '@/lib/reminderList';
import { useStore } from '@/lib/store';
import type { Friend, Reminder } from '@/lib/types';
import { Avatar } from './Avatar';
import { Icon, type IconName } from './Icon';
import { removeReminder } from './ReminderSwipe';
import { IconCircle, ListRow, SelectedBadge, Tag, useTheme, type Tone } from './ui';

/** Значок дела «для себя»: ⧗ до срока, календарь — на дату и время, ↻ — повтор. */
export function reminderIcon(r: Reminder): IconName {
  return r.repeat ? 'repeat' : r.kind === 'at' ? 'calendar' : 'hourglass';
}

/**
 * Строка напоминания: аватар друга (или значок типа дела), текст, срок; справа — ярлык «через 2 дня».
 * `detailed` — вкладка «Напоминания»: под сроком чипы «сколько займёт» и «важность» (не задано — прочерк), «горящее»
 * подсвечено кромкой, внизу — фитиль: сколько времени осталось до срока.
 * Сделанное зачёркивается. «Сделано» и «Удалить» — свайпом (ReminderSwipe), для экранного диктора — действиями строки.
 */
export function ReminderRow({
  reminder,
  friend,
  showFriend = true,
  showDate = true,
  detailed = false,
  selected = false,
  selecting = false,
  onPress,
  onLongPress,
}: {
  reminder: Reminder;
  friend?: Friend | null;
  showFriend?: boolean;
  showDate?: boolean;
  detailed?: boolean;
  /** Режим выбора: строка отмечена. */
  selected?: boolean;
  /** Режим выбора включён — нажатие отмечает строку, а не открывает её. */
  selecting?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
}) {
  const { toggleReminderDone, deleteReminder } = useStore();
  const { s, colors } = useTheme();
  const now = new Date();
  const today = todayISO();
  const r = reminder;
  const overdue = reminderOverdue(r, now);
  const diff = daysBetween(today, r.date);
  const at = !r.repeat && r.kind === 'at';
  const due = !r.repeat && !at;
  const daily = due && !!r.daily;
  // «Горит»: дело «до срока», а осталось не больше двух дней.
  const soon = !r.done && !overdue && due && diff <= 2;

  const doneText = () => {
    if (r.repeat) {
      const next = nextAfterCurrent(r);
      return `Сделано · снова ${next ? (daysBetween(today, next) === 1 ? 'завтра' : formatDayShort(next)) : ''}`;
    }
    const day = r.doneAt ? toISODate(new Date(r.doneAt)) : null;
    return `Сделано · ${day === today ? 'сегодня' : formatDayShort(day ?? r.date)}`;
  };
  const whenText = due ? (showDate ? `до ${formatDayShort(r.date)}` : 'срок сегодня') : showDate ? `${formatDayShort(r.date)} · ${r.time}` : r.time;
  const subtitle = r.done ? doneText() : whenText;
  // Вторая строка в ленте и карточке друга: повтор или «каждый день в 12:00»; после срока ежедневные уже не приходят.
  const caption = detailed || r.done ? null : r.repeat ? formatRepeat(r.repeat) : daily && !overdue ? (showDate ? `каждый день в ${r.time}` : 'каждый день до срока') : null;

  const tone: Tone = diff === 0 ? 'solid' : soon ? 'warn' : diff <= 7 ? 'accent' : 'neutral';
  const trailing = r.done ? null : overdue ? (
    <Tag text="просрочено" tone="danger" />
  ) : at && diff === 0 ? (
    <Tag text={`в ${r.time}`} tone="solid" />
  ) : showDate ? (
    <Tag text={relativeDay(r.date, today)} tone={tone} />
  ) : null;

  const leadingIcon = r.done ? <IconCircle icon="check" tone="success" size={40} /> : <IconCircle icon={detailed ? reminderIcon(r) : 'person'} size={40} />;

  const row = (
    <ListRow
      onPress={onPress ?? (() => router.push({ pathname: '/reminder/edit', params: { id: r.id } }))}
      onLongPress={onLongPress}
      style={selected ? { backgroundColor: colors.soft } : undefined}
      leading={
        showFriend ? (
          <View>
            {friend ? <Avatar friend={friend} size={40} /> : leadingIcon}
            {selecting && selected && <SelectedBadge />}
          </View>
        ) : undefined
      }
      accessibilityActions={selecting ? undefined : [{ name: 'done', label: r.done ? 'Вернуть в активные' : 'Сделано' }, { name: 'delete', label: 'Удалить' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'done') toggleReminderDone(r.id);
        else if (e.nativeEvent.actionName === 'delete') removeReminder(r, deleteReminder);
      }}
      title={
        <Text style={[s.title, r.done && { textDecorationLine: 'line-through', color: colors.text3 }]} numberOfLines={2}>
          {r.title}
        </Text>
      }
      subtitle={
        <View style={{ gap: 1 }}>
          <Text style={[s.muted, { fontVariant: ['tabular-nums'] }, overdue && { color: colors.danger }, r.done && { color: colors.success }]} numberOfLines={1}>
            {subtitle}
          </Text>
          {caption && (
            <Text style={s.caption} numberOfLines={1}>
              {caption}
            </Text>
          )}
          {detailed && !r.done && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 5 }}>
              <Meta icon="clock" text={r.minutes ? formatMinutes(r.minutes) : '—'} label="Сколько займёт" />
              <Meta
                icon="flag"
                text={r.priority ? PRIORITY_LABELS[r.priority] : '—'}
                label="Важность"
                color={r.priority === 3 ? colors.danger : r.priority === 2 ? colors.warn : undefined}
              />
              {r.repeat && <Meta icon="repeat" text={formatRepeat(r.repeat)} label="Повтор" />}
              {daily && !overdue && <Meta icon="bell" text="каждый день" label="Напоминаю" />}
            </View>
          )}
        </View>
      }
      trailing={trailing}
    />
  );
  if (!detailed) return row;

  // Вкладка «Напоминания»: кромка и фон у горящего, фитиль внизу.
  const edge = !r.done && overdue ? colors.danger : soon ? colors.warn : null;
  const fuse = reminderFuse(r, now);
  return (
    <View style={edge ? { backgroundColor: alpha(edge, 0.08) } : undefined}>
      {edge && <View style={{ position: 'absolute', left: 0, top: 10, bottom: 10, width: 3, borderTopRightRadius: 3, borderBottomRightRadius: 3, backgroundColor: edge }} />}
      {row}
      {fuse !== null && fuse > 0 && (
        <View
          testID="fuse"
          accessibilityLabel={`Осталось ${Math.round(fuse * 100)}% времени до срока`}
          style={{ position: 'absolute', left: 0, bottom: 0, height: 2, width: `${fuse * 100}%`, backgroundColor: fuseColor(fuse, colors), opacity: 0.55, borderTopRightRadius: 1, borderBottomRightRadius: 1 }}
        />
      )}
    </View>
  );
}

/** Чип под сроком: значок и текст; не задано — прочерк. */
function Meta({ icon, text, label, color }: { icon: IconName; text: string; label: string; color?: string }) {
  const { colors, fonts } = useTheme();
  const fg = color ?? colors.text2;
  return (
    <View
      accessibilityLabel={`${label}: ${text === '—' ? 'не задано' : text}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: color ? alpha(color, 0.14) : colors.chip }}
    >
      <Icon name={icon} size={12} color={fg} strokeWidth={2.2} />
      <Text style={{ fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, color: fg }}>{text}</Text>
    </View>
  );
}
