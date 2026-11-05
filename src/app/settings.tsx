import { useEffect, useState } from 'react';
import { Alert, Linking, Platform, ScrollView, Text } from 'react-native';

import { DateField } from '@/components/DateField';
import { Button, Card, SectionTitle, SwitchRow, colors, styles } from '@/components/ui';
import { notificationsAllowed, sendTestNotification, setupNotifications } from '@/lib/notifications';
import { useStore } from '@/lib/store';

export default function SettingsScreen() {
  const { data, updateSettings } = useStore();
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

      <Text style={[styles.muted, { textAlign: 'center', marginTop: 16 }]}>
        Все данные хранятся только на этом телефоне.
      </Text>
    </ScrollView>
  );
}
