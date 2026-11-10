import { createElement, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

/** Веб: поверх элемента лежит прозрачный <input type="date|time"> — нажатие открывает системный выбор. */
export function PickerTrigger({
  mode,
  value,
  onChange,
  label,
  children,
  style,
}: {
  mode: 'date' | 'time';
  value: string;
  onChange: (v: string) => void;
  label: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[style, { position: 'relative', overflow: 'hidden' }]}>
      {children}
      {createElement('input', {
        type: mode,
        'aria-label': label,
        value,
        onChange: (e: { target: { value: string } }) => e.target.value && onChange(e.target.value),
        style: { position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', border: 0, padding: 0 },
      })}
    </View>
  );
}
