import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { APP_VERSION, unseenReleases, type Release } from '@/lib/changelog';
import { useStore } from '@/lib/store';
import { ReleaseNotes } from './ReleaseNotes';
import { Sheet } from './Sheet';
import { Button, useTheme } from './ui';

/**
 * Шторка «Что нового»: при первом запуске после обновления показывает изменения версий,
 * которых пользователь ещё не видел, и запоминает текущую версию. Новая установка ничего не показывает.
 */
export function WhatsNewSheet() {
  const { ready, data, updateSettings } = useStore();
  const [releases, setReleases] = useState<Release[] | null>(null);
  const decided = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Пока шторка уезжает, показываем то же, что было.
  const [shown, setShown] = useState<Release[] | null>(null);
  if (releases && releases !== shown) setShown(releases);

  useEffect(() => {
    if (!ready || decided.current) return;
    decided.current = true;
    const { lastSeenVersion } = data.settings;
    // Ни отметки, ни данных — приложение только что установили: показывать нечего.
    const freshInstall = !lastSeenVersion && data.friends.length === 0 && data.reminders.length === 0;
    const list = freshInstall ? [] : unseenReleases(APP_VERSION, lastSeenVersion);
    // Таймер живёт отдельно от этого эффекта: данные на старте меняются (перенос повторов, фоновые проверки),
    // и сброс таймера при каждой такой правке оставлял бы обновление без шторки.
    if (list.length) timer.current = setTimeout(() => setReleases(list), 600);
    else if (lastSeenVersion !== APP_VERSION) updateSettings({ lastSeenVersion: APP_VERSION });
  }, [ready, data, updateSettings]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      decided.current = false;
    },
    [],
  );

  const close = () => {
    setReleases(null);
    updateSettings({ lastSeenVersion: APP_VERSION });
  };
  const openHistory = () => {
    close();
    router.push('/whats-new');
  };

  return (
    <Sheet visible={releases !== null} onClose={close}>
      {shown && <SheetBody releases={shown} onClose={close} onHistory={openHistory} />}
    </Sheet>
  );
}

function SheetBody({ releases, onClose, onHistory }: { releases: Release[]; onClose: () => void; onHistory: () => void }) {
  const { s, colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const single = releases.length === 1;
  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingTop: 20,
        paddingBottom: 20 + insets.bottom,
        maxHeight: height * 0.78,
        gap: 14,
      }}
    >
      <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.hairline, alignSelf: 'center' }} />
      <View style={{ paddingHorizontal: 20, gap: 4 }}>
        <Text style={[s.h2, { fontFamily: fonts.display }]}>Что нового</Text>
        <Text style={s.muted}>{single ? `Приложение обновилось до версии ${APP_VERSION}.` : `Приложение обновилось до версии ${APP_VERSION} — вот что появилось с прошлого раза.`}</Text>
      </View>
      <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 18 }} showsVerticalScrollIndicator={false}>
        {releases.map((r) => (
          <ReleaseNotes key={r.version} release={r} compact />
        ))}
      </ScrollView>
      <View style={{ paddingHorizontal: 20, gap: 4 }}>
        <Button title="Понятно" onPress={onClose} />
        <Pressable onPress={onHistory} accessibilityRole="button" style={({ pressed }) => ({ alignSelf: 'center', minHeight: 44, paddingHorizontal: 16, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
          <Text style={[s.muted, { color: colors.accentText, fontFamily: fonts.medium }]}>Вся история изменений →</Text>
        </Pressable>
      </View>
    </View>
  );
}
