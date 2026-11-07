import { useRef, useState, type ComponentRef } from 'react';
import { Pressable, Text, TextInput, View, type TextInputKeyPressEvent } from 'react-native';

import { EMPTY_PARTS, composeDate, partsErrors, splitDate, type DateParts } from '@/lib/birthday';
import type { ISODate } from '@/lib/types';
import { DatePickerButton } from './DatePickerButton';
import { Icon } from './Icon';
import { Label, useTheme } from './ui';

const digits = (v: string, max: number) => v.replace(/\D/g, '').slice(0, max);

/**
 * Дата из трёх полей: день, месяц и необязательный год. Пустой год и есть «год неизвестен»,
 * курсор сам переходит в следующее поле, крестик очищает, календарь рядом.
 */
export function BirthdayField({
  label,
  value,
  onChange,
  hint = 'Год можно не указывать — тогда напомним без возраста.',
}: {
  label: string;
  value: ISODate | null;
  onChange: (v: ISODate | null) => void;
  hint?: string;
}) {
  const { s, colors } = useTheme();
  const [parts, setParts] = useState<DateParts>(() => splitDate(value));
  const [syncedWith, setSyncedWith] = useState<ISODate | null>(value);
  // Значение пришло извне (из календаря) — показываем его. Своё же набранное не трогаем.
  if (value !== syncedWith) {
    setSyncedWith(value);
    setParts(splitDate(value));
  }
  const dayRef = useRef<ComponentRef<typeof TextInput>>(null);
  const monthRef = useRef<ComponentRef<typeof TextInput>>(null);
  const yearRef = useRef<ComponentRef<typeof TextInput>>(null);
  const errors = partsErrors(parts);
  const hasError = errors.day || errors.month || errors.year;
  const filled = !!(parts.day || parts.month || parts.year);

  const commit = (next: DateParts) => {
    setParts(next);
    const iso = composeDate(next);
    setSyncedWith(iso);
    onChange(iso);
  };
  const clear = () => {
    commit(EMPTY_PARTS);
    dayRef.current?.focus();
  };

  const cellStyle = (error: boolean) => [
    s.input,
    { paddingHorizontal: 8, fontSize: 17, letterSpacing: 0.3, fontVariant: ['tabular-nums'] as const, textAlign: 'center' as const },
    error && { borderColor: colors.danger, borderWidth: 1.5 },
  ];

  return (
    <View style={s.field}>
      <Label>{label}</Label>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <TextInput
          ref={dayRef}
          value={parts.day}
          onChangeText={(v) => {
            const day = digits(v, 2);
            commit({ ...parts, day });
            if (day.length === 2) monthRef.current?.focus();
          }}
          placeholder="ДД"
          placeholderTextColor={colors.placeholder}
          keyboardType="number-pad"
          maxLength={2}
          maxFontSizeMultiplier={1.3}
          accessibilityLabel="День"
          style={[...cellStyle(errors.day), { width: 64 }]}
        />
        <TextInput
          ref={monthRef}
          value={parts.month}
          onChangeText={(v) => {
            const month = digits(v, 2);
            commit({ ...parts, month });
            if (month.length === 2) yearRef.current?.focus();
          }}
          onKeyPress={(e: TextInputKeyPressEvent) => {
            if (e.nativeEvent.key === 'Backspace' && !parts.month) dayRef.current?.focus();
          }}
          placeholder="ММ"
          placeholderTextColor={colors.placeholder}
          keyboardType="number-pad"
          maxLength={2}
          maxFontSizeMultiplier={1.3}
          accessibilityLabel="Месяц"
          style={[...cellStyle(errors.month), { width: 64 }]}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <TextInput
            ref={yearRef}
            value={parts.year}
            onChangeText={(v) => commit({ ...parts, year: digits(v, 4) })}
            onKeyPress={(e: TextInputKeyPressEvent) => {
              if (e.nativeEvent.key === 'Backspace' && !parts.year) monthRef.current?.focus();
            }}
            placeholder="Год"
            placeholderTextColor={colors.placeholder}
            keyboardType="number-pad"
            maxLength={4}
            maxFontSizeMultiplier={1.3}
            accessibilityLabel="Год"
            style={[...cellStyle(errors.year), filled && { paddingRight: 34 }]}
          />
          {filled && (
            <Pressable
              onPress={clear}
              accessibilityLabel="Очистить дату"
              hitSlop={8}
              style={({ pressed }) => ({ position: 'absolute', right: 4, top: 0, bottom: 0, width: 32, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.5 : 1 })}
            >
              <Icon name="close" size={16} color={colors.text3} strokeWidth={2} />
            </Pressable>
          )}
        </View>
        <DatePickerButton value={value} onChange={(iso) => onChange(iso)} />
      </View>
      <Text style={[s.caption, { marginTop: 6, paddingHorizontal: 4 }, hasError && { color: colors.danger }]}>{hasError ? 'Такой даты нет — проверь число и месяц.' : hint}</Text>
    </View>
  );
}
