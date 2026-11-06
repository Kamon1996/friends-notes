import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';

import type { TgAuthState, TgImportState } from '../../modules/telegram';
import { Telegram, startTelegram } from './telegramClient';

interface TelegramSession {
  auth: TgAuthState;
  imp: TgImportState;
  /** Вход идёт сейчас (ждём номер/код/пароль). */
  signingIn: boolean;
  /** Загрузка или выход в процессе. */
  working: boolean;
  /** Контакты загружены и ждут выбора. */
  resultReady: boolean;
  begin: () => Promise<void>;
  cancel: () => Promise<void>;
  /** Начать вход заново (например, сменить QR-код на номер — TDLib не умеет переключаться без перезапуска). */
  restart: () => Promise<void>;
  /** Забыть загруженные контакты (после выбора). */
  clearResult: () => Promise<void>;
}

const Ctx = createContext<TelegramSession | null>(null);

/** Для веб-превью: localStorage «friends-notes/tg-preview» = phone | qr | code | loading | done подменяет состояние, чтобы посмотреть шаги мастера без Android. */
function previewState(): { auth: TgAuthState; imp: TgImportState } | null {
  if (Platform.OS !== 'web') return null;
  const idle: TgImportState = { phase: 'idle' };
  switch (globalThis.localStorage?.getItem('friends-notes/tg-preview')) {
    case 'phone':
      return { auth: { state: 'waitPhoneNumber' }, imp: idle };
    case 'qr':
      return { auth: { state: 'waitOtherDeviceConfirmation', link: 'tg://login?token=preview' }, imp: idle };
    case 'code':
      return { auth: { state: 'waitCode', codeType: 'authenticationCodeTypeTelegramMessage' }, imp: idle };
    case 'loading':
      return { auth: { state: 'ready' }, imp: { phase: 'loading', done: 154, total: 248, requestsContacts: 1, requestsUsers: 248, requestsProfiles: 154, requestsPhotos: 112, requestsMessages: 0 } };
    case 'done':
      return { auth: { state: 'closed' }, imp: { phase: 'done', done: 248, total: 248, loggedOut: true, requestsContacts: 1, requestsUsers: 248, requestsProfiles: 248, requestsPhotos: 180, requestsMessages: 0 } };
    default:
      return null;
  }
}

const SIGN_IN_STATES = new Set(['starting', 'waitTdlibParameters', 'waitPhoneNumber', 'waitOtherDeviceConfirmation', 'waitCode', 'waitPassword']);

/**
 * Состояние импорта из Telegram для всего приложения: сама загрузка идёт в нативном модуле
 * (и в фоне), здесь — только отражение его состояния, чтобы экран импорта и плашка внизу
 * показывали прогресс на любой вкладке.
 */
export function TelegramSessionProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<TgAuthState>(() => Telegram?.getState() ?? { state: 'none' });
  const [imp, setImp] = useState<TgImportState>(() => Telegram?.getImportState() ?? { phase: 'idle' });

  const sync = useCallback(() => {
    if (!Telegram) return;
    setAuth(Telegram.getState());
    setImp(Telegram.getImportState());
  }, []);

  useEffect(() => {
    if (!Telegram) return;
    const a = Telegram.addListener('onAuthState', setAuth);
    const b = Telegram.addListener('onImport', setImp);
    // Пока приложение было свёрнуто, события могли не дойти — сверяемся при возврате.
    const c = AppState.addEventListener('change', (s) => s === 'active' && sync());
    const t = setTimeout(sync, 0);
    return () => {
      clearTimeout(t);
      a.remove();
      b.remove();
      c.remove();
    };
  }, [sync]);

  const begin = useCallback(async () => {
    setImp({ phase: 'idle' });
    setAuth(await startTelegram());
  }, []);

  const cancel = useCallback(async () => {
    await Telegram?.cancel();
    sync();
  }, [sync]);

  const restart = useCallback(async () => {
    if (!Telegram) return;
    await Telegram.cancel();
    // Ждём, пока TDLib закроется (состояние closed), иначе start() вернёт старую сессию.
    for (let i = 0; i < 25; i++) {
      const s = Telegram.getState().state;
      if (s === 'closed' || s === 'none') break;
      await new Promise((r) => setTimeout(r, 200));
    }
    setImp({ phase: 'idle' });
    setAuth(await startTelegram());
  }, []);

  const clearResult = useCallback(async () => {
    await Telegram?.clearImportResult();
    sync();
  }, [sync]);

  const value = useMemo<TelegramSession>(() => {
    const preview = previewState();
    const a = preview?.auth ?? auth;
    const i = preview?.imp ?? imp;
    return {
      auth: a,
      imp: i,
      signingIn: SIGN_IN_STATES.has(a.state) && i.phase === 'idle',
      working: i.phase === 'loading' || i.phase === 'finishing',
      resultReady: (i.phase === 'done' || i.phase === 'cancelled') && (i.done ?? 0) > 0,
      begin,
      cancel,
      restart,
      clearResult,
    };
  }, [auth, imp, begin, cancel, restart, clearResult]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTelegramSession(): TelegramSession {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTelegramSession вне TelegramSessionProvider');
  return v;
}
