import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { AvatarPicker } from '@/components/AvatarPicker';
import { BirthdayField } from '@/components/BirthdayField';
import { NetworkBadge } from '@/components/NetworkBadge';
import { SocialLinkSheet } from '@/components/SocialLinkSheet';
import { Button, Card, Chip, Field, IconButton, Label, ListRow, SectionTitle, SwitchRow, useTheme } from '@/components/ui';
import { cleanupAvatars, deleteOwnedFiles } from '@/lib/avatars';
import { confirm, notify } from '@/lib/confirm';
import { linkSubtitle, linkTitle, mergeLinks } from '@/lib/socials';
import { newId, useFriend, useStore } from '@/lib/store';
import { genderFromName, type Gender } from '@/lib/gender';
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
  const [addSocial, setAddSocial] = useState(false);
  const set = <K extends keyof Friend>(key: K, value: Friend[K]) => setF((prev) => ({ ...prev, [key]: value }));
  // Пол: выбранный вручную — как есть; новое имя — сразу по своей базе (так же и сохранится); иначе — что определилось само.
  const renamed = !existing || existing.name !== f.name.trim();
  const shownGender = f.genderBy === 'manual' || !renamed ? f.gender : (genderFromName(f.name) ?? undefined);
  const genderNote = genderCaption(f, shownGender, renamed);
  const setGender = (g: Gender | undefined) => {
    if (!g && !shownGender && f.genderBy !== 'manual') return; // «Не указан» и так выбран — ничего не меняем
    setF(({ gender: _g, genderBy: _b, genderStage: _s, ...rest }) => (g ? { ...rest, gender: g, genderBy: 'manual' } : { ...rest, genderBy: 'manual' }));
  };
  // Поля дат, где набранное нельзя сохранить, и где они на экране — чтобы не сохранить молча другую дату и показать, что поправить.
  const [invalid, setInvalid] = useState<Record<string, boolean>>({});
  const [attempted, setAttempted] = useState(false);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const positions = useRef<Record<string, number>>({});
  const markInvalid = (key: string) => (bad: boolean) => setInvalid((prev) => (!!prev[key] === bad ? prev : { ...prev, [key]: bad }));

  const updateDate = (dateId: string, patch: Partial<ImportantDate>) =>
    set('dates', f.dates.map((d) => (d.id === dateId ? { ...d, ...patch } : d)));

  const save = () => {
    if (!f.name.trim()) {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      notify('Как зовут друга?', 'Введи имя, чтобы сохранить.');
      return;
    }
    const bad = Object.keys(invalid).filter((k) => invalid[k]);
    const untitled = f.dates.filter((d) => d.date && !d.title.trim()).map((d) => `date-${d.id}`);
    if (bad.length || untitled.length) {
      setAttempted(true);
      const ys = [...bad, ...untitled].map((k) => positions.current[k]).filter((y): y is number => y !== undefined);
      if (ys.length) scrollRef.current?.scrollTo({ y: Math.max(0, Math.min(...ys) - 16), animated: true });
      notify(
        'Проверь даты',
        bad.includes('birthday')
          ? 'В дне рождения такой даты нет или она не дописана. Поправь её или очисти поле.'
          : 'У важной даты не хватает названия или числа. Допиши её или удали.',
      );
      return;
    }
    saveFriend({ ...f, name: f.name.trim(), dates: f.dates.filter((d) => d.title.trim() && d.date) });
    // Файлы фото, которые больше не используются (заменили или убрали), удаляем.
    cleanupAvatars(f.id, [f.photoUri, f.thumbUri]);
    if (existing) deleteOwnedFiles([existing.photoUri, existing.thumbUri].filter((u) => u !== f.photoUri && u !== f.thumbUri));
    router.back();
  };

  const remove = async () => {
    if (!(await confirm(`Удалить «${f.name}»?`, 'Вместе с другом удалятся и его напоминания.'))) return;
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
              <Text style={{ color: colors.accent, fontSize: 16, fontFamily: fonts.semibold }}>Сохранить</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView ref={scrollRef} style={s.screen} contentContainerStyle={[s.content, { gap: 0 }]} keyboardShouldPersistTaps="handled">
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

        <View onLayout={(e) => (positions.current.birthday = e.nativeEvent.layout.y)}>
          <BirthdayField
            label="День рождения"
            value={f.birthday}
            onChange={(v) => set('birthday', v)}
            showIncomplete={attempted}
            onInvalidChange={markInvalid('birthday')}
          />
        </View>

        <Field label="Телефон" value={f.phone} onChangeText={(v) => set('phone', v)} placeholder="+7…" keyboardType="phone-pad" />
        <View style={{ marginBottom: 14 }}>
          <Label>Пол</Label>
          <View style={s.chips}>
            <Chip label="Женщина" selected={shownGender === 'f'} onPress={() => setGender('f')} />
            <Chip label="Мужчина" selected={shownGender === 'm'} onPress={() => setGender('m')} />
            <Chip label="Не указан" selected={!shownGender} onPress={() => setGender(undefined)} />
          </View>
          {genderNote && <Text style={[s.caption, { marginTop: 6, paddingHorizontal: 4 }]}>{genderNote}</Text>}
        </View>
        <Card style={{ paddingVertical: 4, marginBottom: 14 }}>
          <SwitchRow icon="star" label="В избранном" sub="Выше остальных в списке друзей" value={!!f.favorite} onChange={(v) => set('favorite', v)} />
          <SwitchRow icon="bell" label="Уведомлять о событиях" sub="День рождения и важные даты" value={!f.muted} onChange={(v) => set('muted', !v)} />
        </Card>

        <SectionTitle style={{ marginBottom: 6 }}>Что важно знать</SectionTitle>
        <Field label="Еда" value={f.food} onChangeText={(v) => set('food', v)} placeholder="Любит суши, не ест острое…" multiline />
        <Field label="Цветы" value={f.flowers} onChangeText={(v) => set('flowers', v)} placeholder="Пионы, белые розы…" multiline />
        <Field label="Идеи подарков" value={f.gifts} onChangeText={(v) => set('gifts', v)} placeholder="Хотела книгу…" multiline />
        <Field label="Заметки" value={f.notes} onChangeText={(v) => set('notes', v)} placeholder="Всё, что важно не забыть" multiline />

        <SectionTitle style={{ marginBottom: 6 }}>Соцсети</SectionTitle>
        {(f.socials ?? []).length > 0 && (
          <Card style={{ paddingVertical: 2, paddingHorizontal: 4, marginBottom: 10 }}>
            {(f.socials ?? []).map((l) => (
              <ListRow
                key={l.id}
                leading={<NetworkBadge network={l.network} />}
                title={linkTitle(l)}
                subtitle={linkSubtitle(l)}
                trailing={<IconButton icon="close" label={`Убрать ${linkTitle(l)}`} size={18} onPress={() => set('socials', (f.socials ?? []).filter((x) => x.id !== l.id))} />}
                style={{ paddingVertical: 6, paddingHorizontal: 8 }}
              />
            ))}
          </Card>
        )}
        <View style={[s.chips, { marginBottom: 14 }]}>
          <Chip label="Добавить соцсеть" icon="plus" onPress={() => setAddSocial(true)} />
        </View>
        <Text style={[s.caption, { marginTop: -8, marginBottom: 14, paddingHorizontal: 4 }]}>
          Сюда же попадают ссылки из «О себе» в Telegram и из контактов телефона.
        </Text>
        <SocialLinkSheet visible={addSocial} existing={f.socials} onClose={() => setAddSocial(false)} onAdd={(link) => set('socials', mergeLinks(f.socials, [link]))} />

        <SectionTitle style={{ marginBottom: 6 }}>Важные даты</SectionTitle>
        {f.dates.map((d) => (
          <View key={d.id} onLayout={(e) => (positions.current[`date-${d.id}`] = e.nativeEvent.layout.y)}>
          <Card style={{ paddingBottom: 4, marginBottom: 10 }}>
            <Label>Название</Label>
            <TextInput
              value={d.title}
              onChangeText={(v) => updateDate(d.id, { title: v })}
              placeholder="Например, годовщина знакомства"
              placeholderTextColor={colors.placeholder}
              style={[s.input, { marginBottom: attempted && d.date && !d.title.trim() ? 4 : 14 }, attempted && !!d.date && !d.title.trim() && { borderColor: colors.danger, borderWidth: 1.5 }]}
            />
            {attempted && !!d.date && !d.title.trim() && (
              <Text style={[s.caption, { color: colors.danger, marginBottom: 14, paddingHorizontal: 4 }]}>Назови дату, например «Свадьба».</Text>
            )}
            <BirthdayField
              label="Дата"
              value={d.date || null}
              onChange={(v) => updateDate(d.id, { date: v ?? '' })}
              hint="Год можно не указывать."
              required={!!d.title.trim()}
              showIncomplete={attempted}
              onInvalidChange={markInvalid(`date-${d.id}`)}
            />
            <SwitchRow label="Повторять каждый год" value={d.yearly} onChange={(v) => updateDate(d.id, { yearly: v })} />
            <Button title="Удалить дату" variant="danger" onPress={() => set('dates', f.dates.filter((x) => x.id !== d.id))} />
          </Card>
          </View>
        ))}
        <View style={s.chips}>
          {['Годовщина знакомства', 'Свадьба', 'День рождения ребёнка'].map((t) => (
            <Chip
              key={t}
              label={t}
              icon="plus"
              onPress={() => set('dates', [...f.dates, { id: newId(), title: t, date: '', yearly: true }])}
            />
          ))}
          <Chip
            label="Своя дата"
            icon="plus"
            onPress={() => set('dates', [...f.dates, { id: newId(), title: '', date: '', yearly: true }])}
          />
        </View>

        <Button title="Сохранить" onPress={save} style={{ marginTop: 24 }} />
        {existing && <Button title="Удалить друга" variant="danger" onPress={remove} style={{ marginTop: 8 }} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Короткая подпись под выбором пола: определилось само или не получилось. Выбранный вручную — без подписи. */
function genderCaption(f: Friend, shown: Gender | undefined, renamed: boolean): string | null {
  if (f.genderBy === 'manual') return null;
  if (shown) return 'Определено автоматически — можно поправить';
  if (!renamed && f.genderStage && f.genderStage !== 'names') return 'Не удалось определить — выбери сам';
  return null;
}
