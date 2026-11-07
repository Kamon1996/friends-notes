import { GolosText_400Regular, GolosText_500Medium, GolosText_600SemiBold, GolosText_700Bold } from '@expo-google-fonts/golos-text';
import { Lora_500Medium, Lora_600SemiBold, Lora_700Bold, useFonts } from '@expo-google-fonts/lora';
import * as Notifications from 'expo-notifications';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, View, useColorScheme } from 'react-native';

import { TelegramBanner } from '@/components/TelegramBanner';
import { handleNotificationResponse, setupNotifications } from '@/lib/notifications';
import { StoreProvider } from '@/lib/store';
import { TelegramSessionProvider } from '@/lib/telegramSession';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { warmContacts } from '@/lib/contactsCache';

import { ThemeProvider, useTheme } from '@/lib/themeContext';

/** Переход по нажатию на уведомление или на его кнопку («Позвонить», «Написать»). */
function useNotificationNavigation() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const open = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const url = handleNotificationResponse(response);
      if (url) router.push(url as never);
    };
    open(Notifications.getLastNotificationResponse());
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, []);
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
        <Stack.Screen name="friend/[id]" options={{ title: '' }} />
        <Stack.Screen name="friend/edit" options={{ presentation: 'modal', title: 'Друг' }} />
        <Stack.Screen name="reminder/edit" options={{ presentation: 'modal', title: 'Напоминание' }} />
        <Stack.Screen name="settings" options={{ title: 'Настройки' }} />
        <Stack.Screen name="import" options={{ presentation: 'modal', title: 'Импорт контактов' }} />
        <Stack.Screen name="telegram" options={{ presentation: 'modal', title: 'Импорт из Telegram' }} />
        <Stack.Screen name="diagnostics" options={{ title: 'Отчёт об ошибке' }} />
      </Stack>
      <TelegramBanner />
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
  useNotificationNavigation();

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
