import raw from '@/data/holidays.json';

import { MONTHS_GEN, parseISODate, plural } from './dates';
import type { ISODate, Settings } from './types';

/**
 * Праздники стран — для вкладки «Календарь». База лежит в приложении (src/data/holidays.json, собирает
 * scripts/holidays/build.py): даты официальных праздников — из открытой библиотеки python-holidays, названия
 * и описания — из Википедии со ссылкой на статью. Ничего не скачивается, всё работает без сети.
 */
export interface HolidayCountry {
  code: string;
  name: string;
  flag: string;
}

export interface HolidayInfo {
  /** Как называем по-русски. */
  name: string;
  /** Английское название из базы — запасное. */
  en: string;
  /** Начало статьи Википедии; пусто — описания нет. */
  text: string;
  /** Статья в Википедии. */
  url: string | null;
}

/** Праздник в конкретный день. */
export interface Holiday {
  id: string;
  date: ISODate;
  country: string;
  /** Дата ориентировочная: исламский календарь на будущие годы считают заранее, точную объявляют ближе к делу. */
  estimated: boolean;
}

interface HolidayData {
  source: string;
  years: [number, number];
  countries: HolidayCountry[];
  holidays: Record<string, Record<string, string[]>>;
  info: Record<string, HolidayInfo>;
}

const DATA = raw as unknown as HolidayData;

export const HOLIDAY_COUNTRIES: readonly HolidayCountry[] = DATA.countries;
/** Годы, на которые есть даты. */
export const HOLIDAY_YEARS: readonly [number, number] = DATA.years;
export const HOLIDAY_SOURCE = DATA.source;

const COUNTRY = new Map(HOLIDAY_COUNTRIES.map((c) => [c.code, c]));

export function holidayCountry(code: string): HolidayCountry | undefined {
  return COUNTRY.get(code);
}

export function holidayInfo(id: string): HolidayInfo | undefined {
  return DATA.info[id];
}

/** Страна телефона по языку системы («ru-RU» → RU), если она есть в базе. */
export function deviceHolidayCountry(locale?: string): string | null {
  let tag = locale;
  if (tag === undefined) {
    try {
      tag = Intl.DateTimeFormat().resolvedOptions().locale;
    } catch {
      return null;
    }
  }
  const region = tag
    ?.split(/[-_]/)
    .slice(1)
    .find((p) => /^[A-Za-z]{2}$/.test(p))
    ?.toUpperCase();
  return region && COUNTRY.has(region) ? region : null;
}

/** Чьи праздники показывать — в порядке списка стран; незнакомые коды отбрасываем. Не выбрано — ничьи. */
export function holidayCountries(settings?: Pick<Settings, 'holidayCountries'>): string[] {
  const chosen = settings?.holidayCountries;
  if (!Array.isArray(chosen) || chosen.length === 0) return [];
  const set = new Set(chosen);
  return HOLIDAY_COUNTRIES.filter((c) => set.has(c.code)).map((c) => c.code);
}

/** Что выбрать сразу, пока человек сам не выбирал: страну телефона, если она есть в базе. */
export function defaultHolidayCountries(locale?: string): string[] {
  const own = deviceHolidayCountry(locale);
  return own ? [own] : [];
}

/** Все дни праздников страны по порядку — один раз на страну. */
const byCountry = new Map<string, Holiday[]>();
function countryDays(code: string): Holiday[] {
  let list = byCountry.get(code);
  if (!list) {
    list = [];
    for (const [id, dates] of Object.entries(DATA.holidays[code] ?? {})) {
      for (const d of dates) {
        const estimated = d.startsWith('~');
        list.push({ id, date: estimated ? d.slice(1) : d, country: code, estimated });
      }
    }
    list.sort((a, b) => a.date.localeCompare(b.date));
    byCountry.set(code, list);
  }
  return list;
}

/** Праздники выбранных стран с `from` по `to` включительно — по дате, в один день — в порядке стран. */
export function holidaysIn(countries: readonly string[], from: ISODate, to: ISODate): Holiday[] {
  const out: Holiday[] = [];
  for (const code of countries) {
    for (const h of countryDays(code)) {
      if (h.date > to) break;
      if (h.date >= from) out.push(h);
    }
  }
  const order = new Map(countries.map((c, i) => [c, i]));
  return out.sort((a, b) => a.date.localeCompare(b.date) || order.get(a.country)! - order.get(b.country)!);
}

/** Как назвать праздник в списке: русское название, если нет — английское. */
export function holidayName(id: string): string {
  const info = DATA.info[id];
  return info?.name || info?.en || id;
}

/** Сколько разных праздников у страны в году (по первому году базы). */
export function holidayCountryCount(code: string): number {
  const year = String(HOLIDAY_YEARS[0]);
  return new Set(countryDays(code).filter((h) => h.date.startsWith(year)).map((h) => h.id)).size;
}

/** Дни праздника в году — у многодневных их несколько (новогодние каникулы, Курбан-байрам). */
export function holidayDatesInYear(id: string, year: number): ISODate[] {
  const code = id.split(':')[0];
  return countryDays(code)
    .filter((h) => h.id === id && h.date.startsWith(`${year}-`))
    .map((h) => h.date);
}

/**
 * Страны праздника для подписи: до трёх — все («🇷🇺 Россия, 🇧🇾 Беларусь»), больше — первые две и «и ещё 22 страны»:
 * «Новый год» отмечают почти все, и список на десять строк в строке события ни к чему.
 */
export function formatCountries(list: readonly { flag: string; name: string }[], max = 2): string {
  const all = list.map((c) => `${c.flag} ${c.name}`);
  if (all.length <= max + 1) return all.join(', ');
  const rest = all.length - max;
  return `${all.slice(0, max).join(', ')} и ещё ${rest} ${plural(rest, 'страна', 'страны', 'стран')}`;
}

/** Дни коротко: «1–6 и 8 января», «31 декабря, 1–2 января»; `short` — с месяцем в три буквы («1–6 и 8 янв»), для правого края строк. */
export function formatHolidayDays(dates: readonly ISODate[], short = false): string {
  const months: { month: number; days: number[] }[] = [];
  for (const iso of [...dates].sort()) {
    const d = parseISODate(iso);
    const last = months[months.length - 1];
    if (last && last.month === d.getMonth()) last.days.push(d.getDate());
    else months.push({ month: d.getMonth(), days: [d.getDate()] });
  }
  return months
    .map(({ month, days }) => {
      const parts: string[] = [];
      for (let i = 0; i < days.length; ) {
        let j = i;
        while (j + 1 < days.length && days[j + 1] === days[j] + 1) j++;
        parts.push(j > i ? `${days[i]}–${days[j]}` : `${days[i]}`);
        i = j + 1;
      }
      const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} и ${parts[parts.length - 1]}` : parts[0];
      return `${list} ${short ? MONTHS_GEN[month].slice(0, 3) : MONTHS_GEN[month]}`;
    })
    .join(', ');
}
