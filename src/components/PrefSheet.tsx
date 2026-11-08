import { useState } from 'react';
import { Text, TextInput, View, type TextInputSelectionChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { confirmUnsaved } from '@/lib/confirm';
import { PREF_FIELDS, cleanPref, type PrefField } from '@/lib/prefs';
import type { Friend } from '@/lib/types';
import { Sheet, SheetHandle } from './Sheet';
import { Button, IconButton, IconCircle, useTheme } from './ui';

export { PREF_FIELDS, type PrefField };

/**
 * Шторка «поправить один блок» в карточке друга: нажал на «Подарки» — поле с текстом и открытой клавиатурой,
 * «Сохранить» — и карточка обновилась. Закрыть с правками — спросим, сохранить ли.
 */
export function PrefSheet({ friend, field, onClose, onSave }: { friend: Friend; field: PrefField | null; onClose: () => void; onSave: (field: PrefField, value: string) => void }) {
  const { s, colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  // Пока шторка уезжает, показываем последний открытый блок.
  const [shown, setShown] = useState<PrefField>(field ?? 'gifts');
  const [text, setText] = useState('');
  // Курсор — в конец текста: чаще всего дописывают. Как только человек сам двинул курсор или начал печатать,
  // выделением управляет поле, а не мы.
  const [selection, setSelection] = useState<{ start: number; end: number } | undefined>(undefined);
  const [openedFor, setOpenedFor] = useState<PrefField | null>(null);
  // Открыли шторку (или другой блок) — берём текущий текст из карточки.
  if (field && field !== openedFor) {
    setOpenedFor(field);
    setShown(field);
    setText(friend[field]);
    setSelection({ start: friend[field].length, end: friend[field].length });
  }
  if (!field && openedFor) setOpenedFor(null);

  const meta = PREF_FIELDS.find((p) => p.field === shown)!;
  const initial = friend[shown];
  const changed = !!field && cleanPref(text) !== cleanPref(initial);

  const onSelectionChange = (e: TextInputSelectionChangeEvent) => {
    const sel = e.nativeEvent.selection;
    if (selection && (sel.start !== selection.start || sel.end !== selection.end)) setSelection(undefined);
  };
  const onChangeText = (value: string) => {
    setSelection(undefined);
    setText(value);
  };

  const save = () => {
    if (changed) onSave(shown, cleanPref(text));
    onClose();
  };
  const close = async () => {
    if (!changed) return onClose();
    const choice = await confirmUnsaved();
    if (choice === 'save') save();
    else if (choice === 'discard') onClose();
  };

  return (
    <Sheet visible={!!field} onClose={close} style={{ padding: 20, paddingTop: 10, paddingBottom: 20 + insets.bottom, gap: 14 }}>
      <SheetHandle />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <IconCircle icon={meta.icon} tone="accent" size={34} />
        <Text style={[s.h2, { fontFamily: fonts.display, flex: 1 }]} accessibilityRole="header">
          {meta.label}
        </Text>
        <IconButton icon="close" label="Закрыть" onPress={close} />
      </View>
      <TextInput
        value={text}
        onChangeText={onChangeText}
        selection={selection}
        onSelectionChange={onSelectionChange}
        placeholder={meta.placeholder}
        placeholderTextColor={colors.placeholder}
        multiline
        autoFocus
        accessibilityLabel={meta.label}
        style={[s.input, s.inputMultiline, { minHeight: 112, maxHeight: 220, borderColor: colors.accent, borderWidth: 1.5, lineHeight: 22 }]}
      />
      {meta.hint && <Text style={[s.muted, { marginTop: -6, paddingHorizontal: 2, lineHeight: 18 }]}>{meta.hint}</Text>}
      <Button title="Сохранить" onPress={save} />
    </Sheet>
  );
}
