import { useEffect, useEffectEvent, useState, type ReactNode } from 'react';
import { Text, TextInput, View, type ViewStyle } from 'react-native';

import { formatRuDate, maskDate, maskTime, parseRuDate, parseTimeText } from '@/lib/dateMask';
import type { ISODate, TimeOfDay } from '@/lib/types';
import { Label, useTheme } from './ui';

/** Общее для полей даты и времени: форма узнаёт, что набранное нельзя сохранить. */
interface FieldValidity {
  /** Набранный текст не совпадает с тем, что сохранится (ошибка или не дописано). */
  onInvalidChange?: (invalid: boolean) => void;
  /** Показывать «допиши» и для неполного ввода — после попытки сохранить. */
  showIncomplete?: boolean;
}

export type DateFieldProps = FieldValidity &
  (
  | {
      mode: 'date';
      label: string;
      value: ISODate | null;
      onChange: (v: ISODate) => void;
      /** Ввод только дня и месяца (например, день рождения без года). */
      noYear?: boolean;
      placeholder?: string;
    }
  | { mode: 'time'; label: string; value: TimeOfDay; onChange: (v: TimeOfDay) => void; placeholder?: string }
  );

const format = (p: DateFieldProps) =>
  p.mode === 'date' ? formatRuDate(p.value, !p.noYear) : p.value;

/**
 * Поле даты/времени: ввод цифрами с автоподстановкой точек/двоеточия
 * плюс кнопка справа (`picker`) для выбора в календаре/часах.
 */
export function DateFieldBase({ picker, picked = 0, ...props }: DateFieldProps & { picker: ReactNode; /** Счётчик выборов в календаре или часах. */ picked?: number }) {
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
  // Выбрали в календаре или на часах — в поле сразу то, что выбрано: и когда курсор стоит в поле, и когда набранное
  // было с ошибкой, а выбрали ту же дату, что уже сохранена. Иначе форма ругалась бы на дату, которую только что выбрали.
  const [seenPick, setSeenPick] = useState(picked);
  if (seenPick !== picked) {
    setSeenPick(picked);
    setText(external);
  }

  const withYear = props.mode === 'date' && !props.noYear;
  const fullLength = props.mode === 'time' ? 5 : withYear ? 10 : 5;
  const parse = (t: string) => (props.mode === 'time' ? parseTimeText(t) : parseRuDate(t, withYear));
  const invalid = text.length === fullLength && !parse(text);
  // Пока набранное не совпадает с сохранённым значением, сохранять форму нельзя: иначе сохранится прошлое верное значение.
  const mismatch = text !== external;
  const incomplete = mismatch && !invalid && text.length > 0;
  const report = useEffectEvent((bad: boolean) => props.onInvalidChange?.(bad));
  useEffect(() => {
    report(mismatch);
  }, [mismatch]);
  useEffect(() => () => report(false), []);

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
            // Пустое поле возвращаем к сохранённому значению. Неверное или недописанное оставляем как есть с подсказкой:
            // молча откатить к прошлому значению — значит сохранить не то, что человек набрал.
            if (!text) setText(format(props));
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
            (invalid || (incomplete && (props.showIncomplete || !focused))) && { borderColor: colors.danger, borderWidth: 1.5 },
          ]}
        />
        {picker}
      </View>
      {(invalid || (incomplete && (props.showIncomplete || !focused))) && (
        <Text style={[s.caption, { color: colors.danger, marginTop: 4 }]}>
          {invalid ? (props.mode === 'time' ? 'Нет такого времени' : 'Нет такой даты') : props.mode === 'time' ? 'Допиши время' : 'Допиши дату'}
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
