import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { planNotifications } from './events';
import type { AppData } from './types';

const CHANNEL_ID = 'reminders';
const supported = Platform.OS === 'ios' || Platform.OS === 'android';

if (supported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function setupNotifications(): Promise<boolean> {
  if (!supported) return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Напоминания',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const res = await Notifications.requestPermissionsAsync();
  return res.granted;
}

export async function notificationsAllowed(): Promise<boolean> {
  if (!supported) return false;
  return (await Notifications.getPermissionsAsync()).granted;
}

let syncing: Promise<void> = Promise.resolve();

/** Полностью пересобирает расписание локальных уведомлений по текущим данным. */
export function syncNotifications(data: AppData): Promise<void> {
  if (!supported) return Promise.resolve();
  // Выполняем строго последовательно, чтобы параллельные синки не перемешались.
  syncing = syncing.then(async () => {
    try {
      if (!(await notificationsAllowed())) return;
      await Notifications.cancelAllScheduledNotificationsAsync();
      for (const n of planNotifications(data)) {
        await Notifications.scheduleNotificationAsync({
          content: { title: n.title, body: n.body, data: { url: n.url }, sound: true },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: n.at,
            channelId: CHANNEL_ID,
          },
        });
      }
    } catch (e) {
      console.warn('Не удалось запланировать уведомления', e);
    }
  });
  return syncing;
}

/** Тестовое уведомление через 5 секунд — проверить, что всё работает. */
export async function sendTestNotification(): Promise<boolean> {
  if (!(await setupNotifications())) return false;
  await Notifications.scheduleNotificationAsync({
    content: { title: '🔔 Проверка', body: 'Уведомления работают!', sound: true },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5, channelId: CHANNEL_ID },
  });
  return true;
}
