import { router } from 'expo-router';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { SelectionBar } from '@/components/SelectionBar';
import { TelegramImportCard } from '@/components/TelegramImportCard';
import { ZodiacMark } from '@/components/ZodiacGlyph';
import { Button, Chip, Empty, Fab, GroupedRow, IconButton, ListRow, ScreenHeader, SearchField, Tag, useTheme } from '@/components/ui';
import { confirm } from '@/lib/confirm';
import { ageOn, daysBetween, formatDate, hasYear, nextAnniversary, plural, relativeDay, todayISO } from '@/lib/dates';
import { buildFriendList, type FriendSort } from '@/lib/friendList';
import { useStore } from '@/lib/store';
import { telegramAvailable } from '@/lib/telegramClient';
import type { Friend } from '@/lib/types';
import { zodiacShown } from '@/lib/zodiac';

export default function FriendsScreen() {
  const { data, deleteFriends, updateFriends } = useStore();
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
        data={items}
        keyExtractor={(i) => i.key}
        extraData={selected}
        contentContainerStyle={{ paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        onScroll={(e) => setScrolled(e.nativeEvent.contentOffset.y > 2)}
        scrollEventThrottle={32}
        ListHeaderComponent={
          <>
            {/* В режиме выбора шапка остаётся на месте, но прячется: панель действий ложится поверх, и список не прыгает. */}
            <View style={{ opacity: selecting ? 0 : 1, pointerEvents: selecting ? 'none' : 'auto' }} importantForAccessibility={selecting ? 'no-hide-descendants' : 'auto'}>
              <ScreenHeader
                title="Друзья"
                subtitle={n ? `${n} ${plural(n, 'человек', 'человека', 'человек')}${inMonth ? ` · ${inMonth} ${plural(inMonth, 'день рождения', 'дня рождения', 'дней рождения')} в ближайший месяц` : ''}` : undefined}
                right={
                  <>
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
          </>
        }
        renderItem={({ item }) =>
          item.type === 'label' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 24, paddingTop: 10, paddingBottom: 6 }}>
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

function FriendRow({
  friend,
  today,
  selected,
  selecting,
  zodiac,
  onPress,
  onLongPress,
}: {
  friend: Friend;
  today: string;
  /** Показывать маленький знак зодиака после даты. */
  zodiac: boolean;
  selected: boolean;
  selecting: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const { s, colors } = useTheme();
  const next = friend.birthday ? nextAnniversary(friend.birthday, today) : null;
  const diff = next ? daysBetween(today, next) : null;
  const age = friend.birthday && next && hasYear(friend.birthday) ? ageOn(friend.birthday, next) : null;
  const sub = friend.birthday
    ? `${formatDate(friend.birthday, false)}${age ? ` · ${age} ${plural(age, 'год', 'года', 'лет')}` : ''}`
    : [friend.flowers, friend.food].filter(Boolean).join(' · ') || 'Без дня рождения';

  return (
    <ListRow
      onPress={onPress}
      onLongPress={onLongPress}
      leading={
        <View>
          <Avatar friend={friend} size={44} />
          {selected && (
            <View
              style={{
                position: 'absolute',
                right: -3,
                bottom: -3,
                width: 20,
                height: 20,
                borderRadius: 10,
                backgroundColor: colors.success,
                borderWidth: 2,
                borderColor: colors.card,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="check" size={11} color="#FFFFFF" strokeWidth={3} />
            </View>
          )}
        </View>
      }
      title={<Text style={s.name} numberOfLines={1}>{friend.name}</Text>}
      subtitle={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Text style={[s.muted, { fontVariant: ['tabular-nums'], flexShrink: 1 }]} numberOfLines={1}>
            {sub}
          </Text>
          {zodiac && friend.birthday ? <ZodiacMark birthday={friend.birthday} color={colors.text3} /> : null}
        </View>
      }
      trailing={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {friend.muted && <Icon name="bellOff" size={16} color={colors.text3} />}
          {diff === 0 ? <Tag text="сегодня" tone="solid" /> : diff !== null && diff <= 7 ? <Tag text={relativeDay(next!, today)} tone="accent" /> : null}
        </View>
      }
      chevron={!selecting && (diff === null || diff > 7)}
      style={{ paddingVertical: 10, backgroundColor: selected ? colors.soft : undefined }}
    />
  );
}
