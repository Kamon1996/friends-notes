import { accentById, type Scheme } from './theme';
import type { AccentId, ISODate, Settings } from './types';

/**
 * Знак зодиака по дню рождения (тропический зодиак, общепринятые границы). Год не нужен — знак зависит только
 * от числа и месяца, поэтому он есть и у дней рождения без года. 29 февраля — Рыбы.
 */
export type ZodiacId =
  | 'aries'
  | 'taurus'
  | 'gemini'
  | 'cancer'
  | 'leo'
  | 'virgo'
  | 'libra'
  | 'scorpio'
  | 'sagittarius'
  | 'capricorn'
  | 'aquarius'
  | 'pisces';

export type ZodiacElement = 'fire' | 'earth' | 'air' | 'water';

export interface ZodiacSign {
  id: ZodiacId;
  name: string;
  /** С какого числа знак начинается: [месяц 1–12, день]. */
  from: [number, number];
  /** По какое число включительно. */
  to: [number, number];
  element: ZodiacElement;
}

/** По порядку года, начиная с Козерога, который переходит через Новый год. */
export const ZODIAC: ZodiacSign[] = [
  { id: 'capricorn', name: 'Козерог', from: [12, 22], to: [1, 19], element: 'earth' },
  { id: 'aquarius', name: 'Водолей', from: [1, 20], to: [2, 18], element: 'air' },
  { id: 'pisces', name: 'Рыбы', from: [2, 19], to: [3, 20], element: 'water' },
  { id: 'aries', name: 'Овен', from: [3, 21], to: [4, 19], element: 'fire' },
  { id: 'taurus', name: 'Телец', from: [4, 20], to: [5, 20], element: 'earth' },
  { id: 'gemini', name: 'Близнецы', from: [5, 21], to: [6, 20], element: 'air' },
  { id: 'cancer', name: 'Рак', from: [6, 21], to: [7, 22], element: 'water' },
  { id: 'leo', name: 'Лев', from: [7, 23], to: [8, 22], element: 'fire' },
  { id: 'virgo', name: 'Дева', from: [8, 23], to: [9, 22], element: 'earth' },
  { id: 'libra', name: 'Весы', from: [9, 23], to: [10, 22], element: 'air' },
  { id: 'scorpio', name: 'Скорпион', from: [10, 23], to: [11, 21], element: 'water' },
  { id: 'sagittarius', name: 'Стрелец', from: [11, 22], to: [12, 21], element: 'fire' },
];

export const ELEMENT_NAME: Record<ZodiacElement, string> = { fire: 'огонь', earth: 'земля', air: 'воздух', water: 'вода' };

const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

/** Знак по дате YYYY-MM-DD (или MM-DD в конце строки). Непонятная дата — null. */
export function zodiacSign(date: ISODate | null | undefined): ZodiacSign | null {
  const m = /(\d{2})-(\d{2})$/.exec(date ?? '');
  if (!m) return null;
  const [month, day] = [Number(m[1]), Number(m[2])];
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const key = month * 100 + day;
  for (const sign of ZODIAC) {
    const from = sign.from[0] * 100 + sign.from[1];
    const to = sign.to[0] * 100 + sign.to[1];
    if (from <= to ? key >= from && key <= to : key >= from || key <= to) return sign;
  }
  return null;
}

/** «20 янв — 18 фев» */
export const zodiacRange = (s: ZodiacSign) => `${s.from[1]} ${MONTHS_SHORT[s.from[0] - 1]} — ${s.to[1]} ${MONTHS_SHORT[s.to[0] - 1]}`;

/**
 * Цвет стихии — один из акцентов приложения, чтобы чип выглядел своим в любой теме:
 * огонь — терракота, земля — эвкалипт, воздух — мёд, вода — индиго.
 */
export const ELEMENT_ACCENT: Record<ZodiacElement, AccentId> = { fire: 'terracotta', earth: 'eucalyptus', air: 'honey', water: 'indigo' };

/** Цвета чипа знака: значок, текст и фон — для светлой или тёмной темы. */
export function zodiacColors(element: ZodiacElement, scheme: Scheme): { icon: string; text: string; bg: string } {
  const a = accentById(ELEMENT_ACCENT[element])[scheme];
  return { icon: a.accent, text: a.accentText, bg: a.soft };
}

/** Показывать ли знаки: по умолчанию да, выключается в настройках. */
export const zodiacShown = (settings: Pick<Settings, 'showZodiac'>) => settings.showZodiac !== false;
