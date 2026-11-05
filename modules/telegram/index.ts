import { requireOptionalNativeModule, type EventSubscription } from 'expo';

/** Состояние авторизации TDLib: waitPhoneNumber, waitCode, waitPassword, ready, loggingOut, closed… */
export interface TgAuthState {
  state: string;
  codeType?: string;
  phone?: string;
  passwordHint?: string;
  message?: string;
}

/** Контакт Telegram, загруженный модулем. */
export interface TgPerson {
  id: number;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  usernames: string[];
  /** year = 0, если год скрыт. */
  birthdate: { day: number; month: number; year: number } | null;
  bio: string | null;
  /** Текущая аватарка 640×640 (file://…) во временной папке; null — фото нет или скрыто. */
  photoUri: string | null;
  /** Та же аватарка 160×160 — для списков. */
  thumbUri: string | null;
}

/** Состояние фоновой загрузки контактов. */
export interface TgImportState {
  phase: 'idle' | 'loading' | 'finishing' | 'done' | 'error' | 'cancelled';
  done?: number;
  total?: number;
  partial?: boolean;
  loggedOut?: boolean;
  error?: string;
  waitingSeconds?: number;
  requestsContacts?: number;
  requestsUsers?: number;
  requestsProfiles?: number;
  requestsPhotos?: number;
  /** Всегда 0: функций чтения сообщений в модуле нет. */
  requestsMessages?: number;
}

interface NativeTelegram {
  getState(): TgAuthState;
  getImportState(): TgImportState;
  start(apiId: number, apiHash: string, appVersion: string): Promise<TgAuthState>;
  setPhoneNumber(phone: string): Promise<boolean>;
  checkCode(code: string): Promise<boolean>;
  checkPassword(password: string): Promise<boolean>;
  getImportResult(): Promise<TgPerson[]>;
  clearImportResult(): Promise<boolean>;
  /** Оставить аватарки выбранных людей (по id Telegram) и стереть остальное. */
  finalizeImport(keepIds: number[]): Promise<Record<string, { photoUri?: string; thumbUri?: string }>>;
  /** Отменить вход или загрузку: модуль выйдет из аккаунта / сотрёт незавершённый вход. */
  cancel(): Promise<boolean>;
  /** Последний записанный Java-сбой и хвост лога TDLib. */
  getDiagnostics(): Promise<{ lastCrash: string; tdlibLog: string }>;
  clearDiagnostics(): Promise<boolean>;
  addListener(event: 'onAuthState', listener: (s: TgAuthState) => void): EventSubscription;
  addListener(event: 'onImport', listener: (s: TgImportState) => void): EventSubscription;
}

/** Есть только в собранном Android-приложении с библиотекой TDLib. */
export const Telegram = requireOptionalNativeModule<NativeTelegram>('Telegram');
