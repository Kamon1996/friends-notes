import { router } from 'expo-router';
import { useBottomTabBarHeight } from 'expo-router/tabs';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

import { AiButton } from '@/components/ai/AiIcon';
import { AiSheet } from '@/components/ai/AiSheet';
import { AiToast } from '@/components/ai/AiToast';
import { FriendRow } from '@/components/FriendRow';
import { Icon } from '@/components/Icon';
import { SelectionBar } from '@/components/SelectionBar';
import { TelegramImportCard } from '@/components/TelegramImportCard';
import { Button, Chip, Empty, Fab, GroupedRow, IconButton, ScreenHeader, SearchField, useTheme } from '@/components/ui';
import { confirm } from '@/lib/confirm';
import { daysBetween, nextAnniversary, plural, todayISO } from '@/lib/dates';
import { buildFriendList, type FriendListItem, type FriendSort } from '@/lib/friendList';
import { useStore } from '@/lib/store';
import { telegramAvailable } from '@/lib/telegramClient';
import { zodiacShown } from '@/lib/zodiac';

export default function FriendsScreen() {
  const { data, deleteFriends, updateFriends, genderBusy, genderNews, clearGenderNews } = useStore();
  const [aiOpen, setAiOpen] = useState(false);
  // Для «Пола друзей»: экран ИИ рисует список с той же высоты, что здесь, и не закрывает нижнее меню.
  const listRef = useRef<FlatList<FriendListItem>>(null);
  const headerH = useRef(0);
  const labelH = useRef(0);
  const tabBar = useBottomTabBarHeight();
  const { s, colors } = useTheme();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<FriendSort>('name');
  // Режим выбора (долгое нажатие на строку): отмеченные друзья, как в Telegram.
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const selecting = selected.size > 0;
  const [scrolled, setScrolled] = useState(false);
  const today = todayISO();

  const items = useMemo(() => buildFriendList(data.friends, query, sort, today), [data.friends, query, sort, today]);

  const n = data.friends.length;
  const inMonth = data.friends.filter((f) => f.birthday && daysBetween(today, nextAnniversary(f.birthday, today)) <= 30).length;

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
    const first = data.friends.find((f) => f.id === ids[0]);
    const title = ids.length === 1 && first ? `Удалить «${first.name}»?` : `Удалить ${ids.length} ${plural(ids.length, 'друга', 'друзей', 'друзей')}?`;
    const text = ids.length === 1 ? 'Вместе с другом удалятся и его напоминания.' : 'Вместе с ними удалятся и их напоминания.';
    if (!(await confirm(title, text))) return false;
    deleteFriends(ids);
    clear();
    return true;
  };

  const allFavorite = [...selected].every((id) => data.friends.find((f) => f.id === id)?.favorite);
  const allMuted = [...selected].every((id) => data.friends.find((f) => f.id === id)?.muted);
  const toggleFavorites = () => {
    updateFriends((f) => (selected.has(f.id) ? { ...f, favorite: !allFavorite } : f));
    clear();
  };
  const toggleMuted = () => {
    updateFriends((f) => (selected.has(f.id) ? { ...f, muted: !allMuted } : f));
    clear();
  };

  return (
    <View style={s.screen}>
      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={(i) => i.key}
        extraData={selected}
        contentContainerStyle={{ paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        onScroll={(e) => setScrolled(e.nativeEvent.contentOffset.y > 2)}
        scrollEventThrottle={32}
        ListHeaderComponent={
          <View onLayout={(e) => (headerH.current = e.nativeEvent.layout.height)}>
            {/* В режиме выбора шапка остаётся на месте, но прячется: панель действий ложится поверх, и список не прыгает. */}
            <View style={{ opacity: selecting ? 0 : 1, pointerEvents: selecting ? 'none' : 'auto' }} importantForAccessibility={selecting ? 'no-hide-descendants' : 'auto'}>
              <ScreenHeader
                title="Друзья"
                subtitle={n ? `${n} ${plural(n, 'человек', 'человека', 'человек')}${inMonth ? ` · ${inMonth} ${plural(inMonth, 'день рождения', 'дня рождения', 'дней рождения')} в ближайший месяц` : ''}` : undefined}
                right={
                  <>
                    {n > 0 && <AiButton busy={genderBusy} onPress={() => setAiOpen(true)} />}
                    <IconButton icon="import" label="Импорт друзей" onPress={() => router.push('/import')} />
                    <IconButton icon="sliders" label="Настройки" onPress={() => router.push('/settings')} />
                  </>
                }
              />
            </View>
            {n > 0 && (
              <View style={{ padding: 20, paddingTop: 14, paddingBottom: 16, gap: 10 }}>
                <SearchField value={query} onChangeText={setQuery} placeholder="Поиск по имени" />
                <View style={s.chips}>
                  <Chip label="По имени" selected={sort === 'name'} onPress={() => setSort('name')} />
                  <Chip label="Скоро день рождения" icon="cake" selected={sort === 'date'} onPress={() => setSort('date')} />
                </View>
              </View>
            )}
            <TelegramImportCard style={{ marginHorizontal: 20, marginBottom: 12 }} />
          </View>
        }
        renderItem={({ item, index }) =>
          item.type === 'label' ? (
            <View
              onLayout={index === 0 ? (e) => (labelH.current = e.nativeEvent.layout.height) : undefined}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 24, paddingTop: 10, paddingBottom: 6 }}
            >
              {item.star && <Icon name="star" size={13} color={colors.accent} fill={colors.accent} />}
              <Text style={[s.name, { fontSize: 13, color: item.star ? colors.accentText : s.caption.color }]}>{item.title}</Text>
            </View>
          ) : (
            <View style={{ paddingHorizontal: 20 }}>
              <GroupedRow first={item.first} last={item.last} inset={70}>
                <SwipeToDelete enabled={!selecting} onDelete={() => remove([item.friend.id])}>
                  <FriendRow
                    friend={item.friend}
                    today={today}
                    selected={selected.has(item.friend.id)}
                    selecting={selecting}
                    zodiac={zodiacShown(data.settings)}
                    onPress={selecting ? () => toggle(item.friend.id) : () => router.push(`/friend/${item.friend.id}`)}
                    onLongPress={() => toggle(item.friend.id)}
                  />
                </SwipeToDelete>
              </GroupedRow>
            </View>
          )
        }
        ListEmptyComponent={
          n === 0 ? (
            <View style={{ gap: 10, padding: 20 }}>
              <Empty
                icon="people"
                title="Пока никого"
                text="Импортируй друзей из контактов телефона вместе с днями рождения — или добавь первого вручную."
              />
              <Button title="Импорт из контактов" icon="import" onPress={() => router.push('/import')} />
              {telegramAvailable && <Button title="Импорт из Telegram" icon="send" variant="secondary" onPress={() => router.push('/telegram')} />}
            </View>
          ) : (
            <Empty icon="search" title="Никого не нашлось" text="Попробуй другой запрос." />
          )
        }
      />
      {selecting && (
        <SelectionBar
          count={selected.size}
          scrolled={scrolled}
          onClose={clear}
          actions={[
            { icon: 'star', label: allFavorite ? 'Убрать из избранного' : 'В избранное', color: allFavorite ? colors.accent : undefined, fill: allFavorite ? colors.accent : undefined, onPress: toggleFavorites },
            { icon: allMuted ? 'bell' : 'bellOff', label: allMuted ? 'Включить уведомления' : 'Выключить уведомления', onPress: toggleMuted },
            { icon: 'trash', label: 'Удалить выбранных', color: colors.danger, onPress: () => remove([...selected]) },
          ]}
        />
      )}
      {!selecting && <Fab onPress={() => router.push('/friend/edit')} label="Добавить друга" />}
      <AiSheet
        visible={aiOpen}
        onClose={() => setAiOpen(false)}
        gender={{ known: data.friends.filter((f) => f.gender).length, total: n }}
        onGender={() => {
          setAiOpen(false);
          // Список — к началу и «по имени»: экран ИИ начинает с того же вида и плавно проявляется поверх.
          setQuery('');
          setSort('name');
          listRef.current?.scrollToOffset({ offset: 0, animated: false });
          const first = items[0]?.type === 'label' ? labelH.current : 0;
          clearGenderNews();
          setTimeout(() => router.push({ pathname: '/ai-gender', params: { top: String(Math.round(headerH.current + first)), tab: String(Math.round(tabBar)) } }), 230);
        }}
      />
      <AiToast news={genderNews} onDone={clearGenderNews} bottom={selecting ? 90 : 96} />
    </View>
  );
}

/** Свайп влево открывает красную кнопку «Удалить»; само удаление — только после подтверждения. */
function SwipeToDelete({ enabled, onDelete, children }: { enabled: boolean; onDelete: () => Promise<boolean>; children: ReactNode }) {
  const ref = useRef<SwipeableMethods>(null);
  const { colors, fonts } = useTheme();
  return (
    <ReanimatedSwipeable
      ref={ref}
      enabled={enabled}
      friction={2}
      rightThreshold={48}
      overshootRight={false}
      childrenContainerStyle={{ backgroundColor: colors.card }}
      renderRightActions={() => (
        <Pressable
          accessibilityLabel="Удалить"
          onPress={async () => {
            if (!(await onDelete())) ref.current?.close();
          }}
          style={({ pressed }) => ({ width: 92, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', gap: 4, opacity: pressed ? 0.85 : 1 })}
        >
          <Icon name="trash" size={22} color="#FFFFFF" strokeWidth={2} />
          <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: '#FFFFFF' }}>Удалить</Text>
        </Pressable>
      )}
    >
      {children}
    </ReanimatedSwipeable>
  );
}
