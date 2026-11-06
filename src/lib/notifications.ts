import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Linking, Platform } from 'react-native';

import { planNotifications, type PlannedNotification } from './events';
import type { AppData } from './types';

const CHANNEL_ID = 'reminders';
const supported = Platform.OS === 'ios' || Platform.OS === 'android';

/** Кнопки прямо в уведомлении: позвонить и написать в мессенджер. */
const CATEGORIES = {
  'friend-call-write': ['call', 'write'],
  'friend-call': ['call'],
  'friend-write': ['write'],
} as const;
const ACTION_TITLES = { call: 'Позвонить', write: 'Написать' } as const;

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
      importance: AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }
  for (const [id, actions] of Object.entries(CATEGORIES)) {
    await Notifications.setNotificationCategoryAsync(
      id,
      actions.map((a) => ({ identifier: a, buttonTitle: ACTION_TITLES[a], options: { opensAppToForeground: true } })),
    ).catch(() => {});
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

function categoryFor(n: PlannedNotification): string | undefined {
  if (n.callUrl && n.writeUrl) return 'friend-call-write';
  if (n.callUrl) return 'friend-call';
  if (n.writeUrl) return 'friend-write';
  return undefined;
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
          content: {
            title: n.title,
            body: n.body,
            data: { url: n.url, callUrl: n.callUrl, writeUrl: n.writeUrl },
            sound: true,
            categoryIdentifier: categoryFor(n),
          },
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

/**
 * Что делать по нажатию на уведомление или его кнопку.
 * Возвращает адрес экрана, который надо открыть, или null, если действие уже выполнено.
 */
export function handleNotificationResponse(response: Notifications.NotificationResponse): string | null {
  const data = (response.notification.request.content.data ?? {}) as Record<string, unknown>;
  const action = response.actionIdentifier;
  const link = action === 'call' ? data.callUrl : action === 'write' ? data.writeUrl : null;
  if (typeof link === 'string') {
    Linking.openURL(link).catch(() => {});
    return null;
  }
  return typeof data.url === 'string' ? data.url : null;
}

/** Тестовое уведомление через 5 секунд — проверить, что всё работает. */
export async function sendTestNotification(): Promise<boolean> {
  if (!(await setupNotifications())) return false;
  await Notifications.scheduleNotificationAsync({
    content: { title: 'Проверка связи', body: 'Уведомления работают. Так будут приходить напоминания.', sound: true },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5, channelId: CHANNEL_ID },
  });
  return true;
}
