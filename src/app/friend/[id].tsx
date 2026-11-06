import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { ContactButtons } from '@/components/ContactButtons';
import { ReminderRow } from '@/components/ReminderRow';
import { Icon, type IconName } from '@/components/Icon';
import { Button, Empty, Group, IconButton, IconCircle, ListRow, SectionTitle, Tag, useTheme } from '@/components/ui';
import { ageOn, daysBetween, formatDate, hasYear, nextAnniversary, plural, relativeDay, todayISO } from '@/lib/dates';
import { useFriend, useStore } from '@/lib/store';

export default function FriendScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const friend = useFriend(id);
  const { data, ready, saveFriend } = useStore();
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
  const ageNow = friend.birthday && hasYear(friend.birthday) ? ageOn(friend.birthday, today) : null;

  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.content, { paddingTop: 4 }]}>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => (
            <View style={{ flexDirection: 'row' }}>
              <IconButton
                icon="star"
                label={friend.favorite ? 'Убрать из избранного' : 'В избранное'}
                color={friend.favorite ? colors.accent : undefined}
                fill={friend.favorite ? colors.accent : undefined}
                onPress={() => saveFriend({ ...friend, favorite: !friend.favorite })}
              />
              <IconButton
                icon={friend.muted ? 'bellOff' : 'bell'}
                label={friend.muted ? 'Включить уведомления' : 'Выключить уведомления'}
                color={friend.muted ? colors.text3 : undefined}
                onPress={() => saveFriend({ ...friend, muted: !friend.muted })}
              />
              <IconButton icon="pencil" label="Изменить" onPress={() => router.push({ pathname: '/friend/edit', params: { id: friend.id } })} />
            </View>
          ),
        }}
      />

      <View style={{ alignItems: 'center', gap: 8 }}>
        <Pressable onPress={() => router.push({ pathname: '/friend/edit', params: { id: friend.id } })} accessibilityLabel="Изменить фото" style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
          <Avatar friend={friend} size={88} />
        </Pressable>
        <Text style={{ fontFamily: fonts.display, fontSize: 26, lineHeight: 30, color: colors.text, textAlign: 'center', letterSpacing: -0.2, alignSelf: 'stretch' }}>{friend.name}</Text>
        {friend.birthday && nextBirthday && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[s.muted, { fontSize: 14, fontVariant: ['tabular-nums'] }]}>
              {formatDate(friend.birthday, hasYear(friend.birthday))}
              {ageNow !== null ? ` · ${ageNow} ${plural(ageNow, 'год', 'года', 'лет')}` : ''}
            </Text>
            {diff === 0 ? (
              <Tag text="сегодня" tone="solid" />
            ) : (
              <Tag text={relativeDay(nextBirthday, today)} tone={diff !== null && diff <= 7 ? 'accent' : 'neutral'} />
            )}
          </View>
        )}
        {friend.phone ? (
          <Text style={[s.muted, { fontSize: 14, fontVariant: ['tabular-nums'] }]} selectable>
            {friend.phone}
          </Text>
        ) : null}
        {friend.muted && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="bellOff" size={14} color={colors.text3} />
            <Text style={[s.caption, { color: colors.text3 }]}>Уведомления о событиях выключены</Text>
          </View>
        )}
      </View>

      <ContactButtons friend={friend} />

      {prefs.length === 0 && (
        <Pressable
          onPress={() => router.push({ pathname: '/friend/edit', params: { id: friend.id } })}
          style={({ pressed }) => [s.card, { flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.7 : 1 }]}
        >
          <IconCircle icon="note" tone="accent" />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.title}>Еда, цветы, подарки</Text>
            <Text style={s.muted}>Запиши, что любит, чтобы не гадать к празднику.</Text>
          </View>
          <Text style={[s.title, { color: colors.accent }]}>Дополнить</Text>
        </Pressable>
      )}
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
            {[...friend.dates]
              .sort((a, b) => (a.yearly ? nextAnniversary(a.date, today) : a.date).localeCompare(b.yearly ? nextAnniversary(b.date, today) : b.date))
              .map((d) => {
              const next = d.yearly ? nextAnniversary(d.date, today) : d.date;
              const years = d.yearly && hasYear(d.date) ? ageOn(d.date, next) : null;
              const dd = daysBetween(today, next);
              return (
                <ListRow
                  key={d.id}
                  leading={<IconCircle icon="heart" tone="accent" />}
                  title={d.title}
                  subtitle={[formatDate(d.date, hasYear(d.date)), d.yearly ? 'каждый год' : null].filter(Boolean).join(' · ')}
                  trailing={
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      {years ? <Text style={[s.title, { fontSize: 13, fontVariant: ['tabular-nums'] }]}>{`${years} ${plural(years, 'год', 'года', 'лет')}`}</Text> : null}
                      {dd >= 0 ? <Tag text={relativeDay(next, today)} tone={dd === 0 ? 'solid' : dd <= 7 ? 'accent' : 'neutral'} /> : null}
                    </View>
                  }
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
