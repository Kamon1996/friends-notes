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

export interface Settings {
  /** Во сколько присылать уведомления о днях рождения и важных датах. */
  eventTime: TimeOfDay;
  /** Напоминать за день до дня рождения / важной даты. */
  eventDayBefore: boolean;
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
};

export const EMPTY_DATA: AppData = {
  version: 1,
  friends: [],
  reminders: [],
  settings: DEFAULT_SETTINGS,
};
