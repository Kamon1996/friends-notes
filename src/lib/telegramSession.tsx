import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

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
  /** Забыть загруженные контакты (после выбора). */
  clearResult: () => Promise<void>;
}

const Ctx = createContext<TelegramSession | null>(null);

const SIGN_IN_STATES = new Set(['starting', 'waitTdlibParameters', 'waitPhoneNumber', 'waitCode', 'waitPassword']);

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
    sync();
    return () => {
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

  const clearResult = useCallback(async () => {
    await Telegram?.clearImportResult();
    sync();
  }, [sync]);

  const value = useMemo<TelegramSession>(
    () => ({
      auth,
      imp,
      signingIn: SIGN_IN_STATES.has(auth.state) && imp.phase === 'idle',
      working: imp.phase === 'loading' || imp.phase === 'finishing',
      resultReady: (imp.phase === 'done' || imp.phase === 'cancelled') && (imp.done ?? 0) > 0,
      begin,
      cancel,
      clearResult,
    }),
    [auth, imp, begin, cancel, clearResult],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTelegramSession(): TelegramSession {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTelegramSession вне TelegramSessionProvider');
  return v;
}
