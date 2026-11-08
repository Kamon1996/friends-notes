import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';

import { diffCalendar, eventSignature, planCalendarEvents, type PlannedEvent, type StoredEvent } from './calendarPlan';
import { addInterval, todayISO } from './dates';
import { accentById } from './theme';
import type { AppData } from './types';

/**
 * Свой календарь «Друзья» в календаре телефона. Android хранит календари всех аккаунтов в общей системной базе
 * (Calendar Provider), её читают и Samsung Календарь, и Google Календарь. Приложение кладёт туда отдельный локальный
 * календарь — без аккаунта и синхронизации с облаком — и держит в нём дни рождения и важные даты друзей.
 * Напоминаний у событий нет: о датах напоминает само приложение, иначе телефон напомнит дважды.
 */
export const deviceCalendarAvailable = Platform.OS === 'android';

const STATE_KEY = 'friends-notes/calendar/v1';

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
    recurrenceRule: e.yearly ? { frequency: Calendar.Frequency.YEARLY } : null,
  };
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
    return;
  }
  if (!(await calendarPermissionGranted())) return;

  const color = accentById(data.settings.accentLight).light.accent;
  let calendar = state ? await Calendar.ExpoCalendar.get(state.calendarId).catch(() => null) : null;
  let events = calendar && state ? state.events : {};
  if (!calendar) {
    calendar = await Calendar.createCalendar({
      title: 'Друзья — дни рождения',
      name: 'friends-notes-birthdays',
      color,
      source: { isLocalAccount: true, name: 'Друзья', type: 'LOCAL' },
      ownerAccount: 'Друзья',
      accessLevel: Calendar.CalendarAccessLevel.OWNER,
      isVisible: true,
      isSynced: true,
    });
    verified = true;
  } else if (state && state.color !== color) {
    await calendar.update({ color }).catch(() => {});
  }

  const today = todayISO();
  const planned = planCalendarEvents(data, today);

  if (!verified) {
    // События, которые удалили прямо в календаре, создаём заново: смотрим ближайший год, где есть каждое ежегодное событие.
    const end = addInterval(today, 'day', 366);
    const present = new Set(
      (await calendar.listEvents(new Date(`${addInterval(today, 'day', -1)}T00:00:00Z`), new Date(`${end}T00:00:00Z`)).catch(() => null))?.map((e) => String(e.id)) ?? [],
    );
    if (present.size || Object.keys(events).length) {
      const byKey = new Map(planned.map((e) => [e.key, e]));
      events = Object.fromEntries(
        Object.entries(events).filter(([key, s]) => {
          const e = byKey.get(key);
          const shouldBeVisible = e && (e.yearly || (e.date >= today && e.date <= end));
          return !shouldBeVisible || present.has(s.id);
        }),
      );
    }
    verified = true;
  }

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
