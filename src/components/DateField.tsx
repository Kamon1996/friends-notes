import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Modal, Platform, Pressable, Text, View } from 'react-native';

import { combine, parseISODate, toISODate, toTime } from '@/lib/dates';
import { DateFieldBase, pickerButtonStyle, type DateFieldProps } from './DateFieldBase';
import { Button, colors } from './ui';

/** Поле даты/времени: ввод цифрами + кнопка нативного пикера (Android — диалог, iOS — колесо в модалке). */
export function DateField(props: DateFieldProps) {
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

  const picker = (
    <>
      <Pressable
        onPress={open}
        accessibilityLabel={props.mode === 'date' ? 'Выбрать в календаре' : 'Выбрать время'}
        style={({ pressed }) => [pickerButtonStyle, pressed && { opacity: 0.6 }]}
      >
        <Text style={{ fontSize: 20 }}>{props.mode === 'date' ? '📅' : '🕐'}</Text>
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
    </>
  );

  return <DateFieldBase {...props} picker={picker} />;
}
