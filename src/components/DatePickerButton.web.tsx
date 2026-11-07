import { createElement } from 'react';
import { View } from 'react-native';

import { UNKNOWN_YEAR, hasYear, parseISODate, toISODate } from '@/lib/dates';
import type { ISODate } from '@/lib/types';
import { usePickerButtonStyle } from './DateFieldBase';
import { Icon } from './Icon';
import { useTheme } from './ui';

/** Веб: поверх кнопки лежит прозрачный <input type="date"> — нажатие открывает системный календарь. */
export function DatePickerButton({ value, onChange }: { value: ISODate | null; onChange: (v: ISODate) => void }) {
  const { colors } = useTheme();
  const pickerButton = usePickerButtonStyle();
  let shown = value ?? '';
  if (value && !hasYear(value)) {
    const d = parseISODate(value);
    if (d.getFullYear() === UNKNOWN_YEAR) d.setFullYear(new Date().getFullYear() - 25);
    shown = toISODate(d);
  }
  return (
    <View style={[pickerButton, { height: 50, position: 'relative', overflow: 'hidden' }]}>
      <Icon name="calendar" size={20} color={colors.text2} />
      {createElement('input', {
        type: 'date',
        'aria-label': 'Выбрать в календаре',
        value: shown,
        onChange: (e: { target: { value: string } }) => e.target.value && onChange(e.target.value),
        style: { position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', border: 0, padding: 0 },
      })}
    </View>
  );
}
