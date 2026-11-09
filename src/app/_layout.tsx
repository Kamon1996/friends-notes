import { GolosText_400Regular, GolosText_500Medium, GolosText_600SemiBold, GolosText_700Bold } from '@expo-google-fonts/golos-text';
import { Lora_500Medium, Lora_600SemiBold, Lora_700Bold, useFonts } from '@expo-google-fonts/lora';
import * as Notifications from 'expo-notifications';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, View, useColorScheme } from 'react-native';

import { WhatsNewSheet } from '@/components/WhatsNewSheet';
import { startCrashReports, stopCrashReports } from '@/lib/crashReports';
import { handleNotificationResponse, setupNotifications } from '@/lib/notifications';
import { StoreProvider, useStore } from '@/lib/store';
import { TelegramSessionProvider } from '@/lib/telegramSession';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { warmContacts } from '@/lib/contactsCache';

import { ThemeProvider, useTheme } from '@/lib/themeContext';

/** Уже обработанные нажатия: последнее нажатие (с которого открылось приложение) отдаётся снова при каждой подписке. */
const handledResponses = new Set<string>();

/**
 * Нажатие на уведомление или на его кнопку: переход на экран, «Позвонить», «Написать», «Сделано». Ждёт загрузки
 * данных — иначе «Сделано» при холодном старте отметило бы напоминание в ещё пустом списке.
 */
function NotificationResponses() {
  const { ready, setRemindersDone } = useStore();
  useEffect(() => {
    if (Platform.OS === 'web' || !ready) return;
    const handle = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const key = `${response.notification.request.identifier}:${response.actionIdentifier}`;
      if (handledResponses.has(key)) return;
      handledResponses.add(key);
      const what = handleNotificationResponse(response);
      if (!what) return;
      if ('done' in what) {
        setRemindersDone([what.done], true);
        router.navigate('/');
      } else router.push(what.open as never);
    };
    handle(Notifications.getLastNotificationResponse());
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    return () => sub.remove();
  }, [ready, setRemindersDone]);
  return null;
}

/** Отчёты о сбоях включаются, как только известны настройки, и выключаются переключателем. */
function CrashReportsGate() {
  const { ready, data } = useStore();
  const enabled = ready && data.settings.crashReports;
  useEffect(() => {
    if (!ready) return;
    if (enabled) startCrashReports();
    else stopCrashReports();
  }, [ready, enabled]);
  return null;
}

function AppShell() {
  const { colors, fonts, scheme } = useTheme();
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerShadowVisible: false,
          headerTintColor: colors.accent,
          headerTitleStyle: { color: colors.text, fontFamily: fonts.display, fontSize: 18 },
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="reminders" options={{ headerShown: false, animation: 'none' }} />
        <Stack.Screen name="friend/[id]" options={{ title: '' }} />
        <Stack.Screen name="friend/edit" options={{ presentation: 'modal', title: 'Друг' }} />
        <Stack.Screen name="reminder/edit" options={{ presentation: 'modal', title: 'Напоминание' }} />
        <Stack.Screen name="settings" options={{ title: 'Настройки' }} />
        <Stack.Screen name="appearance" options={{ title: 'Оформление' }} />
        <Stack.Screen name="import" options={{ presentation: 'modal', title: 'Импорт контактов' }} />
        <Stack.Screen name="telegram" options={{ presentation: 'modal', title: 'Импорт из Telegram' }} />
        <Stack.Screen name="diagnostics" options={{ title: 'Сообщить о проблеме' }} />
        <Stack.Screen name="whats-new" options={{ title: 'Что нового' }} />
        <Stack.Screen name="+not-found" options={{ title: 'Не нашлось' }} />
      </Stack>
      <WhatsNewSheet />
      <CrashReportsGate />
      <NotificationResponses />
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Lora_500Medium,
    Lora_600SemiBold,
    Lora_700Bold,
    GolosText_400Regular,
    GolosText_500Medium,
    GolosText_600SemiBold,
    GolosText_700Bold,
  });
  const system = useColorScheme();

  useEffect(() => {
    setupNotifications().catch(() => {});
    warmContacts();
  }, []);

  // Пока шрифты грузятся — пустой экран цвета бумаги, чтобы текст не «прыгал» между гарнитурами.
  // Если шрифты не загрузились (например, в веб-превью без сети) — показываем приложение системным шрифтом.
  if (!fontsLoaded && !fontError) return <View style={{ flex: 1, backgroundColor: system === 'dark' ? '#17130F' : '#F7F3EE' }} />;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StoreProvider>
        <ThemeProvider>
          <TelegramSessionProvider>
            <AppShell />
          </TelegramSessionProvider>
        </ThemeProvider>
      </StoreProvider>
    </GestureHandlerRootView>
  );
}
