import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { APP_VERSION } from './changelog';

const dsn = (Constants.expoConfig?.extra as { sentry?: { dsn?: string } } | undefined)?.sentry?.dsn ?? '';

/** В сборке есть адрес Sentry (подставляется из секрета при сборке); в браузере и без адреса отчёты не отправляются. */
export const crashReportsAvailable = !!dsn && Platform.OS !== 'web';

let started = false;

/**
 * Включить автоматические отчёты о сбоях. Отправляется только техническое: стек ошибки, версия,
 * модель телефона. Без имён, номеров, заметок и логов Telegram; экранов и иерархии экрана тоже нет.
 */
export function startCrashReports(): void {
  if (!crashReportsAvailable || started) return;
  started = true;
  Sentry.init({
    dsn,
    environment: __DEV__ ? 'development' : 'production',
    sendDefaultPii: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    enableAutoPerformanceTracing: false,
    tracesSampleRate: 0,
    enableCaptureFailedRequests: false,
    maxBreadcrumbs: 30,
    // Консольные сообщения могут содержать данные людей — в отчёт не попадают.
    beforeBreadcrumb: (crumb) => (crumb.category === 'console' ? null : crumb),
    beforeSend: (event) => {
      delete event.user;
      delete event.request;
      return event;
    },
  });
  Sentry.setTag('app_version', APP_VERSION);
}

/** Выключить отправку: клиент закрывается, новые события не уходят. */
export async function stopCrashReports(): Promise<void> {
  if (!started) return;
  started = false;
  await Sentry.close().catch(() => {});
}

/** Номер последнего отправленного отчёта — чтобы приложить к сообщению разработчику. */
export function lastCrashId(): string | undefined {
  return started ? Sentry.lastEventId() : undefined;
}
