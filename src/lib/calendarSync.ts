import {
  CALENDAR_SIGNATURE,
  calendarYears,
  diffCalendar,
  eventSignature,
  planCalendarEvents,
  splitDuplicates,
  type ContactBirthday,
  type OtherEvent,
  type PlannedEvent,
  type StoredEvent,
} from './calendarPlan';
import { plural, toISODate } from './dates';
import type { AppData, ISODate } from './types';

/**
 * Синхронизация своего календаря «Друзья» с данными приложения. Здесь только логика; доступ к календарю телефона,
 * хранилищу и контактам приходит снаружи (см. deviceCalendar.ts), поэтому всё это проверяется тестами без телефона.
 */

/** Календарь телефона, как его видит приложение. */
export interface PortCalendar {
  id: string;
  name?: string | null;
  /** Показывается ли календарь в приложениях календаря. Скрытый Android не отдаёт в списке событий. */
  isVisible?: boolean;
}

/** Событие календаря телефона. На Android в списке приходит каждое повторение, id у них — id самого события. */
export interface PortEvent {
  id: string;
  title?: string | null;
  notes?: string | null;
  /** ISO-строка в UTC. */
  startDate?: string | Date | null;
  allDay?: boolean | null;
}

/** Что записать в новое событие. */
export interface EventFields {
  title: string;
  notes: string;
  startDate: Date;
  endDate: Date;
  allDay: true;
  timeZone: 'UTC';
  endTimeZone: 'UTC';
}

export interface CalendarPort {
  permission(): Promise<boolean>;
  calendars(): Promise<PortCalendar[]>;
  calendar(id: string): Promise<PortCalendar | null>;
  createCalendar(color: string): Promise<PortCalendar>;
  deleteCalendar(id: string): Promise<void>;
  setColor(id: string, color: string): Promise<void>;
  /** События календаря, пересекающие [from, to). */
  events(calendarId: string, from: Date, to: Date): Promise<PortEvent[]>;
  createEvent(calendarId: string, fields: EventFields): Promise<string>;
  deleteEvent(id: string): Promise<void>;
}

/** Итог последней синхронизации — его показывают настройки. */
export interface CalendarSummary {
  /** Событий в календаре «Друзья». */
  events: number;
  /** Событий-дней рождения, которые уже есть в контактах. */
  fromContacts: number;
  /** Событий, которые уже есть в других календарях. */
  fromOthers: number;
  /** Календарь «Друзья» скрыт в приложении календаря. */
  hidden: boolean;
}

export interface CalendarState {
  calendarId: string;
  color: string;
  events: Record<string, StoredEvent>;
  summary?: CalendarSummary;
}

export interface CalendarSyncDeps {
  port: CalendarPort;
  load(): Promise<CalendarState | null>;
  save(state: CalendarState | null): Promise<void>;
  /** Дни рождения из контактов. `read` — можно ли ради этого прочитать телефонную книгу (раз за запуск). */
  contacts(read: boolean): Promise<ContactBirthday[]>;
  phoneKey(phone: string): string;
  today(): ISODate;
  color(data: AppData): string;
  onSummary?(summary: CalendarSummary | null): void;
}

/** Внутреннее имя нашего календаря: по нему находятся и календари, оставшиеся от прошлой установки. */
export const CALENDAR_NAME = 'friends-notes-birthdays';

/** Событие на весь день: Android ждёт полночь по UTC и часовой пояс UTC, иначе дата съедет на день. */
export function eventFields(e: PlannedEvent): EventFields {
  const [y, m, d] = e.date.split('-').map(Number);
  return {
    title: e.title,
    notes: e.notes,
    startDate: new Date(Date.UTC(y, m - 1, d)),
    endDate: new Date(Date.UTC(y, m - 1, d + 1)),
    allDay: true,
    timeZone: 'UTC',
    endTimeZone: 'UTC',
  };
}

/** Дата события из другого календаря: у событий на весь день — по UTC (так их хранит Android), у остальных — по местному времени. */
export function eventDate(e: Pick<PortEvent, 'startDate' | 'allDay'>): ISODate | null {
  const start = e.startDate ? new Date(e.startDate) : null;
  if (!start || Number.isNaN(start.getTime())) return null;
  return e.allDay ? start.toISOString().slice(0, 10) : toISODate(start);
}

/** Окно, в котором лежат наши события, — с запасом в день с обеих сторон: «сегодня» считается по местному времени. */
export function calendarRange(today: ISODate): { from: Date; to: Date } {
  const years = calendarYears(today);
  return { from: new Date(Date.UTC(years[0], 0, 0)), to: new Date(Date.UTC(years[years.length - 1] + 1, 0, 2)) };
}

const isOurs = (e: PortEvent) => !!e.notes?.includes(CALENDAR_SIGNATURE);

export function createCalendarSync(deps: CalendarSyncDeps) {
  const { port } = deps;
  let queue: Promise<void> = Promise.resolve();
  /** Проверять, что события на месте, и перечитывать чужие календари — раз за запуск и при возвращении в приложение. */
  let verified = false;
  /** Что телефон уже показывает сам; между проверками — из памяти. */
  let others: OtherEvent[] = [];

  async function otherEvents(ownId: string, from: Date, to: Date): Promise<OtherEvent[]> {
    const calendars = (await port.calendars()).filter((c) => c.id !== ownId && c.name !== CALENDAR_NAME && c.isVisible !== false);
    const out: OtherEvent[] = [];
    for (const c of calendars) {
      // Один сломанный календарь (например, аккаунт без доступа) не мешает остальным.
      const events = await port.events(c.id, from, to).catch(() => [] as PortEvent[]);
      for (const e of events) {
        const date = eventDate(e);
        if (date && e.title) out.push({ title: e.title, date });
      }
    }
    return out;
  }

  /** Календари «Друзья», оставшиеся от прошлой установки (данные приложения стёрли, а календарь остался), — иначе всё задвоится. */
  async function removeOrphans() {
    for (const c of await port.calendars()) if (c.name === CALENDAR_NAME) await port.deleteCalendar(c.id).catch(() => {});
  }

  /**
   * Наш календарь по сохранённому номеру — или ничего. Номер календаря — это номер строки в базе телефона: после
   * восстановления данных на другом телефоне (резервная копия Android) под ним может оказаться Google-календарь
   * пользователя. Его нельзя ни заполнять, ни перекрашивать, ни удалять — поэтому сверяем внутреннее имя.
   */
  async function ownCalendar(id: string): Promise<PortCalendar | null> {
    const found = await port.calendar(id).catch(() => null);
    return found?.name === CALENDAR_NAME ? found : null;
  }

  async function run(data: AppData) {
    const state = await deps.load();
    if (!data.settings.calendarSync) {
      if (state) {
        // Удаляем только свой календарь: после восстановления на другом телефоне под этим номером может быть чужой.
        const own = await ownCalendar(state.calendarId);
        if (own) await port.deleteCalendar(own.id).catch(() => {});
        await deps.save(null);
        deps.onSummary?.(null);
      }
      others = [];
      return;
    }
    if (!(await port.permission())) return;

    const color = deps.color(data);
    let calendar = state ? await ownCalendar(state.calendarId) : null;
    let events = calendar && state ? state.events : {};
    if (!calendar) {
      await removeOrphans().catch(() => {});
      calendar = await port.createCalendar(color);
      // Новый календарь: чужие календари и контакты читаем заново, даже если уже читали за этот запуск.
      verified = false;
    } else if (state && state.color !== color) {
      await port.setColor(calendar.id, color).catch(() => {});
    }

    const today = deps.today();
    const { from, to } = calendarRange(today);
    const hidden = calendar.isVisible === false;
    const fresh = !verified;

    if (fresh) {
      // Скрытый календарь Android в списке событий не отдаёт: тогда верим сохранённому, иначе всё задвоится.
      const present = hidden ? null : await port.events(calendar.id, from, to).catch(() => null);
      if (present) {
        // Удалённые прямо в календаре события создадим заново.
        const ids = new Set(present.map((e) => e.id));
        events = Object.fromEntries(Object.entries(events).filter(([, s]) => ids.has(s.id)));
        // Свои события, о которых приложение не знает (сбой посреди прошлой синхронизации), удаляем.
        // Добавленные вручную в этот календарь — без нашей подписи — не трогаем.
        const tracked = new Set(Object.values(events).map((s) => s.id));
        const strays = new Set(present.filter((e) => isOurs(e) && !tracked.has(e.id)).map((e) => e.id));
        for (const id of strays) await port.deleteEvent(id).catch(() => {});
      }
      // Не получилось прочитать — считаем, что ничего нет: лишнее событие лучше пропавшего.
      others = await otherEvents(calendar.id, from, to).catch(() => []);
      verified = true;
    }

    const contacts = await deps.contacts(fresh).catch(() => [] as ContactBirthday[]);
    const split = splitDuplicates(planCalendarEvents(data, today), data, others, contacts, deps.phoneKey);
    const diff = diffCalendar(split.keep, events);
    const next: Record<string, StoredEvent> = { ...diff.keep };
    for (const id of [...diff.remove, ...diff.replace.map((r) => r.id)]) await port.deleteEvent(id).catch(() => {});
    try {
      for (const e of [...diff.create, ...diff.replace.map((r) => r.event)]) {
        const id = await port.createEvent(calendar.id, eventFields(e));
        next[e.key] = { id, sig: eventSignature(e) };
      }
    } finally {
      // Даже если запись оборвалась, сохраняем то, что успели: при следующем запуске досоздадим остальное без дублей.
      const summary: CalendarSummary = {
        events: Object.keys(next).length,
        fromContacts: split.fromContacts.length,
        fromOthers: split.fromOthers.length,
        hidden,
      };
      await deps.save({ calendarId: calendar.id, color, events: next, summary });
      deps.onSummary?.(summary);
    }
  }

  return {
    /** Привести календарь к данным приложения. Выключено — календарь удаляется целиком. Вызовы идут строго по очереди. */
    sync(data: AppData): Promise<void> {
      queue = queue.then(() => run(data)).catch((e) => console.warn('Не удалось обновить календарь', e));
      return queue;
    },
    /** Перед следующей синхронизацией проверить события и перечитать чужие календари. */
    markStale() {
      verified = false;
    },
  };
}

/** Строка состояния под переключателем в настройках: заголовок и короткое пояснение. */
export interface CalendarStatus {
  title: string;
  sub?: string;
  tone: 'muted' | 'warn' | 'danger';
  icon: 'check' | 'refresh' | 'warning';
  /** Футер «Разрешить доступ». */
  needsAccess?: boolean;
}

export function calendarStatus(on: boolean, access: boolean | null, summary: CalendarSummary | null): CalendarStatus | null {
  if (!on) return null;
  if (access === false) return { title: 'Нет доступа', sub: 'Даты не обновляются', tone: 'danger', icon: 'warning', needsAccess: true };
  if (!summary) return { title: 'Заполняю календарь…', tone: 'muted', icon: 'refresh' };
  if (summary.hidden) return { title: 'Календарь скрыт', sub: 'Включи «Друзья» в Samsung Календаре', tone: 'warn', icon: 'warning' };
  if (!summary.events && !summary.fromContacts && !summary.fromOthers) return { title: 'Пока пусто', sub: 'Нет дней рождения и важных дат', tone: 'muted', icon: 'check' };
  const skipped = summary.fromContacts + summary.fromOthers;
  return {
    title: `${summary.events} ${plural(summary.events, 'событие', 'события', 'событий')}`,
    sub: skipped ? `${skipped} уже ${plural(skipped, 'было', 'были', 'были')} в телефоне — не повторяем` : undefined,
    tone: 'muted',
    icon: 'check',
  };
}
