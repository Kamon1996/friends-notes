import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Linking, Platform, ScrollView, Text } from 'react-native';

import { DateField } from '@/components/DateField';
import { Button, Card, SectionTitle, SwitchRow, colors, styles } from '@/components/ui';
import { notificationsAllowed, sendTestNotification, setupNotifications } from '@/lib/notifications';
import { loadEnrichment } from '@/lib/contacts';
import { applyEnrichment } from '@/lib/enrich';
import { useStore } from '@/lib/store';

export default function SettingsScreen() {
  const { data, updateSettings, updateFriends } = useStore();
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

  const test = async () => {
    const ok = await sendTestNotification();
    if (ok) Alert.alert('Отправлено', 'Уведомление придёт через 5 секунд. Можно свернуть приложение.');
    else enable();
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <SectionTitle>Уведомления</SectionTitle>
      <Card style={{ gap: 12 }}>
        {Platform.OS === 'web' ? (
          <Text style={styles.muted}>В браузере уведомления не работают — открой приложение на телефоне.</Text>
        ) : (
          <>
            <Text style={[styles.title, { color: allowed ? colors.green : colors.danger }]}>
              {allowed === null ? '…' : allowed ? '✓ Уведомления включены' : '✕ Уведомления выключены'}
            </Text>
            {!allowed && <Button title="Включить уведомления" onPress={enable} />}
            <Button title="Отправить тестовое уведомление" variant="secondary" onPress={test} />
          </>
        )}
      </Card>

      <SectionTitle>Дни рождения и важные даты</SectionTitle>
      <Card>
        <DateField
          mode="time"
          label="Во сколько напоминать"
          value={data.settings.eventTime}
          onChange={(v) => updateSettings({ eventTime: v })}
        />
        <SwitchRow
          label="Напоминать ещё и за день"
          value={data.settings.eventDayBefore}
          onChange={(v) => updateSettings({ eventDayBefore: v })}
        />
      </Card>

      {Platform.OS === 'android' && (
        <>
          <SectionTitle>Друзья</SectionTitle>
          <Card style={{ gap: 10 }}>
            <Text style={[styles.muted, { lineHeight: 20 }]}>
              Найти в контактах телефона Telegram, WhatsApp, Viber и фото для уже добавленных друзей (по номеру
              телефона).
            </Text>
            <Button title={enrichStatus === '…' ? 'Ищу…' : '🔄 Подтянуть мессенджеры и фото'} variant="secondary" onPress={enrich} />
            {enrichStatus && enrichStatus !== '…' && <Text style={styles.muted}>{enrichStatus}</Text>}
          </Card>
        </>
      )}

      <SectionTitle>Для разработки</SectionTitle>
      <Button
        title="🧪 Данные из приложений (Telegram, WhatsApp…)"
        variant="secondary"
        onPress={() => router.push('/sources')}
      />
      <Button title="🔬 Диагностика контактов" variant="secondary" onPress={() => router.push('/contacts-debug')} />
      <Button title="🩺 Отчёт об ошибке" variant="secondary" onPress={() => router.push('/diagnostics')} />

      <Text style={[styles.muted, { textAlign: 'center', marginTop: 16 }]}>
        Все данные хранятся только на этом телефоне.
      </Text>
    </ScrollView>
  );
}
