import * as Notifications from 'expo-notifications';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { colors } from '@/components/ui';
import { setupNotifications } from '@/lib/notifications';
import { StoreProvider } from '@/lib/store';

/** Переход по нажатию на уведомление. */
function useNotificationNavigation() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const open = (response: Notifications.NotificationResponse | null) => {
      const url = response?.notification.request.content.data?.url;
      if (typeof url === 'string') router.push(url as never);
    };
    open(Notifications.getLastNotificationResponse());
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, []);
}

export default function RootLayout() {
  useNotificationNavigation();

  useEffect(() => {
    setupNotifications().catch(() => {});
  }, []);

  return (
    <StoreProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerShadowVisible: false,
          headerTintColor: colors.primary,
          headerTitleStyle: { color: colors.text },
          contentStyle: { backgroundColor: colors.bg },
          headerBackTitle: 'Назад',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="friend/[id]" options={{ title: '' }} />
        <Stack.Screen name="friend/edit" options={{ presentation: 'modal', title: 'Друг' }} />
        <Stack.Screen name="reminder/edit" options={{ presentation: 'modal', title: 'Напоминание' }} />
        <Stack.Screen name="settings" options={{ title: 'Настройки' }} />
        <Stack.Screen name="import" options={{ presentation: 'modal', title: 'Импорт контактов' }} />
        <Stack.Screen name="contacts-debug" options={{ title: 'Диагностика контактов' }} />
        <Stack.Screen name="sources" options={{ title: 'Данные из приложений' }} />
        <Stack.Screen name="telegram" options={{ presentation: 'modal', title: 'Импорт из Telegram' }} />
        <Stack.Screen name="diagnostics" options={{ title: 'Отчёт об ошибке' }} />
      </Stack>
    </StoreProvider>
  );
}
