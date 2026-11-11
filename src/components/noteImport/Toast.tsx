import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';

import { Icon } from '@/components/Icon';
import { useTheme } from '@/components/ui';
import { onUndoOffer, takeUndo, type NoteImportDone } from '@/lib/noteUndo';
import { useStore } from '@/lib/store';

/** Сколько плашка ждёт «Отменить». */
const SHOW_MS = 8000;

/**
 * Плашка после добавления дел из заметки: «Добавлено 6 дел · Отменить». Отмена убирает всё добавленное разом:
 * дела, новых друзей — и возвращает друзьям прежние даты.
 */
export function NoteImportToast({ bottom }: { bottom: number }) {
  const { colors, fonts } = useTheme();
  const { deleteReminders, deleteFriends, saveFriend } = useStore();
  const [done, setDone] = useState<NoteImportDone | null>(null);

  useEffect(() => {
    const pick = () => {
      const d = takeUndo();
      if (d) setDone(d);
    };
    pick();
    return onUndoOffer(pick);
  }, []);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(null), SHOW_MS);
    return () => clearTimeout(t);
  }, [done]);

  if (!done) return null;
  const undo = () => {
    const { reminders, friends, before } = done.changes;
    deleteReminders(reminders.map((r) => r.id));
    if (friends.length) deleteFriends(friends.map((f) => f.id));
    before.forEach(saveFriend);
    setDone(null);
  };
  return (
    <Animated.View entering={FadeInDown.duration(260)} exiting={FadeOutDown.duration(200)} accessibilityLiveRegion="polite" style={{ position: 'absolute', left: 16, right: 16, bottom }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.banner, borderRadius: 18, paddingVertical: 12, paddingLeft: 14, paddingRight: 6 }}>
        <Icon name="check" size={20} color={colors.onBanner} strokeWidth={2.6} />
        <Text style={{ flex: 1, fontFamily: fonts.medium, fontSize: 14.5, lineHeight: 20, color: colors.onBanner }}>{done.text}</Text>
        <Pressable onPress={undo} accessibilityRole="button" accessibilityLabel="Отменить добавление" hitSlop={6} style={({ pressed }) => ({ paddingHorizontal: 12, minHeight: 36, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 14.5, color: colors.onBanner, textDecorationLine: 'underline' }}>Отменить</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}
