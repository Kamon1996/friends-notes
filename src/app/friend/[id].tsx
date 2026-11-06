import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { ContactButtons } from '@/components/ContactButtons';
import { ReminderRow } from '@/components/ReminderRow';
import type { IconName } from '@/components/Icon';
import { Button, Empty, Group, IconButton, IconCircle, ListRow, SectionTitle, Tag, useTheme } from '@/components/ui';
import { ageOn, daysBetween, formatDate, hasYear, nextAnniversary, plural, relativeDay, todayISO } from '@/lib/dates';
import { useFriend, useStore } from '@/lib/store';

export default function FriendScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const friend = useFriend(id);
  const { data, ready } = useStore();
  const { s, colors, fonts } = useTheme();

  if (!ready) return null;
  if (!friend) return <Empty icon="person" title="Друг не найден" text="Возможно, его удалили." />;

  const reminders = data.reminders
    .filter((r) => r.friendId === friend.id)
    .sort((a, b) => Number(a.done) - Number(b.done) || a.date.localeCompare(b.date));

  const prefs = (
    [
      { icon: 'food', label: 'Еда', value: friend.food },
      { icon: 'flower', label: 'Цветы', value: friend.flowers },
      { icon: 'gift', label: 'Подарки', value: friend.gifts },
      { icon: 'note', label: 'Заметки', value: friend.notes },
    ] satisfies { icon: IconName; label: string; value: string }[]
  ).filter((p) => p.value.trim());

  const today = todayISO();
  const nextBirthday = friend.birthday ? nextAnniversary(friend.birthday, today) : null;
  const diff = nextBirthday ? daysBetween(today, nextBirthday) : null;
  const age = friend.birthday && nextBirthday && hasYear(friend.birthday) ? ageOn(friend.birthday, nextBirthday) : null;
  const ageNow = friend.birthday && hasYear(friend.birthday) ? ageOn(friend.birthday, today) : null;

  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.content, { paddingTop: 4 }]}>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => (
            <IconButton icon="pencil" label="Изменить" onPress={() => router.push({ pathname: '/friend/edit', params: { id: friend.id } })} />
          ),
        }}
      />

      <View style={{ alignItems: 'center', gap: 8 }}>
        <Pressable onPress={() => router.push({ pathname: '/friend/edit', params: { id: friend.id } })} accessibilityLabel="Изменить фото" style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
          <Avatar friend={friend} size={88} />
        </Pressable>
        <Text style={{ fontFamily: fonts.display, fontSize: 26, lineHeight: 30, color: colors.text, textAlign: 'center', letterSpacing: -0.2 }}>{friend.name}</Text>
        {friend.birthday && nextBirthday && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[s.muted, { fontSize: 14, fontVariant: ['tabular-nums'] }]}>
              {formatDate(friend.birthday, hasYear(friend.birthday))}
              {ageNow !== null ? ` · ${ageNow} ${plural(ageNow, 'год', 'года', 'лет')}` : ''}
            </Text>
            {diff === 0 ? (
              <Tag text="сегодня" tone="solid" />
            ) : (
              <Tag text={age ? `${age} ${plural(age, 'год', 'года', 'лет')} ${relativeDay(nextBirthday, today)}` : relativeDay(nextBirthday, today)} tone={diff !== null && diff <= 7 ? 'accent' : 'neutral'} />
            )}
          </View>
        )}
        {friend.phone ? (
          <Text style={[s.muted, { fontSize: 14, fontVariant: ['tabular-nums'] }]} selectable>
            {friend.phone}
          </Text>
        ) : null}
      </View>

      <ContactButtons friend={friend} />

      {prefs.length > 0 && (
        <Group inset={62}>
          {prefs.map((p) => (
            <ListRow
              key={p.label}
              leading={<IconCircle icon={p.icon} />}
              title={<Text style={s.sectionLabel}>{p.label}</Text>}
              subtitle={<Text style={[s.body, { fontSize: 15, lineHeight: 21 }]}>{p.value}</Text>}
              style={{ paddingVertical: 11, alignItems: 'center' }}
            />
          ))}
        </Group>
      )}

      {friend.dates.length > 0 && (
        <View style={{ gap: 8 }}>
          <SectionTitle style={{ marginBottom: 0 }}>Важные даты</SectionTitle>
          <Group inset={62}>
            {friend.dates.map((d) => {
              const next = d.yearly ? nextAnniversary(d.date, today) : d.date;
              const years = d.yearly && hasYear(d.date) ? ageOn(d.date, next) : null;
              return (
                <ListRow
                  key={d.id}
                  leading={<IconCircle icon="heart" tone="accent" />}
                  title={d.title}
                  subtitle={`${formatDate(d.date, hasYear(d.date))}${d.yearly ? ' · каждый год' : ''} · ${relativeDay(next, today)}`}
                  trailing={years ? <Tag text={`${years} ${plural(years, 'год', 'года', 'лет')}`} /> : undefined}
                />
              );
            })}
          </Group>
        </View>
      )}

      <View style={{ gap: 8 }}>
        <SectionTitle
          style={{ marginBottom: 0 }}
          right={
            <Button
              title="Добавить"
              icon="plus"
              variant="ghost"
              style={{ minHeight: 32, paddingHorizontal: 8, paddingVertical: 4 }}
              onPress={() => router.push({ pathname: '/reminder/edit', params: { friendId: friend.id } })}
            />
          }
        >
          Напоминания
        </SectionTitle>
        {reminders.length > 0 ? (
          <Group inset={56}>
            {reminders.map((r) => (
              <ReminderRow key={r.id} reminder={r} friend={friend} showFriend={false} />
            ))}
          </Group>
        ) : (
          <Text style={[s.muted, { paddingHorizontal: 4 }]}>Например, «купить цветы раз в 2 месяца» или «написать раз в неделю».</Text>
        )}
      </View>
    </ScrollView>
  );
}
