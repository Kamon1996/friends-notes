import { useState } from 'react';
import { ScrollView, Text, View, useColorScheme } from 'react-native';

import { AccentPicker } from '@/components/AccentPicker';
import { ThemePreview } from '@/components/ThemePreview';
import { Card, Chip, useTheme } from '@/components/ui';
import { useStore } from '@/lib/store';
import type { Scheme } from '@/lib/theme';
import type { ThemeMode } from '@/lib/types';

export const THEME_MODES: { key: ThemeMode; label: string }[] = [
  { key: 'system', label: 'Как в системе' },
  { key: 'light', label: 'Светлая' },
  { key: 'dark', label: 'Тёмная' },
];

/** Оформление: живой предпросмотр «Напоминаний» сверху, под ним тема и цвет для каждой темы. */
export default function AppearanceScreen() {
  const { data, updateSettings } = useStore();
  const { s, scheme } = useTheme();
  const system = useColorScheme();
  const { settings } = data;
  // Какую тему показывает предпросмотр: сначала текущую, дальше ту, чей цвет трогали.
  const [preview, setPreview] = useState<Scheme>(scheme);
  const accentId = preview === 'dark' ? settings.accentDark : settings.accentLight;

  const setMode = (mode: ThemeMode) => {
    updateSettings({ theme: mode });
    setPreview(mode === 'system' ? (system === 'dark' ? 'dark' : 'light') : mode);
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.content, { gap: 16 }]}>
      <ThemePreview scheme={preview} accentId={accentId} onSchemeChange={setPreview} />
      <Card style={{ gap: 8 }}>
        <Text style={s.label}>Тема</Text>
        <View style={s.chips}>
          {THEME_MODES.map((m) => (
            <Chip key={m.key} label={m.label} selected={settings.theme === m.key} onPress={() => setMode(m.key)} />
          ))}
        </View>
      </Card>
      <Card style={{ gap: 14 }}>
        <View style={{ gap: 4 }}>
          <Text style={s.label}>Цвет светлой темы</Text>
          <AccentPicker
            scheme="light"
            value={settings.accentLight}
            onChange={(id) => {
              updateSettings({ accentLight: id });
              setPreview('light');
            }}
          />
        </View>
        <View style={{ gap: 4 }}>
          <Text style={s.label}>Цвет тёмной темы</Text>
          <AccentPicker
            scheme="dark"
            value={settings.accentDark}
            onChange={(id) => {
              updateSettings({ accentDark: id });
              setPreview('dark');
            }}
          />
        </View>
      </Card>
      <Text style={[s.caption, { paddingHorizontal: 4 }]}>Нажми на цвет — экран наверху перекрасится. Переключатель на нём показывает другую тему.</Text>
    </ScrollView>
  );
}
