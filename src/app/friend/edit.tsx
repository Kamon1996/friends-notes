import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { AvatarPicker } from '@/components/AvatarPicker';
import { DateField } from '@/components/DateField';
import { Button, Card, Chip, Field, Label, SectionTitle, SwitchRow, useTheme } from '@/components/ui';
import { cleanupAvatars, deleteOwnedFiles } from '@/lib/avatars';
import { UNKNOWN_YEAR, hasYear, parseISODate, todayISO, toISODate } from '@/lib/dates';
import { confirm } from '@/lib/confirm';
import { newId, useFriend, useStore } from '@/lib/store';
import type { Friend, ImportantDate } from '@/lib/types';

const blankFriend = (): Friend => ({
  id: newId(),
  name: '',
  emoji: '🙂',
  birthday: null,
  phone: '',
  food: '',
  flowers: '',
  gifts: '',
  notes: '',
  dates: [],
  createdAt: Date.now(),
});

export default function EditFriendScreen() {
  const { ready } = useStore();
  return ready ? <FriendForm /> : null;
}

function FriendForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = useFriend(id);
  const { saveFriend, deleteFriend } = useStore();
  const { s, colors, fonts } = useTheme();
  const [f, setF] = useState<Friend>(() => existing ?? blankFriend());
  const set = <K extends keyof Friend>(key: K, value: Friend[K]) => setF((prev) => ({ ...prev, [key]: value }));

  const yearUnknown = !!f.birthday && !hasYear(f.birthday);

  const setBirthday = (date: string) => {
    if (yearUnknown) {
      const d = parseISODate(date);
      set('birthday', toISODate(new Date(UNKNOWN_YEAR, d.getMonth(), d.getDate())));
    } else set('birthday', date);
  };

  const toggleYearUnknown = (unknown: boolean) => {
    if (!f.birthday) return;
    const d = parseISODate(f.birthday);
    const year = unknown ? UNKNOWN_YEAR : new Date().getFullYear() - 25;
    set('birthday', toISODate(new Date(year, d.getMonth(), d.getDate())));
  };

  const updateDate = (dateId: string, patch: Partial<ImportantDate>) =>
    set('dates', f.dates.map((d) => (d.id === dateId ? { ...d, ...patch } : d)));

  const save = () => {
    if (!f.name.trim()) {
      Alert.alert('Как зовут друга?', 'Введи имя, чтобы сохранить.');
      return;
    }
    saveFriend({ ...f, name: f.name.trim(), dates: f.dates.filter((d) => d.title.trim()) });
    // Файлы фото, которые больше не используются (заменили или убрали), удаляем.
    cleanupAvatars(f.id, [f.photoUri, f.thumbUri]);
    if (existing) deleteOwnedFiles([existing.photoUri, existing.thumbUri].filter((u) => u !== f.photoUri && u !== f.thumbUri));
    router.back();
  };

  const remove = async () => {
    if (!(await confirm(`Удалить ${f.name}?`, 'Вместе с другом удалятся и его напоминания.'))) return;
    deleteFriend(f.id);
    router.dismissTo('/friends');
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen
        options={{
          title: existing ? 'Редактировать' : 'Новый друг',
          headerRight: () => (
            <Pressable onPress={save} hitSlop={10} style={{ paddingHorizontal: Platform.OS === 'web' ? 16 : 4, minHeight: 44, justifyContent: 'center' }}>
              <Text style={{ color: colors.accent, fontSize: 16, fontFamily: fonts.semibold }}>Готово</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView style={s.screen} contentContainerStyle={[s.content, { gap: 0 }]} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 14 }}>
          <AvatarPicker
            friend={{ id: f.id, name: f.name || '?', phone: f.phone, photoUri: f.photoUri, thumbUri: f.thumbUri }}
            size={72}
            onChange={(uris) => setF((prev) => ({ ...prev, photoUri: uris?.photoUri ?? null, thumbUri: uris?.thumbUri ?? null }))}
          />
          <View style={{ flex: 1 }}>
            <Field label="Имя" value={f.name} onChangeText={(v) => set('name', v)} placeholder="Например, Аня" autoFocus={!existing} style={{ marginBottom: 0 }} />
          </View>
        </View>
        <Text style={[s.caption, { marginTop: -8, marginBottom: 14, paddingHorizontal: 4 }]}>
          {f.photoUri ? 'Нажми на фото, чтобы заменить или убрать.' : 'Нажми на кружок, чтобы добавить фото. Без фото — инициалы.'}
        </Text>

        <DateField mode="date" label="День рождения" value={f.birthday} onChange={setBirthday} noYear={yearUnknown} />
        {f.birthday && (
          <Card style={{ paddingVertical: 4, marginTop: -6, marginBottom: 14 }}>
            <SwitchRow label="Год рождения неизвестен" value={yearUnknown} onChange={toggleYearUnknown} />
            <Button title="Убрать день рождения" variant="danger" onPress={() => set('birthday', null)} />
          </Card>
        )}

        <Field label="Телефон" value={f.phone} onChangeText={(v) => set('phone', v)} placeholder="+7…" keyboardType="phone-pad" />
        <Card style={{ paddingVertical: 4, marginBottom: 14 }}>
          <SwitchRow icon="star" label="В избранном" sub="Выше остальных в списке друзей" value={!!f.favorite} onChange={(v) => set('favorite', v)} />
          <SwitchRow icon="bell" label="Уведомлять о событиях" sub="День рождения и важные даты" value={!f.muted} onChange={(v) => set('muted', !v)} />
        </Card>

        <SectionTitle style={{ marginBottom: 6 }}>Что важно знать</SectionTitle>
        <Field label="Еда" value={f.food} onChangeText={(v) => set('food', v)} placeholder="Любит суши, не ест острое…" multiline />
        <Field label="Цветы" value={f.flowers} onChangeText={(v) => set('flowers', v)} placeholder="Пионы, белые розы…" multiline />
        <Field label="Идеи подарков" value={f.gifts} onChangeText={(v) => set('gifts', v)} placeholder="Хотела книгу…" multiline />
        <Field label="Заметки" value={f.notes} onChangeText={(v) => set('notes', v)} placeholder="Всё, что важно не забыть" multiline />

        <SectionTitle style={{ marginBottom: 6 }}>Важные даты</SectionTitle>
        {f.dates.map((d) => (
          <Card key={d.id} style={{ paddingBottom: 4, marginBottom: 10 }}>
            <Label>Название</Label>
            <TextInput
              value={d.title}
              onChangeText={(v) => updateDate(d.id, { title: v })}
              placeholder="Годовщина знакомства"
              placeholderTextColor={colors.placeholder}
              style={[s.input, { marginBottom: 14 }]}
            />
            <DateField mode="date" label="Дата" value={d.date} noYear={!hasYear(d.date)} onChange={(v) => updateDate(d.id, { date: v })} />
            <SwitchRow label="Повторять каждый год" value={d.yearly} onChange={(v) => updateDate(d.id, { yearly: v })} />
            <Button title="Удалить дату" variant="danger" onPress={() => set('dates', f.dates.filter((x) => x.id !== d.id))} />
          </Card>
        ))}
        <View style={s.chips}>
          {['Годовщина знакомства', 'Свадьба', 'День рождения ребёнка'].map((t) => (
            <Chip
              key={t}
              label={t}
              icon="plus"
              onPress={() => set('dates', [...f.dates, { id: newId(), title: t, date: todayISO(), yearly: true }])}
            />
          ))}
          <Chip
            label="Своя дата"
            icon="plus"
            onPress={() => set('dates', [...f.dates, { id: newId(), title: '', date: todayISO(), yearly: true }])}
          />
        </View>

        <Button title="Сохранить" onPress={save} style={{ marginTop: 24 }} />
        {existing && <Button title="Удалить друга" variant="danger" onPress={remove} style={{ marginTop: 8 }} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
