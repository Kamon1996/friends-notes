import { createElement } from 'react';
import { Text, View } from 'react-native';

import { DateFieldBase, pickerButtonStyle, type DateFieldProps } from './DateFieldBase';

/**
 * Веб-версия: ввод цифрами + кнопка, поверх которой лежит прозрачный
 * <input type="date|time"> — нажатие открывает системный выбор даты.
 */
export function DateField(props: DateFieldProps) {
  const picker = (
    <View style={[pickerButtonStyle, { position: 'relative', overflow: 'hidden' }]}>
      <Text style={{ fontSize: 20 }}>{props.mode === 'date' ? '📅' : '🕐'}</Text>
      {createElement('input', {
        type: props.mode,
        'aria-label': props.mode === 'date' ? 'Выбрать в календаре' : 'Выбрать время',
        value: props.value ?? '',
        onChange: (e: { target: { value: string } }) => {
          const v = e.target.value;
          if (!v) return;
          if (props.mode === 'date') props.onChange(v);
          else props.onChange(v);
        },
        style: {
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          opacity: 0,
          cursor: 'pointer',
          border: 0,
          padding: 0,
        },
      })}
    </View>
  );

  return <DateFieldBase {...props} picker={picker} />;
}
