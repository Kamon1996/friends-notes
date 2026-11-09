import { router } from 'expo-router';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

import { Icon } from '@/components/Icon';
import { ReminderRow } from '@/components/ReminderRow';
import { SelectionBar } from '@/components/SelectionBar';
import { Chip, Empty, Fab, GroupedRow, ScreenHeader, useTheme } from '@/components/ui';
import { confirm } from '@/lib/confirm';
import { combine, plural, todayISO } from '@/lib/dates';
import { useStore } from '@/lib/store';
import type { Reminder } from '@/lib/types';

type Filter = 'active' | 'personal' | 'friends' | 'done' | 'all';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'active', label: 'Активные' },
  { key: 'done', label: 'Сделанные' },
  { key: 'all', label: 'Все' },
  { key: 'personal', label: 'Для себя' },
  { key: 'friends', label: 'Друзья' },
];

type Item = { type: 'label'; key: string; text: string } | { type: 'reminder'; key: string; reminder: Reminder; first: boolean; last: boolean };

export default function RemindersScreen() {
  const { data, setRemindersDone, deleteReminders } = useStore();
  const { s, colors } = useTheme();
  const [filter, setFilter] = useState<Filter>('active');
  // Режим выбора (долгое нажатие на строку): отмеченные напоминания, как у друзей.
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const selecting = selected.size > 0;
  const [scrolled, setScrolled] = useState(false);

  const friendById = useMemo(() => new Map(data.friends.map((f) => [f.id, f])), [data.friends]);

  const items = useMemo(() => {
    const t = (r: Reminder) => combine(r.date, r.time).getTime();
    const asc = (a: Reminder, b: Reminder) => t(a) - t(b);
    const desc = (a: Reminder, b: Reminder) => t(b) - t(a);
    const active = data.reminders.filter((r) => !r.done).sort(asc);
    const done = data.reminders.filter((r) => r.done).sort(desc);
    let groups: { text: string; rows: Reminder[] }[];
    switch (filter) {
      case 'done':
        groups = [{ text: 'Сделанные', rows: done }];
        break;
      case 'all':
        groups = [
          { text: 'Активные', rows: active },
          { text: 'Сделанные', rows: done },
        ];
        break;
      default: {
        const list = filter === 'personal' ? active.filter((r) => !r.friendId) : filter === 'friends' ? active.filter((r) => !!r.friendId) : active;
        groups = [
          { text: 'Повторяющиеся', rows: list.filter((r) => r.repeat) },
          { text: 'Однократные', rows: list.filter((r) => !r.repeat) },
        ];
      }
    }
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

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const clear = () => setSelected(new Set());

  /** Удаление с подтверждением; возвращает false, если передумали. */
  const remove = async (ids: string[]) => {
    const first = data.reminders.find((r) => r.id === ids[0]);
    const title = ids.length === 1 && first ? `Удалить «${first.title}»?` : `Удалить ${ids.length} ${plural(ids.length, 'напоминание', 'напоминания', 'напоминаний')}?`;
    if (!(await confirm(title, 'Отменить это будет нельзя.'))) return false;
    deleteReminders(ids);
    clear();
    return true;
  };

  const allDone = [...selected].every((id) => data.reminders.find((r) => r.id === id)?.done);
  const markSelected = () => {
    setRemindersDone([...selected], !allDone);
    clear();
  };

  return (
    <View style={s.screen}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.key}
        extraData={selected}
        contentContainerStyle={{ paddingBottom: 120 }}
        onScroll={(e) => setScrolled(e.nativeEvent.contentOffset.y > 2)}
        scrollEventThrottle={32}
        ListHeaderComponent={
          <>
            <View style={{ opacity: selecting ? 0 : 1, pointerEvents: selecting ? 'none' : 'auto' }} importantForAccessibility={selecting ? 'no-hide-descendants' : 'auto'}>
              <ScreenHeader
                title="Напоминания"
                subtitle={active.length ? `${active.length} ${plural(active.length, 'активное', 'активных', 'активных')}${todayCount ? ` · ${todayCount} сегодня` : ''}` : undefined}
              />
            </View>
            {/* Фильтры одной строкой с прокруткой: не занимают полэкрана над списком. */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 8 }}>
              {FILTERS.map((f) => (
                <Chip key={f.key} label={f.label} selected={filter === f.key} onPress={() => setFilter(f.key)} />
              ))}
            </ScrollView>
          </>
        }
        renderItem={({ item }) =>
          item.type === 'label' ? (
            <Text style={[s.sectionLabel, { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 8 }]}>{item.text}</Text>
          ) : (
            <View style={{ paddingHorizontal: 20 }}>
              <GroupedRow first={item.first} last={item.last} inset={item.reminder.friendId ? 96 : 56}>
                <SwipeActions
                  enabled={!selecting}
                  done={item.reminder.done}
                  onDone={() => setRemindersDone([item.reminder.id], !item.reminder.done)}
                  onDelete={() => remove([item.reminder.id])}
                >
                  <ReminderRow
                    reminder={item.reminder}
                    friend={item.reminder.friendId ? friendById.get(item.reminder.friendId) : null}
                    selected={selected.has(item.reminder.id)}
                    selecting={selecting}
                    onPress={selecting ? () => toggle(item.reminder.id) : undefined}
                    onLongPress={() => toggle(item.reminder.id)}
                  />
                </SwipeActions>
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
      {selecting && (
        <SelectionBar
          count={selected.size}
          scrolled={scrolled}
          onClose={clear}
          actions={[
            { icon: allDone ? 'repeat' : 'check', label: allDone ? 'Вернуть в активные' : 'Отметить сделанными', color: colors.success, onPress: markSelected },
            { icon: 'trash', label: 'Удалить выбранные', color: colors.danger, onPress: () => remove([...selected]) },
          ]}
        />
      )}
      {!selecting && <Fab onPress={() => router.push('/reminder/edit')} label="Новое напоминание" />}
    </View>
  );
}

/**
 * Свайп вправо — «Сделано» (у сделанного — «Вернуть»): срабатывает сам, как только зелёная кнопка открылась.
 * Свайп влево — только открывает красную «Удалить»; удаление — по нажатию и с подтверждением.
 */
function SwipeActions({
  enabled,
  done,
  onDone,
  onDelete,
  children,
}: {
  enabled: boolean;
  done: boolean;
  onDone: () => void;
  onDelete: () => Promise<boolean>;
  children: ReactNode;
}) {
  const ref = useRef<SwipeableMethods>(null);
  const { colors, fonts } = useTheme();
  const action = (bg: string, icon: 'check' | 'repeat' | 'trash', label: string, onPress: () => void) => (
    <Pressable
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({ width: 92, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', gap: 4, opacity: pressed ? 0.85 : 1 })}
    >
      <Icon name={icon} size={22} color="#FFFFFF" strokeWidth={2} />
      <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: '#FFFFFF' }}>{label}</Text>
    </Pressable>
  );
  return (
    <ReanimatedSwipeable
      ref={ref}
      enabled={enabled}
      friction={2}
      leftThreshold={48}
      rightThreshold={48}
      overshootLeft={false}
      overshootRight={false}
      childrenContainerStyle={{ backgroundColor: colors.card }}
      // Направление — куда сдвинули строку (react-native-gesture-handler 3): 'right' — свайп вправо, открылась левая,
      // зелёная кнопка. Было 'left' — и свайп влево к «Удалить» отмечал сделанным: повторяющееся уезжало на следующий раз.
      onSwipeableOpen={(direction) => {
        if (direction === 'right') {
          onDone();
          ref.current?.close();
        }
      }}
      renderLeftActions={() =>
        action(colors.success, done ? 'repeat' : 'check', done ? 'Вернуть' : 'Сделано', () => {
          onDone();
          ref.current?.close();
        })
      }
      renderRightActions={() =>
        action(colors.danger, 'trash', 'Удалить', async () => {
          if (!(await onDelete())) ref.current?.close();
        })
      }
    >
      {children}
    </ReanimatedSwipeable>
  );
}
