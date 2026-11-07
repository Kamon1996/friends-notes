import { UNKNOWN_YEAR, hasYear, parseISODate, toISODate } from './dates';
import type { ISODate } from './types';

/** Три поля даты: день, месяц и необязательный год — строками, как их набирает пользователь. */
export interface DateParts {
  day: string;
  month: string;
  year: string;
}

export const EMPTY_PARTS: DateParts = { day: '', month: '', year: '' };

const pad = (n: number) => String(n).padStart(2, '0');

export function splitDate(iso: ISODate | null): DateParts {
  if (!iso) return EMPTY_PARTS;
  const d = parseISODate(iso);
  return { day: pad(d.getDate()), month: pad(d.getMonth() + 1), year: hasYear(iso) ? String(d.getFullYear()) : '' };
}

/** Что из набранного уже неверно: 32-е число, 13-й месяц, год из будущего, 31 февраля. */
export function partsErrors(p: DateParts): { day: boolean; month: boolean; year: boolean } {
  const d = Number(p.day);
  const m = Number(p.month);
  const y = Number(p.year);
  const day = p.day.length > 0 && !(d >= 1 && d <= 31);
  const month = p.month.length > 0 && !(m >= 1 && m <= 12);
  const year = p.year.length === 4 && !(y >= 1900 && y <= new Date().getFullYear());
  // День и месяц по отдельности верны, но вместе такой даты нет (31.02).
  const combo = !day && !month && p.day.length > 0 && p.month.length > 0 && new Date(2000, m - 1, d).getMonth() !== m - 1;
  return { day: day || combo, month, year };
}

/**
 * Собирает дату из трёх полей. Пустой или недобранный год означает «год неизвестен».
 * Возвращает null, пока дата не набрана или набрана с ошибкой.
 */
export function composeDate(p: DateParts): ISODate | null {
  if (p.day.length === 0 || p.month.length === 0) return null;
  const e = partsErrors(p);
  if (e.day || e.month || e.year) return null;
  const year = p.year.length === 4 ? Number(p.year) : UNKNOWN_YEAR;
  return toISODate(new Date(year, Number(p.month) - 1, Number(p.day)));
}

/** Что не так с набранной датой. `hard` — ошибка видна сразу; иначе дата просто не дописана (показываем после «Сохранить»). */
export interface DateIssue {
  message: string;
  hard: boolean;
}

/**
 * Проблема с датой из трёх полей или null, если дату можно сохранить.
 * Пустая дата — не проблема, если поле необязательное.
 */
export function dateIssue(p: DateParts, required = false): DateIssue | null {
  const filled = !!(p.day || p.month || p.year);
  if (!filled) return required ? { message: 'Укажи дату.', hard: false } : null;
  const e = partsErrors(p);
  if (e.day || e.month) return { message: 'Такой даты нет — проверь число и месяц.', hard: true };
  if (e.year) return { message: `Проверь год: от 1900 до ${new Date().getFullYear()}.`, hard: true };
  if (!p.day || !p.month) return { message: 'Допиши число и месяц.', hard: false };
  if (p.year.length > 0 && p.year.length < 4) return { message: 'Год — четыре цифры. Или оставь его пустым.', hard: false };
  return null;
}
