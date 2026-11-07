import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { DateField } from '@/components/DateField';
import { Icon } from '@/components/Icon';
import { Button, Card, Chip, Group, IconCircle, ListRow, SectionTitle, SwitchRow, useTheme } from '@/components/ui';
import { APP_VERSION } from '@/lib/changelog';
import { loadEnrichment } from '@/lib/contacts';
import { applyEnrichment } from '@/lib/enrich';
import { notificationsAllowed, setupNotifications } from '@/lib/notifications';
import { useStore } from '@/lib/store';
import { ACCENTS, type AccentId, type Scheme } from '@/lib/theme';
import type { ThemeMode } from '@/lib/types';

const THEME_MODES: { key: ThemeMode; label: string }[] = [
  { key: 'system', label: 'Как в системе' },
  { key: 'light', label: 'Светлая' },
  { key: 'dark', label: 'Тёмная' },
];

/** Шесть кружков акцента для одной темы; выбранный — с кольцом и галочкой. */
function AccentPicker({ scheme, value, onChange }: { scheme: Scheme; value: AccentId; onChange: (id: AccentId) => void }) {
  const { colors, fonts } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
      {ACCENTS.map((a) => {
        const c = a[scheme];
        const selected = a.id === value;
        return (
          <Pressable key={a.id} onPress={() => onChange(a.id)} accessibilityLabel={a.name} style={{ alignItems: 'center', gap: 6, flex: 1 }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                borderWidth: 2,
                borderColor: selected ? colors.text : 'transparent',
                padding: 3,
              }}
            >
              <View style={{ flex: 1, borderRadius: 17, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
                {selected && <Icon name="check" size={16} color={c.onAccent} strokeWidth={3} />}
              </View>
            </View>
            <Text style={{ fontFamily: selected ? fonts.semibold : fonts.body, fontSize: 10, lineHeight: 12, color: selected ? colors.text : colors.text3 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {a.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function SettingsScreen() {
  const { data, updateSettings, updateFriends } = useStore();
  const { s, colors } = useTheme();
  const [enrichStatus, setEnrichStatus] = useState<string | null>(null);

  const enrich = async () => {
    setEnrichStatus('…');
    try {
      const map = await loadEnrichment();
      const { friends, changed } = applyEnrichment(data.friends, map);
      if (changed) updateFriends((f) => friends.find((x) => x.id === f.id) ?? f);
      setEnrichStatus(changed ? `Обновлено друзей: ${changed}` : 'Ничего нового не нашлось');
    } catch (e) {
      setEnrichStatus(e instanceof Error ? e.message : String(e));
    }
  };
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    notificationsAllowed().then(setAllowed);
  }, []);

  const enable = async () => {
    const ok = await setupNotifications();
    setAllowed(ok);
    if (!ok && Platform.OS !== 'web') {
      Alert.alert('Уведомления выключены', 'Разреши их в настройках телефона.', [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Открыть настройки', onPress: () => Linking.openSettings() },
      ]);
    }
  };

  const { settings } = data;

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <View style={{ gap: 8 }}>
        <SectionTitle style={{ marginBottom: 0 }}>Уведомления</SectionTitle>
        <Card style={{ gap: 10 }}>
          {Platform.OS === 'web' ? (
            <Text style={s.muted}>В браузере уведомления не работают — открой приложение на телефоне.</Text>
          ) : (
            <>
              <View style={s.row}>
                <IconCircle icon="bell" tone={allowed ? 'success' : 'warn'} />
                <Text style={[s.title, { flex: 1 }]}>
                  {allowed === null ? '…' : allowed ? 'Уведомления включены' : 'Уведомления выключены'}
                </Text>
              </View>
              {!allowed && <Button title="Включить уведомления" onPress={enable} />}
            </>
          )}
        </Card>
        <Card style={{ paddingBottom: 6 }}>
          <DateField mode="time" label="Во сколько напоминать о датах" value={settings.eventTime} onChange={(v) => updateSettings({ eventTime: v })} />
          <SwitchRow label="Напоминать ещё и за день" value={settings.eventDayBefore} onChange={(v) => updateSettings({ eventDayBefore: v })} />
        </Card>
      </View>

      <View style={{ gap: 8 }}>
        <SectionTitle style={{ marginBottom: 0 }}>Оформление</SectionTitle>
        <Card style={{ gap: 14 }}>
          <View style={{ gap: 8 }}>
            <Text style={s.label}>Тема</Text>
            <View style={s.chips}>
              {THEME_MODES.map((m) => (
                <Chip key={m.key} label={m.label} selected={settings.theme === m.key} onPress={() => updateSettings({ theme: m.key })} />
              ))}
            </View>
          </View>
          <View style={{ gap: 4 }}>
            <Text style={s.label}>Цвет светлой темы</Text>
            <AccentPicker scheme="light" value={settings.accentLight} onChange={(id) => updateSettings({ accentLight: id })} />
          </View>
          <View style={{ gap: 4 }}>
            <Text style={s.label}>Цвет тёмной темы</Text>
            <AccentPicker scheme="dark" value={settings.accentDark} onChange={(id) => updateSettings({ accentDark: id })} />
          </View>
          <Text style={s.caption}>Цвет кнопок, активной вкладки и карточки «Сегодня». У светлой и тёмной темы он свой.</Text>
        </Card>
      </View>

      {Platform.OS === 'android' && (
        <View style={{ gap: 8 }}>
          <SectionTitle style={{ marginBottom: 0 }}>Друзья</SectionTitle>
          <Card style={{ gap: 10 }}>
            <Text style={s.muted}>
              Найти в контактах телефона Telegram, WhatsApp, Viber и фото для уже добавленных друзей — по номеру телефона.
            </Text>
            <Button title={enrichStatus === '…' ? 'Ищу…' : 'Подтянуть мессенджеры и фото'} icon="refresh" variant="secondary" onPress={enrich} />
            {enrichStatus && enrichStatus !== '…' && <Text style={s.muted}>{enrichStatus}</Text>}
          </Card>
        </View>
      )}

      <View style={{ gap: 8 }}>
        <SectionTitle style={{ marginBottom: 0 }}>Помощь</SectionTitle>
        <Group inset={62}>
          <ListRow leading={<IconCircle icon="list" />} title="Что нового" subtitle="История изменений по версиям" chevron onPress={() => router.push('/whats-new')} />
          <ListRow leading={<IconCircle icon="info" />} title="Отчёт об ошибке" subtitle="Если что-то пошло не так — отправь отчёт" chevron onPress={() => router.push('/diagnostics')} />
        </Group>
      </View>

      <Text style={[s.caption, { textAlign: 'center', color: colors.text3 }]}>{`«Друзья» ${APP_VERSION}\nВсе данные хранятся только на этом телефоне.`}</Text>
    </ScrollView>
  );
}
