import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Modal, Platform, Pressable, View } from 'react-native';

import { UNKNOWN_YEAR, hasYear, parseISODate, toISODate } from '@/lib/dates';
import type { ISODate } from '@/lib/types';
import { usePickerButtonStyle } from './DateFieldBase';
import { Icon } from './Icon';
import { Button, useTheme } from './ui';

/** Кнопка с календарём: Android — системный диалог, iOS — колесо в модалке. Год не известен — колесо откроется на этом же дне 25 лет назад. */
export function DatePickerButton({ value, onChange }: { value: ISODate | null; onChange: (v: ISODate) => void }) {
  const { colors } = useTheme();
  const pickerButton = usePickerButtonStyle();
  const [iosOpen, setIosOpen] = useState(false);
  const [draft, setDraft] = useState(new Date());

  const initial = () => {
    if (!value) return new Date();
    const d = parseISODate(value);
    if (!hasYear(value) || d.getFullYear() === UNKNOWN_YEAR) d.setFullYear(new Date().getFullYear() - 25);
    return d;
  };

  const open = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({ value: initial(), mode: 'date', onValueChange: (_e, d) => onChange(toISODate(d)) });
    } else {
      setDraft(initial());
      setIosOpen(true);
    }
  };

  return (
    <>
      <Pressable onPress={open} accessibilityLabel="Выбрать в календаре" style={({ pressed }) => [pickerButton, { height: 50 }, pressed && { opacity: 0.6 }]}>
        <Icon name="calendar" size={20} color={colors.text2} />
      </Pressable>
      {Platform.OS === 'ios' && (
        <Modal visible={iosOpen} transparent animationType="slide" onRequestClose={() => setIosOpen(false)}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' }} onPress={() => setIosOpen(false)} />
          <View style={{ backgroundColor: colors.card, padding: 16, paddingBottom: 36 }}>
            <DateTimePicker value={draft} mode="date" display="spinner" locale="ru-RU" onValueChange={(_e, d) => setDraft(d)} />
            <Button
              title="Готово"
              onPress={() => {
                onChange(toISODate(draft));
                setIosOpen(false);
              }}
            />
          </View>
        </Modal>
      )}
    </>
  );
}
