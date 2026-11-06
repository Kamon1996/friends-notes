import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { Button, Chip, Empty, Fab, GroupedRow, IconButton, ListRow, ScreenHeader, SearchField, Tag, useTheme } from '@/components/ui';
import { ageOn, daysBetween, formatDate, hasYear, nextAnniversary, plural, relativeDay, todayISO } from '@/lib/dates';
import { buildFriendList, type FriendSort } from '@/lib/friendList';
import { useStore } from '@/lib/store';
import { telegramAvailable } from '@/lib/telegramClient';
import type { Friend } from '@/lib/types';

export default function FriendsScreen() {
  const { data } = useStore();
  const { s, colors } = useTheme();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<FriendSort>('name');
  const today = todayISO();

  const items = useMemo(() => buildFriendList(data.friends, query, sort, today), [data.friends, query, sort, today]);

  const n = data.friends.length;
  const inMonth = data.friends.filter((f) => f.birthday && daysBetween(today, nextAnniversary(f.birthday, today)) <= 30).length;

  return (
    <View style={s.screen}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.key}
        contentContainerStyle={{ paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <>
            <ScreenHeader
              title="Друзья"
              subtitle={n ? `${n} ${plural(n, 'человек', 'человека', 'человек')}${inMonth ? ` · ${inMonth} ${plural(inMonth, 'день рождения', 'дня рождения', 'дней рождения')} в ближайший месяц` : ''}` : undefined}
              right={<IconButton icon="import" label="Импорт друзей" onPress={() => router.push('/import')} />}
            />
            {n > 0 && (
              <View style={{ padding: 20, paddingTop: 14, paddingBottom: 16, gap: 10 }}>
                <SearchField value={query} onChangeText={setQuery} placeholder="Поиск по имени, еде, цветам…" />
                <View style={s.chips}>
                  <Chip label="По имени" selected={sort === 'name'} onPress={() => setSort('name')} />
                  <Chip label="Скоро день рождения" icon="cake" selected={sort === 'date'} onPress={() => setSort('date')} />
                </View>
              </View>
            )}
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
                <FriendRow friend={item.friend} today={today} />
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
      <Fab onPress={() => router.push('/friend/edit')} label="Добавить друга" />
    </View>
  );
}

function FriendRow({ friend, today }: { friend: Friend; today: string }) {
  const { s } = useTheme();
  const next = friend.birthday ? nextAnniversary(friend.birthday, today) : null;
  const diff = next ? daysBetween(today, next) : null;
  const age = friend.birthday && next && hasYear(friend.birthday) ? ageOn(friend.birthday, next) : null;
  const sub = friend.birthday
    ? `${formatDate(friend.birthday, false)}${age ? ` · ${age} ${plural(age, 'год', 'года', 'лет')}` : ''}`
    : [friend.flowers, friend.food].filter(Boolean).join(' · ') || 'Без дня рождения';

  return (
    <ListRow
      onPress={() => router.push(`/friend/${friend.id}`)}
      leading={<Avatar friend={friend} size={44} />}
      title={<Text style={s.name} numberOfLines={1}>{friend.name}</Text>}
      subtitle={<Text style={[s.muted, { fontVariant: ['tabular-nums'] }]} numberOfLines={1}>{sub}</Text>}
      trailing={diff === 0 ? <Tag text="сегодня" tone="solid" /> : diff !== null && diff <= 7 ? <Tag text={relativeDay(next!, today)} tone="accent" /> : null}
      chevron={diff === null || diff > 7}
      style={{ paddingVertical: 10 }}
    />
  );
}
