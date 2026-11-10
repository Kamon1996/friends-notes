import { createElement, useState } from 'react';
import { View } from 'react-native';

import { DateFieldBase, usePickerButtonStyle, type DateFieldProps } from './DateFieldBase';
import { Icon } from './Icon';
import { useTheme } from './ui';

/**
 * Веб-версия: ввод цифрами + кнопка, поверх которой лежит прозрачный
 * <input type="date|time"> — нажатие открывает системный выбор даты.
 */
export function DateField(props: DateFieldProps) {
  const { colors } = useTheme();
  const pickerButton = usePickerButtonStyle();
  const [picked, setPicked] = useState(0);
  const picker = (
    <View style={[pickerButton, { position: 'relative', overflow: 'hidden' }]}>
      <Icon name={props.mode === 'date' ? 'calendar' : 'clock'} size={20} color={colors.text2} />
      {createElement('input', {
        type: props.mode,
        'aria-label': props.mode === 'date' ? 'Выбрать в календаре' : 'Выбрать время',
        value: props.value ?? '',
        onChange: (e: { target: { value: string } }) => {
          const v = e.target.value;
          if (!v) return;
          if (props.mode === 'date') props.onChange(v);
          else props.onChange(v);
          setPicked((n) => n + 1);
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

  return <DateFieldBase {...props} picker={picker} picked={picked} />;
}
