import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { ContactButtons } from '@/components/ContactButtons';
import { ReminderRow } from '@/components/ReminderRow';
import { Button, Card, Empty, SectionTitle, colors, styles } from '@/components/ui';
import { ageOn, formatDate, hasYear, nextAnniversary, plural, relativeDay, todayISO } from '@/lib/dates';
import { useFriend, useStore } from '@/lib/store';

export default function FriendScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const friend = useFriend(id);
  const { data, ready } = useStore();

  if (!ready) return null;
  if (!friend) return <Empty emoji="🤔" title="Друг не найден" text="Возможно, его удалили." />;

  const reminders = data.reminders
    .filter((r) => r.friendId === friend.id)
    .sort((a, b) => Number(a.done) - Number(b.done) || a.date.localeCompare(b.date));

  const prefs = [
    { icon: '🍽️', label: 'Еда', value: friend.food },
    { icon: '💐', label: 'Цветы', value: friend.flowers },
    { icon: '🎁', label: 'Идеи подарков', value: friend.gifts },
    { icon: '📝', label: 'Заметки', value: friend.notes },
  ].filter((p) => p.value.trim());

  const nextBirthday = friend.birthday ? nextAnniversary(friend.birthday) : null;
  const age = friend.birthday && hasYear(friend.birthday) ? ageOn(friend.birthday, todayISO()) : null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{
          title: friend.name,
          headerRight: () => (
            <Pressable onPress={() => router.push({ pathname: '/friend/edit', params: { id: friend.id } })} hitSlop={10} style={{ paddingHorizontal: Platform.OS === 'web' ? 16 : 0 }}>
              <Text style={{ color: colors.primary, fontSize: 17, fontWeight: '600' }}>Изменить</Text>
            </Pressable>
          ),
        }}
      />

      <View style={{ alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Avatar friend={friend} size={96} />
        <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text, textAlign: 'center' }}>{friend.name}</Text>
        {friend.phone ? (
          <Text style={{ color: colors.muted, fontSize: 15 }} selectable>
            {friend.phone}
          </Text>
        ) : null}
        <ContactButtons friend={friend} />
      </View>

      {friend.birthday && nextBirthday && (
        <Card style={[styles.row, { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft }]}>
          <Text style={{ fontSize: 30 }}>🎂</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{formatDate(friend.birthday, hasYear(friend.birthday))}</Text>
            <Text style={styles.muted}>
              {age !== null ? `${age} ${plural(age, 'год', 'года', 'лет')} · ` : ''}следующий {relativeDay(nextBirthday)}
            </Text>
          </View>
        </Card>
      )}

      {prefs.length > 0 && <SectionTitle>Что важно знать</SectionTitle>}
      {prefs.map((p) => (
        <Card key={p.label} style={{ gap: 4 }}>
          <Text style={styles.muted}>
            {p.icon} {p.label}
          </Text>
          <Text style={{ fontSize: 16, color: colors.text, lineHeight: 22 }}>{p.value}</Text>
        </Card>
      ))}

      {friend.dates.length > 0 && <SectionTitle>Важные даты</SectionTitle>}
      {friend.dates.map((d) => {
        const next = d.yearly ? nextAnniversary(d.date) : d.date;
        return (
          <Card key={d.id} style={styles.row}>
            <Text style={{ fontSize: 24 }}>📅</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{d.title}</Text>
              <Text style={styles.muted}>
                {formatDate(d.date, hasYear(d.date))}
                {d.yearly ? ' · каждый год' : ''}
              </Text>
            </View>
            <Text style={styles.muted}>{relativeDay(next)}</Text>
          </Card>
        );
      })}

      <SectionTitle>Напоминания</SectionTitle>
      {reminders.map((r) => (
        <ReminderRow key={r.id} reminder={r} friend={friend} />
      ))}
      <Button
        title="+ Напоминание"
        variant="secondary"
        onPress={() => router.push({ pathname: '/reminder/edit', params: { friendId: friend.id } })}
      />
    </ScrollView>
  );
}
