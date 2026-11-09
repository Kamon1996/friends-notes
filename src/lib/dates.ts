import type { ISODate, Repeat, RepeatUnit, TimeOfDay } from './types';

export const MONTHS_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];
const WEEKDAYS_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const WEEKDAYS = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];

const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISODate(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(): ISODate {
  return toISODate(new Date());
}

export function parseTime(t: TimeOfDay): { hour: number; minute: number } {
  const [hour, minute] = t.split(':').map(Number);
  return { hour: hour || 0, minute: minute || 0 };
}

export function toTime(d: Date): TimeOfDay {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function combine(date: ISODate, time: TimeOfDay): Date {
  const d = parseISODate(date);
  const { hour, minute } = parseTime(time);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

/** Дата с тем же днём/месяцем в указанном году (29 февраля → 28 февраля в невисокосный год). */
export function sameDayInYear(date: ISODate, year: number): ISODate {
  const d = parseISODate(date);
  const day = Math.min(d.getDate(), daysInMonth(year, d.getMonth()));
  return toISODate(new Date(year, d.getMonth(), day));
}

/** Ближайшая годовщина начиная с `from` (включительно). */
export function nextAnniversary(date: ISODate, from: ISODate = todayISO()): ISODate {
  const year = parseISODate(from).getFullYear();
  const thisYear = sameDayInYear(date, year);
  return thisYear >= from ? thisYear : sameDayInYear(date, year + 1);
}

/**
 * Прибавить `n` периодов к исходной дате. Месяцы/годы считаются от исходной даты,
 * чтобы 31-е число не «съезжало» (31 янв + 1 мес = 28/29 фев, + 2 мес = 31 мар).
 */
export function addInterval(date: ISODate, unit: RepeatUnit, n: number): ISODate {
  const d = parseISODate(date);
  switch (unit) {
    case 'day':
      return toISODate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
    case 'week':
      return toISODate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7 * n));
    case 'month':
    case 'year': {
      const months = unit === 'month' ? n : 12 * n;
      const total = d.getMonth() + months;
      const year = d.getFullYear() + Math.floor(total / 12);
      const month = ((total % 12) + 12) % 12;
      const day = Math.min(d.getDate(), daysInMonth(year, month));
      return toISODate(new Date(year, month, day));
    }
  }
}

/** Последовательность срабатываний повторяющегося напоминания, начиная с `start`. */
export function* occurrences(start: ISODate, repeat: Repeat): Generator<ISODate> {
  const every = Math.max(1, Math.floor(repeat.every));
  for (let i = 0; ; i++) {
    yield addInterval(start, repeat.unit, every * i);
  }
}

/** Первое срабатывание строго позже `after` (дата+время). */
export function nextOccurrenceAfter(
  start: ISODate,
  time: TimeOfDay,
  repeat: Repeat,
  after: Date,
): ISODate {
  for (const d of occurrences(start, repeat)) {
    if (combine(d, time) > after) return d;
  }
  return start; // недостижимо
}

/** Разница в календарных днях: b - a. */
export function daysBetween(a: ISODate, b: ISODate): number {
  const ms = parseISODate(b).getTime() - parseISODate(a).getTime();
  return Math.round(ms / 86_400_000);
}

/**
 * Сколько полных лет исполнилось к дате `on`. Годовщина считается по `sameDayInYear`, поэтому у родившихся
 * 29 февраля в невисокосный год новый возраст наступает 28 февраля — в тот же день, когда приложение их поздравляет.
 */
export function ageOn(birthday: ISODate, on: ISODate): number {
  const year = parseISODate(on).getFullYear();
  const age = year - parseISODate(birthday).getFullYear();
  return on < sameDayInYear(birthday, year) ? age - 1 : age;
}

export function formatDate(date: ISODate, withYear = true): string {
  const d = parseISODate(date);
  const base = `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
  return withYear ? `${base} ${d.getFullYear()}` : base;
}

export function formatDateShort(date: ISODate): string {
  const d = parseISODate(date);
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()].slice(0, 3)}, ${WEEKDAYS_SHORT[d.getDay()]}`;
}

/**
 * «вт, 9 ноя» — для правого края строк. Год добавляется, если дата в другом году и уже прошла
 * или ещё далеко (больше полугода): «ср, 1 янв 2020» не спутать с ближайшим 1 января.
 */
export function formatDayShort(date: ISODate, today: ISODate = todayISO()): string {
  const d = parseISODate(date);
  const base = `${WEEKDAYS_SHORT[d.getDay()]}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()].slice(0, 3)}`;
  const otherYear = date.slice(0, 4) !== today.slice(0, 4);
  const diff = daysBetween(today, date);
  return otherYear && (diff < 0 || diff > 183) ? `${base} ${d.getFullYear()}` : base;
}

/** «12 апр 1997» / «12 апр» — компактная дата для плотных строк. */
export function formatDateCompact(date: ISODate, withYear = true): string {
  const d = parseISODate(date);
  const base = `${d.getDate()} ${MONTHS_GEN[d.getMonth()].slice(0, 3)}`;
  return withYear ? `${base} ${d.getFullYear()}` : base;
}

/** «Пятница, 6 ноября» — подпись под заголовком экрана. */
export function formatDateLong(date: ISODate): string {
  const d = parseISODate(date);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
}

export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function relativeDay(date: ISODate, today: ISODate = todayISO()): string {
  const diff = daysBetween(today, date);
  if (diff === 0) return 'сегодня';
  if (diff === 1) return 'завтра';
  if (diff === -1) return 'вчера';
  if (diff > 1) return `через ${diff} ${plural(diff, 'день', 'дня', 'дней')}`;
  const n = -diff;
  return `${n} ${plural(n, 'день', 'дня', 'дней')} назад`;
}

const UNIT_FORMS: Record<RepeatUnit, [string, string, string]> = {
  day: ['день', 'дня', 'дней'],
  week: ['неделю', 'недели', 'недель'],
  month: ['месяц', 'месяца', 'месяцев'],
  year: ['год', 'года', 'лет'],
};

export function formatRepeat(repeat: Repeat | null): string {
  if (!repeat) return 'однократно';
  const { every, unit } = repeat;
  const forms = UNIT_FORMS[unit];
  if (every === 1) {
    const word = unit === 'week' ? 'каждую' : unit === 'day' || unit === 'month' || unit === 'year' ? 'каждый' : 'каждые';
    return `${word} ${forms[0]}`;
  }
  return `каждые ${every} ${plural(every, forms[0], forms[1], forms[2])}`;
}

/** Год-заглушка для дат, у которых год неизвестен (високосный, чтобы влезло 29 февраля). */
export const UNKNOWN_YEAR = 1904;

export function hasYear(date: ISODate): boolean {
  return parseISODate(date).getFullYear() !== UNKNOWN_YEAR;
}
