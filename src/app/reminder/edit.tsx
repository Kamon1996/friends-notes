import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';

import { FriendPicker } from '@/components/FriendPicker';
import { DateField } from '@/components/DateField';
import { Button, Card, Chip, Empty, Field, Label, SectionTitle, SwitchRow, useTheme } from '@/components/ui';
import { confirm, notify } from '@/lib/confirm';
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
  const { ready, data } = useStore();
  const { id } = useLocalSearchParams<{ id?: string }>();
  // Ждём загрузки данных, иначе при открытии из уведомления форма стартует пустой.
  if (!ready) return null;
  // Старое уведомление или ссылка на удалённое напоминание — не подсовываем пустую форму «Новое напоминание».
  if (id && !data.reminders.some((r) => r.id === id)) return <ReminderNotFound />;
  return <ReminderForm />;
}

function ReminderNotFound() {
  return (
    <>
      <Stack.Screen options={{ title: 'Напоминание' }} />
      <Empty icon="bell" title="Напоминание не найдено" text="Возможно, его уже удалили или отметили и убрали.">
        <Button title="К напоминаниям" variant="secondary" onPress={() => router.replace('/reminders')} style={{ marginTop: 8 }} />
      </Empty>
    </>
  );
}

function ReminderForm() {
  const params = useLocalSearchParams<{ id?: string; friendId?: string }>();
  const { data, saveReminder, deleteReminder } = useStore();
  const { s, colors, fonts } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  // Дата и время рядом, пока оба поля влезают; при крупном системном шрифте или узком экране — друг под другом.
  // Цифры «07.11.2026» и «10:00» ≈ 140 px при обычном шрифте, плюс отступы полей, две кнопки и зазоры ≈ 190 px.
  const stackDateTime = width - 40 < 200 + 140 * Math.min(fontScale, 1.3);
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

  // Поля даты и времени, где набранное не совпадает с тем, что сохранится: тогда не сохраняем.
  const [invalid, setInvalid] = useState<{ date?: boolean; time?: boolean }>({});
  const [attempted, setAttempted] = useState(false);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const whenY = useRef(0);
  const markInvalid = (key: 'date' | 'time') => (bad: boolean) => setInvalid((prev) => (!!prev[key] === bad ? prev : { ...prev, [key]: bad }));

  const friend = data.friends.find((f) => f.id === r.friendId);
  const templates = r.friendId ? FRIEND_TEMPLATES : PERSONAL_TEMPLATES;

  const save = () => {
    if (!r.title.trim()) {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      notify('Что напомнить?', 'Введи текст напоминания.');
      return;
    }
    if (invalid.date || invalid.time) {
      setAttempted(true);
      scrollRef.current?.scrollTo({ y: Math.max(0, whenY.current - 16), animated: true });
      notify(invalid.date ? 'Проверь дату' : 'Проверь время', 'Такой даты или времени нет, либо они не дописаны. Поправь, и напоминание сохранится.');
      return;
    }
    // Новая дата или другой повтор — новая серия: старый якорь больше не нужен.
    const sameSeries = !!existing && existing.date === r.date && sameRepeat(existing.repeat, r.repeat);
    saveReminder({ ...r, title: r.title.trim(), anchor: sameSeries ? r.anchor : undefined });
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
              <Text style={{ color: colors.accent, fontSize: 16, fontFamily: fonts.semibold }}>Сохранить</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView ref={scrollRef} style={s.screen} contentContainerStyle={[s.content, { gap: 0 }]} keyboardShouldPersistTaps="handled">
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
        <View style={{ marginBottom: 18 }}>
          <FriendPicker friends={data.friends} value={r.friendId} onChange={(id) => set('friendId', id)} />
        </View>

        <View onLayout={(e) => (whenY.current = e.nativeEvent.layout.y)} style={stackDateTime ? undefined : { flexDirection: 'row', gap: 10 }}>
          <View style={stackDateTime ? undefined : { flex: 4 }}>
            <DateField
              mode="date"
              label={r.repeat ? 'Ближайший раз' : 'Дата или дедлайн'}
              value={r.date}
              onChange={(v) => set('date', v)}
              showIncomplete={attempted}
              onInvalidChange={markInvalid('date')}
            />
          </View>
          <View style={stackDateTime ? undefined : { flex: 3 }}>
            <DateField mode="time" label="Время" value={r.time} onChange={(v) => set('time', v)} showIncomplete={attempted} onInvalidChange={markInvalid('time')} />
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
