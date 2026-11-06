import { useState, type ReactNode } from 'react';
import { Text, TextInput, View, type ViewStyle } from 'react-native';

import { formatRuDate, maskDate, maskTime, parseRuDate, parseTimeText } from '@/lib/dateMask';
import type { ISODate, TimeOfDay } from '@/lib/types';
import { Label, useTheme } from './ui';

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
  const { s, colors } = useTheme();
  const [text, setText] = useState(() => format(props));
  const [focused, setFocused] = useState(false);

  // Значение пришло извне (из календаря) — показываем его. Считаем прямо при рендере,
  // запоминая, для какого значения текст был сформирован.
  const external = format(props);
  const [shown, setShown] = useState(external);
  if (shown !== external) {
    setShown(external);
    if (!focused) setText(external);
  }

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
    <View style={s.field}>
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
          placeholderTextColor={colors.placeholder}
          keyboardType="number-pad"
          maxLength={fullLength}
          maxFontSizeMultiplier={1.3}
          style={[
            s.input,
            { flex: 1, minWidth: 0, paddingHorizontal: 12, fontSize: 17, letterSpacing: 0.3, fontVariant: ['tabular-nums'] },
            focused && { borderColor: colors.accent, borderWidth: 1.5 },
            invalid && { borderColor: colors.danger, borderWidth: 1.5 },
          ]}
        />
        {picker}
      </View>
      {invalid && (
        <Text style={[s.caption, { color: colors.danger, marginTop: 4 }]}>
          {props.mode === 'time' ? 'Нет такого времени' : 'Нет такой даты'}
        </Text>
      )}
    </View>
  );
}

export function usePickerButtonStyle(): ViewStyle {
  const { colors } = useTheme();
  return {
    width: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  };
}
