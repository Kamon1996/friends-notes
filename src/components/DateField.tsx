import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Modal, Platform, Pressable, Text, View } from 'react-native';

import { combine, formatDate, parseISODate, toISODate, toTime } from '@/lib/dates';
import type { ISODate, TimeOfDay } from '@/lib/types';
import { Button, Label, colors, styles } from './ui';

type Props =
  | { mode: 'date'; label: string; value: ISODate | null; onChange: (v: ISODate) => void; placeholder?: string }
  | { mode: 'time'; label: string; value: TimeOfDay; onChange: (v: TimeOfDay) => void; placeholder?: string };

/** Поле выбора даты/времени с нативным пикером (Android — диалог, iOS — колесо в модалке). */
export function DateField(props: Props) {
  const [iosOpen, setIosOpen] = useState(false);
  const [draft, setDraft] = useState(new Date());

  const current =
    props.mode === 'date'
      ? props.value
        ? parseISODate(props.value)
        : new Date()
      : combine(toISODate(new Date()), props.value);

  const apply = (d: Date) => {
    if (props.mode === 'date') props.onChange(toISODate(d));
    else props.onChange(toTime(d));
  };

  const open = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current,
        mode: props.mode,
        is24Hour: true,
        onValueChange: (_e, d) => apply(d),
      });
    } else {
      setDraft(current);
      setIosOpen(true);
    }
  };

  const text = props.mode === 'date' ? (props.value ? formatDate(props.value) : '') : props.value;

  return (
    <View style={styles.field}>
      <Label>{props.label}</Label>
      <Pressable onPress={open} style={styles.input}>
        <Text style={{ fontSize: 16, color: text ? colors.text : colors.muted }}>
          {text || props.placeholder || 'Выбрать'}
        </Text>
      </Pressable>

      {Platform.OS === 'ios' && (
        <Modal visible={iosOpen} transparent animationType="slide" onRequestClose={() => setIosOpen(false)}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' }} onPress={() => setIosOpen(false)} />
          <View style={{ backgroundColor: colors.card, padding: 16, paddingBottom: 36 }}>
            <DateTimePicker
              value={draft}
              mode={props.mode}
              display="spinner"
              locale="ru-RU"
              onValueChange={(_e, d) => setDraft(d)}
            />
            <Button
              title="Готово"
              onPress={() => {
                apply(draft);
                setIosOpen(false);
              }}
            />
          </View>
        </Modal>
      )}
    </View>
  );
}
