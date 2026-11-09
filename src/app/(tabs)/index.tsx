import { router, useIsFocused } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
// Строка фильтров — прокрутка из обработчика жестов: свайп по ней листает фильтры, а не вкладки.
import { ScrollView } from 'react-native-gesture-handler';

import { ReminderRow } from '@/components/ReminderRow';
import { ReminderSwipe } from '@/components/ReminderSwipe';
import { SelectionBar } from '@/components/SelectionBar';
import { TabSwipe } from '@/components/TabSwipe';
import type { IconName } from '@/components/Icon';
import { Chip, Empty, Fab, GroupedRow, IconButton, ScreenHeader, useTheme } from '@/components/ui';
import { confirm } from '@/lib/confirm';
import { plural, todayISO } from '@/lib/dates';
import { reminderOverdue } from '@/lib/events';
import { reminderSections, type ReminderFilter } from '@/lib/reminderList';
import { useStore } from '@/lib/store';
import type { Reminder } from '@/lib/types';

const FILTERS: { key: ReminderFilter; label: string; icon?: IconName }[] = [
  { key: 'all', label: 'Все' },
  { key: 'quick', label: 'Быстрые', icon: 'bolt' },
  { key: 'important', label: 'Важные', icon: 'chevronsUp' },
  { key: 'personal', label: 'Для себя' },
  { key: 'friends', label: 'Друзья' },
  { key: 'done', label: 'Сделанные', icon: 'check' },
];

const EMPTY: Record<ReminderFilter, string> = {
  all: 'Напоминаний нет',
  quick: 'Быстрых дел нет',
  important: 'Важных дел нет',
  personal: 'Дел для себя нет',
  friends: 'Дел для друзей нет',
  done: 'Пока ничего не сделано',
};
const EMPTY_TEXT: Partial<Record<ReminderFilter, string>> = {
  quick: 'Быстрые — те, что займут до 30 минут. Укажи «Сколько займёт» в деле.',
  important: 'Отметь важность «Важно» в деле — и оно появится здесь.',
};

type Item = { type: 'label'; key: string; text: string } | { type: 'reminder'; key: string; reminder: Reminder; first: boolean; last: boolean };

/** Первый запуск (ни друзей, ни дел) уже отправили на «Друзей» — за один запуск только раз, чтобы «назад» не зациклился. */
let sentToFriends = false;

export default function RemindersScreen() {
  const { ready, data, setRemindersDone, deleteReminders } = useStore();
  // Первый запуск — сначала «Друзья»: без них приложению нечего показать, а импорт — там. Только если открыта именно
  // эта вкладка: соседние вкладки подгружаются заранее, и открытый по ссылке «Календарь» не должен уезжать.
  const focused = useIsFocused();
  const firstRun = ready && focused && !sentToFriends && data.friends.length === 0 && data.reminders.length === 0;
  useEffect(() => {
    if (!firstRun) return;
    sentToFriends = true;
    router.replace('/friends');
  }, [firstRun]);
  const { s, colors } = useTheme();
  const [filter, setFilter] = useState<ReminderFilter>('all');
  // Режим выбора (долгое нажатие на строку): отмеченные напоминания, как у друзей.
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const selecting = selected.size > 0;
  const [scrolled, setScrolled] = useState(false);

  const friendById = useMemo(() => new Map(data.friends.map((f) => [f.id, f])), [data.friends]);

  const items = useMemo(() => {
    const out: Item[] = [];
    for (const g of reminderSections(data.reminders, filter)) {
      out.push({ type: 'label', key: `l-${g.key}`, text: g.title });
      g.rows.forEach((r, i) => out.push({ type: 'reminder', key: r.id, reminder: r, first: i === 0, last: i === g.rows.length - 1 }));
    }
    return out;
  }, [data.reminders, filter]);
  // Подсказку «можно провести» показывает первая строка.
  const hintKey = items.find((i) => i.type === 'reminder')?.key;

  const active = data.reminders.filter((r) => !r.done);
  const today = todayISO();
  const todayCount = active.filter((r) => r.date <= today).length;
  const overdueCount = active.filter((r) => reminderOverdue(r)).length;
  const subtitle = active.length
    ? [
        `${active.length} ${plural(active.length, 'дело', 'дела', 'дел')}`,
        todayCount && `${todayCount} на сегодня`,
        overdueCount && `${overdueCount} просрочено`,
      ]
        .filter(Boolean)
        .join(' · ')
    : undefined;

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
    const title =
      ids.length === 1 && first ? `Удалить «${first.title}»?` : `Удалить ${ids.length} ${plural(ids.length, 'напоминание', 'напоминания', 'напоминаний')}?`;
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

  // Пока данные читаются — пустой экран, без мелькания «Напоминаний нет».
  if (!ready) return <View style={s.screen} />;

  return (
    <TabSwipe tab="/" enabled={!selecting}>
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
              <View
                style={{ opacity: selecting ? 0 : 1, pointerEvents: selecting ? 'none' : 'auto' }}
                importantForAccessibility={selecting ? 'no-hide-descendants' : 'auto'}
              >
                <ScreenHeader
                  title="Напоминания"
                  subtitle={subtitle}
                  right={<IconButton icon="sliders" label="Настройки" onPress={() => router.push('/settings')} />}
                />
              </View>
              {/* Фильтры одной строкой с прокруткой: не занимают полэкрана над списком. */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 8 }}
              >
                {FILTERS.map((f) => (
                  <Chip key={f.key} label={f.label} icon={f.icon} selected={filter === f.key} onPress={() => setFilter(f.key)} />
                ))}
              </ScrollView>
            </>
          }
          renderItem={({ item }) =>
            item.type === 'label' ? (
              <Text style={[s.sectionLabel, { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 8 }]}>{item.text}</Text>
            ) : (
              <View style={{ paddingHorizontal: 20 }}>
                {/* Разделитель — от начала текста: кольцо шире аватара (44 вместо 40). */}
                <GroupedRow first={item.first} last={item.last} inset={70}>
                  <ReminderSwipe reminder={item.reminder} enabled={!selecting} hint={item.key === hintKey}>
                    <ReminderRow
                      detailed
                      reminder={item.reminder}
                      friend={item.reminder.friendId ? friendById.get(item.reminder.friendId) : null}
                      selected={selected.has(item.reminder.id)}
                      selecting={selecting}
                      onPress={selecting ? () => toggle(item.reminder.id) : undefined}
                      onLongPress={() => toggle(item.reminder.id)}
                    />
                  </ReminderSwipe>
                </GroupedRow>
              </View>
            )
          }
          ListEmptyComponent={
            <Empty
              icon="bell"
              title={EMPTY[filter]}
              text={EMPTY_TEXT[filter] ?? 'Создай напоминание: «купить билеты до пятницы», «стоматолог в среду в 15:00» или «написать маме раз в неделю».'}
            />
          }
        />
        {selecting && (
          <SelectionBar
            count={selected.size}
            scrolled={scrolled}
            onClose={clear}
            actions={[
              {
                icon: allDone ? 'repeat' : 'check',
                label: allDone ? 'Вернуть в активные' : 'Отметить сделанными',
                color: colors.success,
                onPress: markSelected,
              },
              { icon: 'trash', label: 'Удалить выбранные', color: colors.danger, onPress: () => remove([...selected]) },
            ]}
          />
        )}
        {!selecting && <Fab onPress={() => router.push('/reminder/edit')} label="Новое напоминание" />}
      </View>
    </TabSwipe>
  );
}
