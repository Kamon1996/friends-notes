import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Calendar from 'expo-calendar';
import { getPermissionsAsync as getContactsPermissions } from 'expo-contacts';
import { Platform } from 'react-native';

import type { ContactBirthday } from './calendarPlan';
import { CALENDAR_NAME, createCalendarSync, type CalendarPort, type CalendarState, type CalendarSummary, type PortCalendar } from './calendarSync';
import { getContactsSnapshot, refreshContacts } from './contactsCache';
import type { RawContact } from './contactsImport';
import { todayISO } from './dates';
import { phoneKey } from './messengers';
import { accentById } from './theme';
import type { AppData } from './types';

/**
 * Свой календарь «Друзья» в календаре телефона. Android хранит календари всех аккаунтов в общей системной базе
 * (Calendar Provider), её читают и Samsung Календарь, и Google Календарь. Приложение кладёт туда отдельный локальный
 * календарь — без аккаунта и синхронизации с облаком — и держит в нём дни рождения и важные даты друзей:
 * каждая годовщина — отдельное событие на прошлый, этот и два следующих года, с возрастом в названии.
 * Напоминаний у событий нет: о датах напоминает само приложение, иначе телефон напомнит дважды.
 * Чего телефон и так покажет (дни рождения из контактов, такие же события в других календарях), не добавляем.
 * Вся логика — в calendarSync.ts, здесь только доступ к календарю, хранилищу и контактам.
 */
export const deviceCalendarAvailable = Platform.OS === 'android';

const STATE_KEY = 'friends-notes/calendar/v1';

async function loadState(): Promise<CalendarState | null> {
  try {
    const raw = await AsyncStorage.getItem(STATE_KEY);
    return raw ? (JSON.parse(raw) as CalendarState) : null;
  } catch {
    return null;
  }
}

const saveState = (state: CalendarState | null) => (state ? AsyncStorage.setItem(STATE_KEY, JSON.stringify(state)) : AsyncStorage.removeItem(STATE_KEY));

export async function calendarPermissionGranted(): Promise<boolean> {
  if (!deviceCalendarAvailable) return false;
  return (await Calendar.getCalendarPermissions()).granted;
}

/** Запросить доступ. `canAskAgain: false` — система больше не покажет запрос, остаются только настройки телефона. */
export async function requestCalendarPermission(): Promise<{ granted: boolean; canAskAgain: boolean }> {
  if (!deviceCalendarAvailable) return { granted: false, canAskAgain: false };
  const res = await Calendar.requestCalendarPermissions();
  return { granted: res.granted, canAskAgain: res.canAskAgain };
}

/** Календари, полученные последним запросом: их события читаются без повторного поиска. */
const known = new Map<string, Calendar.ExpoCalendar>();
const remember = (c: Calendar.ExpoCalendar): PortCalendar => {
  known.set(c.id, c);
  return { id: c.id, name: c.name, isVisible: c.isVisible };
};
const calendarById = async (id: string) => known.get(id) ?? (await Calendar.ExpoCalendar.get(id));

const port: CalendarPort = {
  permission: calendarPermissionGranted,
  calendars: async () => (await Calendar.getCalendars()).map(remember),
  calendar: async (id) => remember(await Calendar.ExpoCalendar.get(id)),
  createCalendar: async (color) =>
    remember(
      await Calendar.createCalendar({
        title: 'Друзья — дни рождения',
        name: CALENDAR_NAME,
        color,
        source: { isLocalAccount: true, name: 'Друзья', type: 'LOCAL' },
        ownerAccount: 'Друзья',
        accessLevel: Calendar.CalendarAccessLevel.OWNER,
        isVisible: true,
        isSynced: true,
      }),
    ),
  deleteCalendar: async (id) => {
    await (await calendarById(id)).delete();
    known.delete(id);
  },
  setColor: async (id, color) => {
    await (await calendarById(id)).update({ color });
  },
  // Список событий одного календаря, а не общий: общий на Android для каждого повторения отдельно читает напоминания.
  events: async (id, from, to) =>
    (await (await calendarById(id)).listEvents(from, to)).map((e) => ({ id: String(e.id), title: e.title, notes: e.notes, startDate: e.startDate, allDay: e.allDay })),
  createEvent: async (id, fields) => String((await (await calendarById(id)).createEvent({ ...fields, availability: Calendar.Availability.FREE, recurrenceRule: null })).id),
  deleteEvent: async (id) => {
    await (await Calendar.ExpoCalendarEvent.get(id)).delete();
  },
};

const contactBirthday = (c: RawContact): ContactBirthday | null =>
  c.birthday ? { name: c.fullName ?? '', phones: [...(c.phones ?? []).map((p) => p.number ?? ''), ...(c.normalizedPhones ?? [])], month: c.birthday.month, day: c.birthday.day } : null;

/** Дни рождения из телефонной книги — только если доступ к контактам уже дан: ради календаря его не спрашиваем. */
async function contactBirthdays(read: boolean): Promise<ContactBirthday[]> {
  let contacts = getContactsSnapshot()?.contacts;
  if (!contacts) {
    if (!read || !(await getContactsPermissions()).granted) return [];
    const res = await refreshContacts();
    contacts = res.status === 'granted' ? res.contacts : [];
  }
  return contacts.map(contactBirthday).filter((c): c is ContactBirthday => !!c);
}

const listeners = new Set<(s: CalendarSummary | null) => void>();

const engine = createCalendarSync({
  port,
  load: loadState,
  save: saveState,
  contacts: contactBirthdays,
  phoneKey,
  today: todayISO,
  color: (data) => accentById(data.settings.accentLight).light.accent,
  onSummary: (s) => listeners.forEach((l) => l(s)),
});

/** Привести календарь телефона к данным приложения. Выключено — календарь удаляется целиком. */
export function syncDeviceCalendar(data: AppData): Promise<void> {
  if (!deviceCalendarAvailable) return Promise.resolve();
  return engine.sync(data);
}

/** Перед следующей синхронизацией проверить события (их могли удалить в самом календаре) и перечитать чужие календари. */
export function markCalendarStale() {
  engine.markStale();
}

/** Итог последней синхронизации для настроек. */
export async function calendarSummary(): Promise<CalendarSummary | null> {
  if (!deviceCalendarAvailable) return null;
  return (await loadState())?.summary ?? null;
}

export function subscribeCalendarSummary(fn: (s: CalendarSummary | null) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
