import { UNKNOWN_YEAR } from './dates';
import type { ISODate, TimeOfDay } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

/** Цифры → «ДД.ММ.ГГГГ» (или «ДД.ММ» без года). Точки подставляются сами. */
export function maskDate(input: string, withYear = true): string {
  const d = input.replace(/\D/g, '').slice(0, withYear ? 8 : 4);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}.${d.slice(2)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4)}`;
}

/** Цифры → «ЧЧ:ММ». */
export function maskTime(input: string): string {
  const d = input.replace(/\D/g, '').slice(0, 4);
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)}:${d.slice(2)}`;
}

/** «31.12.2026» → '2026-12-31'; без года — год-заглушка. null, если дата неверная или неполная. */
export function parseRuDate(text: string, withYear = true): ISODate | null {
  const m = withYear ? /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text) : /^(\d{2})\.(\d{2})$/.exec(text);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = withYear ? Number(m[3]) : UNKNOWN_YEAR;
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1) return null;
  if (day > new Date(year, month, 0).getDate()) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** '2026-12-31' → «31.12.2026» (или «31.12»). */
export function formatRuDate(date: ISODate | null, withYear = true): string {
  if (!date) return '';
  const [y, m, d] = date.split('-');
  return withYear ? `${d}.${m}.${y}` : `${d}.${m}`;
}

/** «9:05» / «09:05» → '09:05'. null, если время неверное или неполное. */
export function parseTimeText(text: string): TimeOfDay | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${pad(h)}:${pad(min)}`;
}
