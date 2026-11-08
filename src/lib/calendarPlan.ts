import { ageOn, formatDate, hasYear, parseISODate, plural, sameDayInYear } from './dates';
import type { AppData, ISODate } from './types';

/** Дата для календаря: день рождения или важная дата друга. */
export interface CalendarItem {
  /** Стабильный ключ: по нему событие находится при следующей синхронизации и в файле .ics (UID). */
  key: string;
  /** «🎂 Аня Смирнова» или «♥ Свадьба · Аня Смирнова». */
  title: string;
  notes: string;
  /** Первая дата события. С известным годом — настоящая дата, без года — та же дата в BASE_YEAR. */
  date: ISODate;
  yearly: boolean;
  /** 29 февраля: в невисокосный год событие должно быть 28-го (как в самом приложении). */
  leapDay: boolean;
  /** Для дней рождения с известным годом — год рождения: из него считается возраст по годам. */
  birthYear?: number;
  name: string;
}

/** Событие в календаре телефона. */
export interface PlannedEvent {
  key: string;
  title: string;
  notes: string;
  date: ISODate;
  yearly: boolean;
}

const SIGNATURE = 'Из приложения «Друзья».';
/** Високосный год для дат без года: с него начинается повтор, и 29 февраля в нём существует. */
export const BASE_YEAR = 2000;
/** Сколько лет вперёд расписывать 29 февраля отдельными событиями (повтор «каждый год» его не умеет). */
export const LEAP_YEARS_AHEAD = 5;

const withBaseYear = (date: ISODate) => `${BASE_YEAR}-${date.slice(5)}`;
const yearsWord = (n: number) => `${n} ${plural(n, 'год', 'года', 'лет')}`;

/** Все даты друзей, которые стоит показать в календаре: дни рождения и важные даты с названием и числом. */
export function calendarItems(data: AppData): CalendarItem[] {
  const out: CalendarItem[] = [];
  for (const f of data.friends) {
    if (f.birthday) {
      const known = hasYear(f.birthday);
      out.push({
        key: `b-${f.id}`,
        title: `🎂 ${f.name}`,
        notes: known ? `Дата рождения: ${formatDate(f.birthday)}.\n${SIGNATURE}` : SIGNATURE,
        date: known ? f.birthday : withBaseYear(f.birthday),
        yearly: true,
        leapDay: f.birthday.slice(5) === '02-29',
        birthYear: known ? parseISODate(f.birthday).getFullYear() : undefined,
        name: f.name,
      });
    }
    for (const d of f.dates) {
      if (!d.date || !d.title.trim()) continue;
      const known = hasYear(d.date);
      out.push({
        key: `d-${d.id}`,
        title: `♥ ${d.title.trim()} · ${f.name}`,
        notes: d.yearly && known ? `С ${parseISODate(d.date).getFullYear()} года.\n${SIGNATURE}` : SIGNATURE,
        date: known || !d.yearly ? d.date : withBaseYear(d.date),
        yearly: d.yearly,
        leapDay: d.yearly && d.date.slice(5) === '02-29',
        name: f.name,
      });
    }
  }
  return out;
}

/**
 * События для календаря телефона. Обычные годовщины — одно событие с повтором «каждый год».
 * 29 февраля повтором не выразить (в невисокосный год его просто не будет), поэтому такие даты
 * расписываются отдельными событиями на несколько лет вперёд — с возрастом в названии; синхронизация их продлевает.
 */
export function planCalendarEvents(data: AppData, today: ISODate): PlannedEvent[] {
  const year = parseISODate(today).getFullYear();
  const out: PlannedEvent[] = [];
  for (const item of calendarItems(data)) {
    if (!item.leapDay) {
      out.push({ key: item.key, title: item.title, notes: item.notes, date: item.date, yearly: item.yearly });
      continue;
    }
    for (let y = year; y < year + LEAP_YEARS_AHEAD; y++) {
      const date = sameDayInYear(item.date, y);
      const age = item.birthYear ? ageOn(`${item.birthYear}${item.date.slice(4)}`, date) : null;
      out.push({ key: `${item.key}-${y}`, title: age && age > 0 ? `${item.title} · ${yearsWord(age)}` : item.title, notes: item.notes, date, yearly: false });
    }
  }
  return out;
}

/** Что сохранено о событии в календаре: его id и «подпись» содержимого, чтобы заметить изменения. */
export interface StoredEvent {
  id: string;
  sig: string;
}

export const eventSignature = (e: PlannedEvent) => JSON.stringify([e.title, e.notes, e.date, e.yearly]);

/**
 * Что сделать с календарём, чтобы он совпал с приложением: создать новые события, пересоздать изменённые,
 * удалить лишние. Неизменённые остаются как есть.
 */
export function diffCalendar(planned: PlannedEvent[], stored: Record<string, StoredEvent>) {
  const create: PlannedEvent[] = [];
  const replace: { id: string; event: PlannedEvent }[] = [];
  const keep: Record<string, StoredEvent> = {};
  const wanted = new Set<string>();
  for (const e of planned) {
    wanted.add(e.key);
    const old = stored[e.key];
    if (!old) create.push(e);
    else if (old.sig !== eventSignature(e)) replace.push({ id: old.id, event: e });
    else keep[e.key] = old;
  }
  const remove = Object.entries(stored)
    .filter(([key]) => !wanted.has(key))
    .map(([, s]) => s.id);
  return { create, replace, remove, keep };
}
