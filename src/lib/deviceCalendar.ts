import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Calendar from 'expo-calendar';
import { getPermissionsAsync as getContactsPermissions } from 'expo-contacts';
import { Platform } from 'react-native';

import {
  CALENDAR_YEARS,
  diffCalendar,
  eventSignature,
  planCalendarEvents,
  withoutDuplicates,
  type ContactBirthday,
  type OtherEvent,
  type PlannedEvent,
  type StoredEvent,
} from './calendarPlan';
import { getContactsSnapshot, refreshContacts } from './contactsCache';
import type { RawContact } from './contactsImport';
import { toISODate, todayISO } from './dates';
import { phoneKey } from './messengers';
import { accentById } from './theme';
import type { AppData, ISODate } from './types';

/**
 * Свой календарь «Друзья» в календаре телефона. Android хранит календари всех аккаунтов в общей системной базе
 * (Calendar Provider), её читают и Samsung Календарь, и Google Календарь. Приложение кладёт туда отдельный локальный
 * календарь — без аккаунта и синхронизации с облаком — и держит в нём дни рождения и важные даты друзей.
 * Каждая годовщина — отдельное событие на этот год и два следующих, с возрастом в названии; при запуске окно сдвигается.
 * Напоминаний у событий нет: о датах напоминает само приложение, иначе телефон напомнит дважды.
 * Чего телефон и так покажет (дни рождения из контактов, такие же события в других календарях), не добавляем.
 */
export const deviceCalendarAvailable = Platform.OS === 'android';

const STATE_KEY = 'friends-notes/calendar/v1';
const CALENDAR_NAME = 'friends-notes-birthdays';

interface State {
  calendarId: string;
  color: string;
  events: Record<string, StoredEvent>;
}

async function loadState(): Promise<State | null> {
  try {
    const raw = await AsyncStorage.getItem(STATE_KEY);
    return raw ? (JSON.parse(raw) as State) : null;
  } catch {
    return null;
  }
}

const saveState = (state: State | null) => (state ? AsyncStorage.setItem(STATE_KEY, JSON.stringify(state)) : AsyncStorage.removeItem(STATE_KEY));

export async function calendarPermissionGranted(): Promise<boolean> {
  if (!deviceCalendarAvailable) return false;
  return (await Calendar.getCalendarPermissions()).granted;
}

export async function requestCalendarPermission(): Promise<boolean> {
  if (!deviceCalendarAvailable) return false;
  return (await Calendar.requestCalendarPermissions()).granted;
}

/** Событие на весь день: Android ждёт полночь по UTC и часовой пояс UTC, иначе дата съедет на день. */
function eventDetails(e: PlannedEvent) {
  const [y, m, d] = e.date.split('-').map(Number);
  return {
    title: e.title,
    notes: e.notes,
    startDate: new Date(Date.UTC(y, m - 1, d)),
    endDate: new Date(Date.UTC(y, m - 1, d + 1)),
    allDay: true,
    timeZone: 'UTC',
    endTimeZone: 'UTC',
    availability: Calendar.Availability.FREE,
    recurrenceRule: null,
  };
}

/** Дата события из другого календаря: у событий на весь день — по UTC (так их хранит Android), у остальных — по местному времени. */
function eventDate(e: Calendar.ExpoCalendarEvent): ISODate | null {
  const start = e.startDate ? new Date(e.startDate) : null;
  if (!start || Number.isNaN(start.getTime())) return null;
  return e.allDay ? start.toISOString().slice(0, 10) : toISODate(start);
}

/** События всех видимых календарей телефона, кроме нашего: только название и дата, нигде не сохраняются. */
async function otherEvents(ownId: string, start: Date, end: Date): Promise<OtherEvent[]> {
  const calendars = (await Calendar.getCalendars()).filter((c) => c.id !== ownId && c.name !== CALENDAR_NAME && c.isVisible !== false);
  if (!calendars.length) return [];
  const events = await Calendar.listEvents(
    calendars.map((c) => c.id),
    start,
    end,
  );
  const out: OtherEvent[] = [];
  for (const e of events) {
    const date = eventDate(e);
    if (date && e.title) out.push({ title: e.title, date });
  }
  return out;
}

const contactBirthday = (c: RawContact): ContactBirthday | null =>
  c.birthday ? { name: c.fullName ?? '', phones: [...(c.phones ?? []).map((p) => p.number ?? ''), ...(c.normalizedPhones ?? [])], month: c.birthday.month, day: c.birthday.day } : null;

/** Дни рождения из телефонной книги — только если доступ к контактам уже дан: ради календаря его не спрашиваем. */
async function contactBirthdays(): Promise<ContactBirthday[]> {
  if (!(await getContactsPermissions()).granted) return [];
  let contacts = getContactsSnapshot()?.contacts;
  if (!contacts) {
    const res = await refreshContacts();
    contacts = res.status === 'granted' ? res.contacts : [];
  }
  return contacts.map(contactBirthday).filter((c): c is ContactBirthday => !!c);
}

/** Что уже есть в телефоне: читается раз за запуск и при возвращении в приложение, между ними — из памяти. */
let known: { others: OtherEvent[]; contacts: ContactBirthday[] } = { others: [], contacts: [] };

/** Календари «Друзья», оставшиеся от прошлой установки (данные приложения стёрли, а календарь остался), — удаляем, иначе всё задвоится. */
async function removeOrphans(keepId?: string) {
  const ours = (await Calendar.getCalendars()).filter((c) => c.name === CALENDAR_NAME && c.id !== keepId);
  for (const c of ours) await c.delete().catch(() => {});
}

let queue: Promise<void> = Promise.resolve();
/** Проверять, что события на месте (их могли удалить в самом календаре), — раз за запуск и при возвращении в приложение. */
let verified = false;

export function markCalendarStale() {
  verified = false;
}

/** Привести календарь телефона к данным приложения. Выключено — календарь удаляется целиком. Вызовы идут строго по очереди. */
export function syncDeviceCalendar(data: AppData): Promise<void> {
  if (!deviceCalendarAvailable) return Promise.resolve();
  queue = queue.then(() => run(data)).catch((e) => console.warn('Не удалось обновить календарь', e));
  return queue;
}

async function run(data: AppData) {
  const state = await loadState();
  if (!data.settings.calendarSync) {
    if (state) {
      await Calendar.ExpoCalendar.get(state.calendarId)
        .then((cal) => cal.delete())
        .catch(() => {});
      await saveState(null);
    }
    known = { others: [], contacts: [] };
    return;
  }
  if (!(await calendarPermissionGranted())) return;

  const color = accentById(data.settings.accentLight).light.accent;
  let calendar = state ? await Calendar.ExpoCalendar.get(state.calendarId).catch(() => null) : null;
  let events = calendar && state ? state.events : {};
  if (!calendar) {
    await removeOrphans().catch(() => {});
    calendar = await Calendar.createCalendar({
      title: 'Друзья — дни рождения',
      name: CALENDAR_NAME,
      color,
      source: { isLocalAccount: true, name: 'Друзья', type: 'LOCAL' },
      ownerAccount: 'Друзья',
      accessLevel: Calendar.CalendarAccessLevel.OWNER,
      isVisible: true,
      isSynced: true,
    });
  } else if (state && state.color !== color) {
    await calendar.update({ color }).catch(() => {});
  }

  const today = todayISO();
  const first = Number(today.slice(0, 4));
  // С запасом в день с обеих сторон: события на весь день лежат в UTC, а «сегодня» — по местному времени.
  const from = new Date(Date.UTC(first, 0, 0));
  const to = new Date(Date.UTC(first + CALENDAR_YEARS, 0, 2));

  if (!verified) {
    // События, которые удалили прямо в календаре, создаём заново: всё наше окно — этот год и два следующих.
    // А события, о которых приложение не знает (сбой посреди прошлой синхронизации), удаляем, чтобы не было двойных.
    const present = await calendar.listEvents(from, to).catch(() => null);
    if (present) {
      const ids = new Set(present.map((e) => String(e.id)));
      events = Object.fromEntries(Object.entries(events).filter(([, s]) => ids.has(s.id)));
      const tracked = new Set(Object.values(events).map((s) => s.id));
      for (const e of present) if (!tracked.has(String(e.id))) await e.delete().catch(() => {});
    }
    // Что телефон уже показывает сам. Не получилось прочитать — считаем, что ничего: лишнее событие лучше пропавшего.
    const [others, contacts] = await Promise.all([otherEvents(calendar.id, from, to).catch(() => []), contactBirthdays().catch(() => [])]);
    known = { others, contacts };
    verified = true;
  }

  const planned = withoutDuplicates(planCalendarEvents(data, today), data, known.others, known.contacts, phoneKey);
  const diff = diffCalendar(planned, events);
  const next: Record<string, StoredEvent> = { ...diff.keep };
  for (const id of [...diff.remove, ...diff.replace.map((r) => r.id)]) {
    await Calendar.ExpoCalendarEvent.get(id)
      .then((ev) => ev.delete())
      .catch(() => {});
  }
  for (const e of [...diff.create, ...diff.replace.map((r) => r.event)]) {
    const created = await calendar.createEvent(eventDetails(e));
    next[e.key] = { id: String(created.id), sig: eventSignature(e) };
  }
  await saveState({ calendarId: calendar.id, color, events: next });
}
