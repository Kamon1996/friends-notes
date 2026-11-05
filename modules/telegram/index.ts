import { requireOptionalNativeModule, type EventSubscription } from 'expo';

/** Состояние авторизации TDLib: waitPhoneNumber, waitCode, waitPassword, ready, loggingOut, closed… */
export interface TgAuthState {
  state: string;
  codeType?: string;
  phone?: string;
  passwordHint?: string;
  message?: string;
}

export interface TgUser {
  id: number;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  usernames: string[];
  isMutualContact: boolean;
}

export interface TgUserFullInfo {
  /** year = 0, если год скрыт. */
  birthdate: { day: number; month: number; year: number } | null;
  bio: string | null;
}

interface NativeTelegram {
  getState(): TgAuthState;
  start(apiId: number, apiHash: string, appVersion: string): Promise<TgAuthState>;
  setPhoneNumber(phone: string): Promise<null>;
  checkCode(code: string): Promise<null>;
  checkPassword(password: string): Promise<null>;
  getContactIds(): Promise<number[]>;
  getUser(userId: number): Promise<TgUser>;
  getUserFullInfo(userId: number): Promise<TgUserFullInfo>;
  logOut(): Promise<null>;
  destroy(): Promise<null>;
  addListener(event: 'onAuthState', listener: (s: TgAuthState) => void): EventSubscription;
}

/** Есть только в собранном Android-приложении с библиотекой TDLib. */
export const Telegram = requireOptionalNativeModule<NativeTelegram>('Telegram');
