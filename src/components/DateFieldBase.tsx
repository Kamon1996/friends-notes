import { useEffect, useState, type ReactNode } from 'react';
import { Text, TextInput, View } from 'react-native';

import { formatRuDate, maskDate, maskTime, parseRuDate, parseTimeText } from '@/lib/dateMask';
import type { ISODate, TimeOfDay } from '@/lib/types';
import { Label, colors, styles } from './ui';

export type DateFieldProps =
  | {
      mode: 'date';
      label: string;
      value: ISODate | null;
      onChange: (v: ISODate) => void;
      /** Ввод только дня и месяца (например, день рождения без года). */
      noYear?: boolean;
      placeholder?: string;
    }
  | { mode: 'time'; label: string; value: TimeOfDay; onChange: (v: TimeOfDay) => void; placeholder?: string };

const format = (p: DateFieldProps) =>
  p.mode === 'date' ? formatRuDate(p.value, !p.noYear) : p.value;

/**
 * Поле даты/времени: ввод цифрами с автоподстановкой точек/двоеточия
 * плюс кнопка справа (`picker`) для выбора в календаре/часах.
 */
export function DateFieldBase({ picker, ...props }: DateFieldProps & { picker: ReactNode }) {
  const [text, setText] = useState(() => format(props));
  const [focused, setFocused] = useState(false);

  // Значение пришло извне (из календаря) — показываем его.
  useEffect(() => {
    if (!focused) setText(format(props));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.value, props.mode === 'date' && props.noYear, focused]);

  const withYear = props.mode === 'date' && !props.noYear;
  const fullLength = props.mode === 'time' ? 5 : withYear ? 10 : 5;
  const parse = (t: string) => (props.mode === 'time' ? parseTimeText(t) : parseRuDate(t, withYear));
  const invalid = text.length === fullLength && !parse(text);

  const onChangeText = (raw: string) => {
    const masked = props.mode === 'time' ? maskTime(raw) : maskDate(raw, withYear);
    setText(masked);
    const parsed = parse(masked);
    if (parsed) (props.onChange as (v: string) => void)(parsed);
  };

  const placeholder =
    props.placeholder ?? (props.mode === 'time' ? 'ЧЧ:ММ' : withYear ? 'ДД.ММ.ГГГГ' : 'ДД.ММ');

  return (
    <View style={styles.field}>
      <Label>{props.label}</Label>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput
          value={text}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setText(format(props)); // неполный или неверный ввод откатываем к последнему верному значению
          }}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          keyboardType="number-pad"
          maxLength={fullLength}
          style={[styles.input, { flex: 1, minWidth: 0 }, invalid && { borderColor: colors.danger }]}
        />
        {picker}
      </View>
      {invalid && (
        <Text style={{ color: colors.danger, fontSize: 13, marginTop: 4 }}>
          {props.mode === 'time' ? 'Нет такого времени' : 'Нет такой даты'}
        </Text>
      )}
    </View>
  );
}

export const pickerButtonStyle = {
  width: 48,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: colors.border,
  backgroundColor: colors.card,
  alignItems: 'center',
  justifyContent: 'center',
} as const;
