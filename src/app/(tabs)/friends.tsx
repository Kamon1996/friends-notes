import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';

import { Button, Empty, Fab, colors, styles } from '@/components/ui';
import { formatDate, hasYear, nextAnniversary, relativeDay } from '@/lib/dates';
import { useStore } from '@/lib/store';
import { telegramAvailable } from '@/lib/telegramClient';
import type { Friend } from '@/lib/types';

export default function FriendsScreen() {
  const { data } = useStore();
  const [query, setQuery] = useState('');

  const friends = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.friends
      .filter((f) => !q || [f.name, f.food, f.flowers, f.gifts, f.notes].some((s) => s.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [data.friends, query]);

  return (
    <View style={styles.screen}>
      <FlatList
        data={friends}
        keyExtractor={(f) => f.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          data.friends.length > 0 ? (
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="🔍  Поиск по имени, еде, цветам…"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
          ) : undefined
        }
        renderItem={({ item }) => <FriendRow friend={item} />}
        ListEmptyComponent={
          data.friends.length === 0 ? (
            <View style={{ gap: 12 }}>
              <Empty
                emoji="🫂"
                title="Пока никого"
                text="Импортируй друзей из контактов телефона — вместе с днями рождения. Или нажми «+», чтобы добавить вручную."
              />
              <Button title="📇 Импорт из контактов" onPress={() => router.push('/import')} />
              {telegramAvailable && (
                <Button title="✈️ Импорт из Telegram" variant="secondary" onPress={() => router.push('/telegram')} />
              )}
            </View>
          ) : (
            <Empty emoji="🤷" title="Никого не нашлось" text="Попробуй другой запрос." />
          )
        }
      />
      <Fab onPress={() => router.push('/friend/edit')} />
    </View>
  );
}

function FriendRow({ friend }: { friend: Friend }) {
  const next = friend.birthday ? nextAnniversary(friend.birthday) : null;
  const facts = [friend.flowers && `💐 ${friend.flowers}`, friend.food && `🍽️ ${friend.food}`].filter(Boolean);

  return (
    <Pressable
      onPress={() => router.push(`/friend/${friend.id}`)}
      style={({ pressed }) => [styles.card, styles.row, pressed && { opacity: 0.7 }]}
    >
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: colors.primarySoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: 26 }}>{friend.emoji}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.title}>{friend.name}</Text>
        {next && friend.birthday && (
          <Text style={styles.muted}>
            🎂 {formatDate(friend.birthday, hasYear(friend.birthday))} · {relativeDay(next)}
          </Text>
        )}
        {facts.length > 0 && (
          <Text style={styles.muted} numberOfLines={1}>
            {facts.join('  ')}
          </Text>
        )}
      </View>
      <Text style={{ color: colors.muted, fontSize: 20 }}>›</Text>
    </Pressable>
  );
}
