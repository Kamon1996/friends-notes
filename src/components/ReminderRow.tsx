import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { daysBetween, formatDayShort, formatRepeat, relativeDay, toISODate, todayISO } from '@/lib/dates';
import { nextAfterCurrent, reminderFuse, reminderOverdue } from '@/lib/events';
import { PRIORITY_LABELS, formatMinutes, fuseColor, ringLabel, taskWhen } from '@/lib/reminderList';
import { useStore } from '@/lib/store';
import type { Friend, Priority, Reminder } from '@/lib/types';
import { Avatar } from './Avatar';
import { Icon, type IconName } from './Icon';
import { removeReminder } from './ReminderSwipe';
import { IconCircle, ListRow, SelectedBadge, Tag, useTheme, type Tone } from './ui';

/** Значок дела «для себя»: ⧗ до срока, календарь — на дату и время, ↻ — повтор. */
export function reminderIcon(r: Reminder): IconName {
  return r.repeat ? 'repeat' : r.kind === 'at' ? 'calendar' : 'hourglass';
}

/** Важность стрелками: вниз — низкая, вверх — средняя, двойная вверх — важно. */
export const PRIORITY_ICON: Record<Priority, IconName> = { 1: 'chevronDown', 2: 'chevronUp', 3: 'chevronsUp' };

type RowProps = {
  reminder: Reminder;
  friend?: Friend | null;
  showFriend?: boolean;
  showDate?: boolean;
  /** Вкладка «Напоминания»: кольцо-фитиль со сроком, детали значками в подписи, справа — дата. */
  detailed?: boolean;
  /** Режим выбора: строка отмечена. */
  selected?: boolean;
  /** Режим выбора включён — нажатие отмечает строку, а не открывает её. */
  selecting?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
};

/** «Сделано · сегодня», у повторяющегося — «Сделано · снова завтра». */
function doneText(r: Reminder, today: string): string {
  if (r.repeat) {
    const next = nextAfterCurrent(r);
    return `Сделано · снова ${next ? (daysBetween(today, next) === 1 ? 'завтра' : formatDayShort(next)) : ''}`;
  }
  const day = r.doneAt ? toISODate(new Date(r.doneAt)) : null;
  return `Сделано · ${day === today ? 'сегодня' : formatDayShort(day ?? r.date)}`;
}

/**
 * Строка напоминания: аватар друга (или значок типа дела), текст, срок; справа — ярлык «через 2 дня» (лента, карточка
 * друга). На вкладке «Напоминания» (`detailed`) — своя строка, TaskRow.
 * Сделанное зачёркивается. «Сделано» и «Удалить» — свайпом (ReminderSwipe), для экранного диктора — действиями строки.
 */
export function ReminderRow(props: RowProps) {
  const { reminder: r, friend, showFriend = true, showDate = true, detailed = false, selected = false, selecting = false, onPress, onLongPress } = props;
  const { toggleReminderDone, deleteReminder } = useStore();
  const { s, colors } = useTheme();
  if (detailed) return <TaskRow {...props} />;
  const now = new Date();
  const today = todayISO();
  const overdue = reminderOverdue(r, now);
  const diff = daysBetween(today, r.date);
  const at = !r.repeat && r.kind === 'at';
  const due = !r.repeat && !at;
  const daily = due && !!r.daily;
  // «Горит»: дело «до срока», а осталось не больше двух дней.
  const soon = !r.done && !overdue && due && diff <= 2;

  const whenText = due ? (showDate ? `до ${formatDayShort(r.date)}` : 'срок сегодня') : showDate ? `${formatDayShort(r.date)} · ${r.time}` : r.time;
  const subtitle = r.done ? doneText(r, today) : whenText;
  // Вторая строка: повтор или «каждый день в 12:00»; после срока ежедневные уже не приходят.
  const caption = r.done ? null : r.repeat ? formatRepeat(r.repeat) : daily && !overdue ? (showDate ? `каждый день в ${r.time}` : 'каждый день до срока') : null;

  const tone: Tone = diff === 0 ? 'solid' : soon ? 'warn' : diff <= 7 ? 'accent' : 'neutral';
  const trailing = r.done ? null : overdue ? (
    <Tag text="просрочено" tone="danger" />
  ) : at && diff === 0 ? (
    <Tag text={`в ${r.time}`} tone="solid" />
  ) : showDate ? (
    <Tag text={relativeDay(r.date, today)} tone={tone} />
  ) : null;

  const leadingIcon = r.done ? <IconCircle icon="check" tone="success" size={40} /> : <IconCircle icon="person" size={40} />;

  return (
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
        </View>
      }
      trailing={trailing}
    />
  );
}

/**
 * Строка вкладки «Напоминания» — в духе «Друзей» и «Календаря»: две строки.
 * Слева — кольцо-фитиль: внутри сколько осталось («3 дня», «сег.», у просроченного — «!»), кольцо догорает к сроку
 * (зелёное → янтарное → красное). У дела для друга — его аватар у кольца, у встречи и повтора — значок типа.
 * Подпись — какой срок и детали значками, только заданные: ⏱ сколько займёт, стрелки важности, звенящий колокольчик
 * «каждый день». Справа — дата (у сегодняшних не нужна: «сег.» в кольце).
 */
function TaskRow({ reminder: r, friend, showFriend = true, selected = false, selecting = false, onPress, onLongPress }: RowProps) {
  const { toggleReminderDone, deleteReminder } = useStore();
  const { s, colors, fonts } = useTheme();
  const now = new Date();
  const today = todayISO();
  const overdue = !r.done && reminderOverdue(r, now);
  const diff = daysBetween(today, r.date);
  const daily = !r.repeat && r.kind !== 'at' && !!r.daily && !overdue;

  const leading = r.done ? (
    <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
      {friend && showFriend ? <Avatar friend={friend} size={40} /> : <IconCircle icon="check" tone="success" size={40} />}
    </View>
  ) : (
    <CountRing r={r} friend={showFriend ? friend : null} today={today} overdue={overdue} corner={!(selecting && selected)} />
  );

  return (
    <ListRow
      onPress={onPress ?? (() => router.push({ pathname: '/reminder/edit', params: { id: r.id } }))}
      onLongPress={onLongPress}
      style={selected ? { backgroundColor: colors.soft } : undefined}
      leading={
        <View>
          {leading}
          {selecting && selected && <SelectedBadge />}
        </View>
      }
      accessibilityActions={selecting ? undefined : [{ name: 'done', label: r.done ? 'Вернуть в активные' : 'Сделано' }, { name: 'delete', label: 'Удалить' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'done') toggleReminderDone(r.id);
        else if (e.nativeEvent.actionName === 'delete') removeReminder(r, deleteReminder);
      }}
      title={
        <Text style={[s.title, r.done && { textDecorationLine: 'line-through', color: colors.text3 }]} numberOfLines={1}>
          {r.title}
        </Text>
      }
      subtitle={
        r.done ? (
          <Text style={[s.muted, { color: colors.success }]} numberOfLines={1}>
            {doneText(r, today)}
          </Text>
        ) : (
          // Срок и значки одной строкой; не влезли — значки переносятся строкой ниже.
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8 }}>
            <Text style={[s.muted, { fontVariant: ['tabular-nums'] }, overdue && { color: colors.danger }]} numberOfLines={1}>
              {taskWhen(r, today, overdue)}
            </Text>
            {!!r.minutes && (
              <View accessibilityLabel={`Сколько займёт: ${formatMinutes(r.minutes)}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Icon name="stopwatch" size={13} color={colors.text3} strokeWidth={2.1} />
                <Text style={[s.muted, { color: colors.text2 }]}>{formatMinutes(r.minutes)}</Text>
              </View>
            )}
            {!!r.priority && (
              <View accessibilityLabel={`Важность: ${PRIORITY_LABELS[r.priority]}`}>
                <Icon
                  name={PRIORITY_ICON[r.priority]}
                  size={15}
                  strokeWidth={2.8}
                  color={r.priority === 3 ? colors.danger : r.priority === 2 ? colors.warn : colors.text3}
                />
              </View>
            )}
            {daily && (
              <View accessibilityLabel="Напоминаю каждый день">
                <Icon name="bellRing" size={14} color={colors.text3} strokeWidth={2.1} />
              </View>
            )}
          </View>
        )
      }
      trailing={
        !r.done && diff !== 0 ? (
          <Text style={{ fontFamily: fonts.medium, fontSize: 12.5, color: overdue ? colors.danger : colors.text3, fontVariant: ['tabular-nums'] }}>
            {formatDayShort(r.date, today)}
          </Text>
        ) : undefined
      }
    />
  );
}

const RING = 44;
const STROKE = 2.5;

/** Кольцо-фитиль со сроком внутри; у дела для друга — его аватар в углу, у встречи и повтора — значок типа. */
function CountRing({ r, friend, today, overdue, corner }: { r: Reminder; friend?: Friend | null; today: string; overdue: boolean; corner: boolean }) {
  const { colors, fonts } = useTheme();
  const fuse = reminderFuse(r) ?? 0;
  const { main, unit } = ringLabel(r.date, today, overdue);
  const rad = (RING - STROKE) / 2;
  const circ = 2 * Math.PI * rad;
  // Угол занят галочкой выбора — значок прячем.
  const badge: IconName | null = !corner || friend ? null : r.repeat ? 'repeat' : r.kind === 'at' ? 'calendar' : null;
  return (
    <View
      style={{ width: RING, height: RING, alignItems: 'center', justifyContent: 'center' }}
      accessibilityLabel={overdue ? 'Просрочено' : unit ? `Осталось ${main} ${unit}` : 'Срок сегодня'}
    >
      <Svg width={RING} height={RING} style={StyleSheet.absoluteFill}>
        <Circle cx={RING / 2} cy={RING / 2} r={rad} fill="none" stroke={overdue ? colors.danger : colors.hairline} strokeWidth={STROKE} />
        {fuse > 0 && (
          <Circle
            cx={RING / 2}
            cy={RING / 2}
            r={rad}
            fill="none"
            stroke={fuseColor(fuse, colors)}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${circ * fuse} ${circ}`}
            transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
          />
        )}
      </Svg>
      {/* Метка для тестов и диктора: сколько времени до срока осталось. */}
      {fuse > 0 && (
        <View testID="fuse" accessibilityLabel={`Осталось ${Math.round(fuse * 100)}% времени до срока`} pointerEvents="none" style={StyleSheet.absoluteFill} />
      )}
      <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center' }}>
        {/* Кружок фиксированного размера — крупный системный шрифт растим не больше чем на 20 %. */}
        <Text
          maxFontSizeMultiplier={1.2}
          style={{
            fontFamily: fonts.bold,
            fontSize: main.length > 2 ? 11 : 15,
            lineHeight: main.length > 2 ? 13 : 17,
            color: overdue ? colors.danger : colors.text,
            fontVariant: ['tabular-nums'],
          }}
        >
          {main}
        </Text>
        {unit && (
          <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.medium, fontSize: 8, lineHeight: 10, color: colors.text3 }}>
            {unit}
          </Text>
        )}
      </View>
      {friend && corner ? (
        // Чуть за кольцом — не закрывает «дней» внутри.
        <View style={{ position: 'absolute', right: -8, bottom: -5, borderRadius: 12, borderWidth: 2, borderColor: colors.card }}>
          <Avatar friend={friend} size={18} />
        </View>
      ) : badge ? (
        <View
          style={{
            position: 'absolute',
            right: -8,
            bottom: -5,
            width: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: colors.chip,
            borderWidth: 2,
            borderColor: colors.card,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name={badge} size={10} color={colors.text2} strokeWidth={2.6} />
        </View>
      ) : null}
    </View>
  );
}
