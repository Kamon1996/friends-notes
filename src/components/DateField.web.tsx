import { createElement } from 'react';
import { View } from 'react-native';

import type { ISODate, TimeOfDay } from '@/lib/types';
import { Label, colors } from './ui';

type Props =
  | { mode: 'date'; label: string; value: ISODate | null; onChange: (v: ISODate) => void; placeholder?: string }
  | { mode: 'time'; label: string; value: TimeOfDay; onChange: (v: TimeOfDay) => void; placeholder?: string };

/** Веб-версия: обычный <input type="date|time"> — удобно для превью в браузере. */
export function DateField(props: Props) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Label>{props.label}</Label>
      {createElement('input', {
        type: props.mode,
        value: props.value ?? '',
        onChange: (e: { target: { value: string } }) => {
          if (e.target.value) props.onChange(e.target.value);
        },
        style: {
          fontSize: 16,
          padding: '12px 14px',
          borderRadius: 12,
          border: `1px solid ${colors.border}`,
          background: colors.card,
          color: colors.text,
          fontFamily: 'inherit',
        },
      })}
    </View>
  );
}
