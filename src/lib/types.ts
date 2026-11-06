/** Дата без времени в формате YYYY-MM-DD (локальная). */
export type ISODate = string;
/** Время в формате HH:MM. */
export type TimeOfDay = string;

export interface ImportantDate {
  id: string;
  title: string;
  date: ISODate;
  /** Повторять каждый год (годовщина) или это разовое событие. */
  yearly: boolean;
}

export interface Friend {
  id: string;
  name: string;
  emoji: string;
  birthday: ISODate | null;
  phone: string;
  food: string;
  flowers: string;
  gifts: string;
  notes: string;
  dates: ImportantDate[];
  createdAt: number;
  /** ID пользователя Telegram — для кнопки «Написать в Telegram». */
  telegramId?: number | null;
  /** Номер WhatsApp (цифры в международном формате). */
  whatsapp?: string | null;
  /** Номер Viber (цифры в международном формате). */
  viber?: string | null;
  /** Фото для карточки (большое): из контактов телефона (content://…) или аватарка Telegram (file://…). */
  photoUri?: string | null;
  /** Маленькая версия фото для списков. */
  thumbUri?: string | null;
  /** Избранный — выше остальных в списке друзей и в окне выбора. */
  favorite?: boolean;
}

export type RepeatUnit = 'day' | 'week' | 'month' | 'year';

export interface Repeat {
  every: number;
  unit: RepeatUnit;
}

/** За сколько минут предупредить заранее (для разовых напоминаний и дедлайнов). */
export type Advance = 0 | 60 | 1440 | 4320 | 10080;

export interface Reminder {
  id: string;
  title: string;
  note: string;
  /** null — личное напоминание, не привязанное к другу. */
  friendId: string | null;
  /** Для разовых — дата/дедлайн. Для повторяющихся — дата ближайшего срабатывания. */
  date: ISODate;
  time: TimeOfDay;
  repeat: Repeat | null;
  advance: Advance;
  done: boolean;
  createdAt: number;
}

export type ThemeMode = 'system' | 'light' | 'dark';
export type AccentId = 'terracotta' | 'honey' | 'eucalyptus' | 'plum' | 'indigo' | 'raspberry';

export interface Settings {
  /** Во сколько присылать уведомления о днях рождения и важных датах. */
  eventTime: TimeOfDay;
  /** Напоминать за день до дня рождения / важной даты. */
  eventDayBefore: boolean;
  /** Тема: как в системе, светлая или тёмная. */
  theme: ThemeMode;
  /** Акцентный цвет светлой темы. */
  accentLight: AccentId;
  /** Акцентный цвет тёмной темы — может отличаться от светлой. */
  accentDark: AccentId;
}

export interface AppData {
  version: 1;
  friends: Friend[];
  reminders: Reminder[];
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = {
  eventTime: '10:00',
  eventDayBefore: true,
  theme: 'system',
  accentLight: 'terracotta',
  accentDark: 'terracotta',
};

export const EMPTY_DATA: AppData = {
  version: 1,
  friends: [],
  reminders: [],
  settings: DEFAULT_SETTINGS,
};
