import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { DateField } from '@/components/DateField';
import { Button, Card, Chip, Field, Label, SectionTitle, SwitchRow, useTheme } from '@/components/ui';
import { confirm } from '@/lib/confirm';
import { addInterval, formatRepeat, todayISO } from '@/lib/dates';
import { newId, useStore } from '@/lib/store';
import type { Advance, Reminder, Repeat, RepeatUnit } from '@/lib/types';

const REPEAT_PRESETS: { label: string; repeat: Repeat | null }[] = [
  { label: 'Один раз', repeat: null },
  { label: 'Каждый день', repeat: { every: 1, unit: 'day' } },
  { label: 'Каждую неделю', repeat: { every: 1, unit: 'week' } },
  { label: 'Раз в 2 недели', repeat: { every: 2, unit: 'week' } },
  { label: 'Каждый месяц', repeat: { every: 1, unit: 'month' } },
  { label: 'Раз в 2 месяца', repeat: { every: 2, unit: 'month' } },
  { label: 'Каждый год', repeat: { every: 1, unit: 'year' } },
];

const UNITS: { unit: RepeatUnit; label: string }[] = [
  { unit: 'day', label: 'дни' },
  { unit: 'week', label: 'недели' },
  { unit: 'month', label: 'месяцы' },
  { unit: 'year', label: 'годы' },
];

const ADVANCES: { value: Advance; label: string }[] = [
  { value: 0, label: 'Нет' },
  { value: 60, label: 'За час' },
  { value: 1440, label: 'За день' },
  { value: 4320, label: 'За 3 дня' },
  { value: 10080, label: 'За неделю' },
];

const FRIEND_TEMPLATES = ['Написать', 'Позвонить', 'Купить цветы', 'Встретиться', 'Выбрать подарок'];
const PERSONAL_TEMPLATES = ['Оплатить счета', 'Записаться к врачу', 'Сдать проект'];

const sameRepeat = (a: Repeat | null, b: Repeat | null) =>
  a === b || (!!a && !!b && a.every === b.every && a.unit === b.unit);

export default function EditReminderScreen() {
  const { ready } = useStore();
  // Ждём загрузки данных, иначе при открытии из уведомления форма стартует пустой.
  return ready ? <ReminderForm /> : null;
}

function ReminderForm() {
  const params = useLocalSearchParams<{ id?: string; friendId?: string }>();
  const { data, saveReminder, deleteReminder } = useStore();
  const { s, colors, fonts } = useTheme();
  const existing = data.reminders.find((r) => r.id === params.id);

  const [r, setR] = useState<Reminder>(
    () =>
      existing ?? {
        id: newId(),
        title: '',
        note: '',
        friendId: params.friendId ?? null,
        date: addInterval(todayISO(), 'day', 1),
        time: '10:00',
        repeat: null,
        advance: 0,
        done: false,
        createdAt: Date.now(),
      },
  );
  const set = <K extends keyof Reminder>(key: K, value: Reminder[K]) => setR((prev) => ({ ...prev, [key]: value }));
  const [customRepeat, setCustomRepeat] = useState(
    () => !!r.repeat && !REPEAT_PRESETS.some((p) => sameRepeat(p.repeat, r.repeat)),
  );

  const friend = data.friends.find((f) => f.id === r.friendId);
  const templates = r.friendId ? FRIEND_TEMPLATES : PERSONAL_TEMPLATES;

  const save = () => {
    if (!r.title.trim()) {
      Alert.alert('Что напомнить?', 'Введи текст напоминания.');
      return;
    }
    saveReminder({ ...r, title: r.title.trim() });
    router.back();
  };

  const remove = async () => {
    if (!(await confirm('Удалить напоминание?', r.title))) return;
    deleteReminder(r.id);
    router.back();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen
        options={{
          title: existing ? 'Напоминание' : 'Новое напоминание',
          headerRight: () => (
            <Pressable onPress={save} hitSlop={10} style={{ paddingHorizontal: Platform.OS === 'web' ? 16 : 4, minHeight: 44, justifyContent: 'center' }}>
              <Text style={{ color: colors.accent, fontSize: 16, fontFamily: fonts.semibold }}>Готово</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView style={s.screen} contentContainerStyle={[s.content, { gap: 0 }]} keyboardShouldPersistTaps="handled">
        <Field
          label="Что сделать"
          value={r.title}
          onChangeText={(v) => set('title', v)}
          placeholder={friend ? `Например, написать ${friend.name}` : 'Например, сдать отчёт'}
          autoFocus={!existing}
        />
        <View style={[s.chips, { marginTop: -4, marginBottom: 18 }]}>
          {templates.map((t) => (
            <Chip
              key={t}
              label={t}
              selected={r.title === (friend ? `${t} — ${friend.name}` : t)}
              onPress={() => set('title', friend ? `${t} — ${friend.name}` : t)}
            />
          ))}
        </View>

        <Label>Для кого</Label>
        <View style={[s.chips, { marginBottom: 18 }]}>
          <Chip label="Для себя" icon="person" selected={!r.friendId} onPress={() => set('friendId', null)} />
          {data.friends.map((f) => (
            <Chip
              key={f.id}
              label={f.name}
              selected={r.friendId === f.id}
              leading={<Avatar friend={f} size={28} />}
              onPress={() => set('friendId', f.id)}
            />
          ))}
        </View>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 3 }}>
            <DateField
              mode="date"
              label={r.repeat ? 'Ближайший раз' : 'Дата или дедлайн'}
              value={r.date}
              onChange={(v) => set('date', v)}
            />
          </View>
          <View style={{ flex: 2 }}>
            <DateField mode="time" label="Время" value={r.time} onChange={(v) => set('time', v)} />
          </View>
        </View>
        <Text style={[s.caption, { marginTop: -8, marginBottom: 14, paddingHorizontal: 4 }]}>Вводи цифрами — точки подставятся сами.</Text>

        <SectionTitle style={{ marginBottom: 8 }}>Повтор</SectionTitle>
        <View style={s.chips}>
          {REPEAT_PRESETS.map((p) => (
            <Chip
              key={p.label}
              label={p.label}
              selected={!customRepeat && sameRepeat(p.repeat, r.repeat)}
              onPress={() => {
                setCustomRepeat(false);
                set('repeat', p.repeat);
              }}
            />
          ))}
          <Chip
            label="Свой…"
            selected={customRepeat}
            onPress={() => {
              setCustomRepeat(true);
              if (!r.repeat) set('repeat', { every: 3, unit: 'day' });
            }}
          />
        </View>
        {customRepeat && r.repeat && (
          <Card style={{ gap: 10, marginTop: 10 }}>
            <View style={s.row}>
              <Text style={s.body}>Каждые</Text>
              <TextInput
                value={String(r.repeat.every)}
                onChangeText={(v) => {
                  const n = Math.min(365, Math.max(1, parseInt(v.replace(/\D/g, ''), 10) || 1));
                  set('repeat', { ...r.repeat!, every: n });
                }}
                keyboardType="number-pad"
                style={[s.input, { width: 72, textAlign: 'center', paddingVertical: 8, minHeight: 44 }]}
              />
            </View>
            <View style={s.chips}>
              {UNITS.map((u) => (
                <Chip
                  key={u.unit}
                  label={u.label}
                  selected={r.repeat?.unit === u.unit}
                  onPress={() => set('repeat', { ...r.repeat!, unit: u.unit })}
                />
              ))}
            </View>
            <Text style={s.muted}>Будет: {formatRepeat(r.repeat)}</Text>
          </Card>
        )}

        {!r.repeat && (
          <>
            <SectionTitle style={{ marginTop: 18, marginBottom: 8 }}>Напомнить заранее</SectionTitle>
            <View style={s.chips}>
              {ADVANCES.map((a) => (
                <Chip key={a.value} label={a.label} selected={r.advance === a.value} onPress={() => set('advance', a.value)} />
              ))}
            </View>
          </>
        )}

        <View style={{ height: 18 }} />
        <Field label="Заметка" value={r.note} onChangeText={(v) => set('note', v)} placeholder="Детали, ссылка, адрес…" multiline />

        {existing && !r.repeat && <SwitchRow label="Выполнено" value={r.done} onChange={(v) => set('done', v)} />}

        <Button title="Сохранить" onPress={save} style={{ marginTop: 8 }} />
        {existing && <Button title="Удалить" variant="danger" onPress={remove} style={{ marginTop: 8 }} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
