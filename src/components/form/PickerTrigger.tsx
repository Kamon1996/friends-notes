import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState, type ReactNode } from 'react';
import { Modal, Platform, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { combine, parseISODate, toISODate, toTime } from '@/lib/dates';
import { Button, useTheme } from '../ui';

/**
 * Любой элемент, по нажатию на который открывается системный выбор даты или времени: значок часов в строке «Время»,
 * «Другая дата» под календарём. Android — системный диалог, iOS — колесо в модалке.
 */
export function PickerTrigger({
  mode,
  value,
  onChange,
  label,
  children,
  style,
}: {
  mode: 'date' | 'time';
  /** Дата «ГГГГ-ММ-ДД» или время «ЧЧ:ММ». */
  value: string;
  onChange: (v: string) => void;
  label: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const [iosOpen, setIosOpen] = useState(false);
  const [draft, setDraft] = useState(new Date());
  const current = () => (mode === 'date' ? parseISODate(value) : combine(toISODate(new Date()), value));
  const apply = (d: Date) => onChange(mode === 'date' ? toISODate(d) : toTime(d));

  const open = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({ value: current(), mode, is24Hour: true, onValueChange: (_e, d) => apply(d) });
    } else {
      setDraft(current());
      setIosOpen(true);
    }
  };

  return (
    <>
      <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={label} hitSlop={6} style={({ pressed }) => [style, pressed && { opacity: 0.6 }]}>
        {children}
      </Pressable>
      {Platform.OS === 'ios' && (
        <Modal visible={iosOpen} transparent animationType="slide" onRequestClose={() => setIosOpen(false)}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' }} onPress={() => setIosOpen(false)} />
          <View style={{ backgroundColor: colors.card, padding: 16, paddingBottom: 36 }}>
            <DateTimePicker value={draft} mode={mode} display="spinner" locale="ru-RU" onValueChange={(_e, d) => setDraft(d)} />
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
    </>
  );
}
