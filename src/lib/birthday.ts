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

/** Какой бывает дата: день рождения — только в прошлом; важная дата может быть и впереди (свадьба через год). */
export interface DateRules {
  /** Год может быть из будущего. */
  future?: boolean;
  /** Без года дата не имеет смысла (разовая, не «каждый год»). */
  yearRequired?: boolean;
}

/** На сколько лет вперёд можно назначить важную дату. */
const FUTURE_YEARS = 100;
const maxYear = (rules?: DateRules) => new Date().getFullYear() + (rules?.future ? FUTURE_YEARS : 0);

/** Что из набранного уже неверно: 32-е число, 13-й месяц, год из будущего, 31 февраля, 29 февраля не в високосный год. */
export function partsErrors(p: DateParts, rules?: DateRules): { day: boolean; month: boolean; year: boolean } {
  const d = Number(p.day);
  const m = Number(p.month);
  const y = Number(p.year);
  const day = p.day.length > 0 && !(d >= 1 && d <= 31);
  const month = p.month.length > 0 && !(m >= 1 && m <= 12);
  const year = p.year.length === 4 && !(y >= 1900 && y <= maxYear(rules));
  // День и месяц по отдельности верны, но вместе такой даты нет (31.02). Год набран — сверяем с ним: 29.02.2001 не бывает.
  // Без года — по високосному, чтобы 29 февраля можно было записать.
  const base = p.year.length === 4 && !year ? y : 2000;
  const combo = !day && !month && p.day.length > 0 && p.month.length > 0 && new Date(base, m - 1, d).getMonth() !== m - 1;
  return { day: day || combo, month, year };
}

/**
 * Собирает дату из трёх полей. Пустой или недобранный год означает «год неизвестен».
 * Возвращает null, пока дата не набрана или набрана с ошибкой.
 */
export function composeDate(p: DateParts, rules?: DateRules): ISODate | null {
  if (p.day.length === 0 || p.month.length === 0) return null;
  const e = partsErrors(p, rules);
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
export function dateIssue(p: DateParts, required = false, rules?: DateRules): DateIssue | null {
  const filled = !!(p.day || p.month || p.year);
  if (!filled) return required ? { message: 'Укажи дату.', hard: false } : null;
  const e = partsErrors(p, rules);
  if (e.day || e.month) return { message: 'Такой даты нет — проверь число и месяц.', hard: true };
  if (e.year) return { message: `Проверь год: от 1900 до ${maxYear(rules)}.`, hard: true };
  if (!p.day || !p.month) return { message: 'Допиши число и месяц.', hard: false };
  if (p.year.length > 0 && p.year.length < 4) return { message: rules?.yearRequired ? 'Год — четыре цифры.' : 'Год — четыре цифры. Или оставь его пустым.', hard: false };
  // Разовая дата без года никогда не наступит: её не будет ни в календаре, ни в уведомлениях.
  if (rules?.yearRequired && !p.year) return { message: 'Дата не повторяется — укажи год.', hard: false };
  return null;
}
