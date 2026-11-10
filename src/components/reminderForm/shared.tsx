import { Stack } from 'expo-router';
import { useRef, type ComponentRef, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FriendPickerModal } from '@/components/FriendPicker';
import { PRIORITY_ICON } from '@/components/ReminderRow';
import { ChipStrip, FormCard, SmallChip } from '@/components/form/parts';
import { Button, GrowingInput, useTheme } from '@/components/ui';
import { formatRepeat } from '@/lib/dates';
import { DURATIONS, formatMinutes } from '@/lib/reminderList';
import { PRIORITIES, UNITS, WEEK_DAYS, type ReminderFormModel } from './useReminderForm';

/** Общее у обоих видов формы: шапка, название с шаблонами, «Удалить», «Сохранить» внизу и окно поиска друга. */
export function FormScaffold({ form, children, onPickFriend }: { form: ReminderFormModel; children: ReactNode; onPickFriend?: (id: string | null) => void }) {
  const { s, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const save = () => {
    // Названия нет — показываем подсказку у поля, а оно наверху.
    if (!form.save()) scrollRef.current?.scrollTo({ y: 0, animated: true });
  };
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: form.existing ? 'Напоминание' : 'Новое напоминание' }} />
      <ScrollView ref={scrollRef} style={s.screen} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <TitleCard form={form} />
        {children}
        {form.existing && <Button title="Удалить" variant="danger" onPress={form.remove} style={{ marginTop: 12 }} />}
      </ScrollView>
      <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12 + insets.bottom, backgroundColor: colors.bg }}>
        <Button title="Сохранить" onPress={save} />
      </View>
      <FriendPickerModal open={form.searching} friends={form.friends} value={form.r.friendId} onPick={onPickFriend ?? form.pickFriend} onClose={() => form.setSearching(false)} />
    </KeyboardAvoidingView>
  );
}

/** Название обычным шрифтом; под ним — шаблоны, пока своего названия нет. Пустое при сохранении — подсказка у поля. */
function TitleCard({ form }: { form: ReminderFormModel }) {
  const { s, colors, fonts } = useTheme();
  return (
    <>
      <FormCard style={form.titleMissing ? { borderColor: colors.danger, borderWidth: 1.5 } : undefined}>
        <GrowingInput
          singleLine
          maxLines={3}
          value={form.r.title}
          onChangeText={form.changeTitle}
          // Имя в подсказку не подставляем: «написать Александра» — не тот падеж, а склонять имена мы не умеем.
          placeholder={form.friend ? 'Например, написать или поздравить' : 'Например, сдать отчёт'}
          accessibilityLabel="Что сделать"
          autoFocus={!form.existing}
          style={{ borderWidth: 0, backgroundColor: 'transparent', paddingHorizontal: 16, fontSize: 16.5, fontFamily: fonts.medium }}
        />
        {form.showTemplates && (
          <View style={{ paddingLeft: 12, paddingBottom: 12 }}>
            <ChipStrip label="Шаблоны" chips={form.templateChips} />
          </View>
        )}
      </FormCard>
      {form.titleMissing && <Text style={[s.caption, { color: colors.danger, marginTop: 6, paddingHorizontal: 16 }]}>Напиши, что нужно сделать.</Text>}
    </>
  );
}

export function FormSwitch({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const { colors } = useTheme();
  return <Switch value={value} onValueChange={onChange} accessibilityLabel={label} trackColor={{ true: colors.accent, false: colors.checkbox }} thumbColor="#fff" {...({ activeThumbColor: '#fff' } as object)} />;
}

/**
 * Важность таблетками. Стрелки — как в списке дел: вниз — низкая, вверх — средняя, двойная — важно. Не переключателем:
 * четыре подписи со значками в одну строку на узком экране не помещаются.
 */
export function PriorityChips({ form, onPick }: { form: ReminderFormModel; onPick: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {PRIORITIES.map((o) => (
        <SmallChip
          key={o.value}
          label={o.label}
          icon={o.value ? PRIORITY_ICON[o.value] : undefined}
          iconColor={o.value === 3 ? colors.danger : o.value === 2 ? colors.warn : colors.text3}
          selected={(form.r.priority ?? 0) === o.value}
          onPress={() => {
            form.set('priority', o.value || undefined);
            onPick();
          }}
        />
      ))}
    </View>
  );
}

/** Сколько займёт — таблетками; первая снимает значение. */
export function MinutesChips({ form, onPick }: { form: ReminderFormModel; onPick: () => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {[undefined, ...DURATIONS].map((m) => (
        <SmallChip
          key={m ?? 0}
          label={m ? formatMinutes(m) : 'Не задано'}
          selected={(form.r.minutes ?? undefined) === m}
          onPress={() => {
            form.set('minutes', m);
            onPick();
          }}
        />
      ))}
    </View>
  );
}

/** Повтор по дням недели: семь кружков, нажал — добавил или убрал. Последний выбранный день снять нельзя. */
export function RepeatDays({ form }: { form: ReminderFormModel }) {
  const { colors, fonts } = useTheme();
  const days = form.days ?? [];
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      {WEEK_DAYS.map(({ day, short, name }) => {
        const on = days.includes(day);
        return (
          <Pressable
            key={day}
            onPress={() => form.toggleDay(day)}
            accessibilityRole="checkbox"
            accessibilityLabel={name}
            accessibilityState={{ checked: on }}
            hitSlop={4}
            style={({ pressed }) => ({
              width: 38,
              height: 38,
              borderRadius: 19,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: on ? colors.text : colors.hairline,
              backgroundColor: on ? colors.text : 'transparent',
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: on ? fonts.semibold : fonts.medium, fontSize: 13, lineHeight: 17, color: on ? colors.bg : colors.text }}>
              {short}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Свой повтор: «каждые N» и единица. */
export function CustomRepeat({ form }: { form: ReminderFormModel }) {
  const { s } = useTheme();
  const repeat = form.r.repeat;
  if (!repeat) return null;
  return (
    <View style={{ gap: 10 }}>
      <View style={[s.row, { gap: 10 }]}>
        <Text style={s.body}>Каждые</Text>
        <TextInput
          value={form.everyText}
          onChangeText={form.changeEvery}
          onBlur={form.resetEvery}
          accessibilityLabel="Каждые сколько"
          maxLength={3}
          keyboardType="number-pad"
          style={[s.input, { width: 64, textAlign: 'center', paddingVertical: 6, minHeight: 40 }]}
        />
        <Text style={[s.muted, { flex: 1 }]}>{formatRepeat(repeat)}</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {UNITS.map((u) => (
          <SmallChip key={u.unit} label={u.label} selected={repeat.unit === u.unit} onPress={() => form.set('repeat', { ...repeat, unit: u.unit })} />
        ))}
      </View>
    </View>
  );
}
