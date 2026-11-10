import type { Reminder } from './types';

/** За сколько можно напомнить заранее — в минутах, от ближнего к дальнему. */
export const ADVANCE_OPTIONS = [60, 120, 1440, 4320, 10080] as const;
export const ADVANCE_LABELS: Record<number, string> = { 60: 'За час', 120: 'За 2 часа', 1440: 'За день', 4320: 'За 3 дня', 10080: 'За неделю' };

/** Допустимые значения без повторов, от ближнего к дальнему. */
export function cleanAdvances(list: readonly unknown[]): number[] {
  const allowed: readonly number[] = ADVANCE_OPTIONS;
  return [...new Set(list.filter((v): v is number => typeof v === 'number' && allowed.includes(v)))].sort((a, b) => a - b);
}

/**
 * За сколько минут до срока напомнить заранее — у любого дела, нового и старого.
 * Старые дела без списка: одно `advance` у дел «до срока», «за день» у встреч, ничего у повторяющихся.
 * У дел «каждый день до срока» дни закрывает ежедневное напоминание — остаётся только «за час» и «за 2 часа».
 */
export function advancesOf(r: Pick<Reminder, 'advance' | 'advances' | 'repeat' | 'kind' | 'daily'>): number[] {
  const list = Array.isArray(r.advances) ? cleanAdvances(r.advances) : r.repeat ? [] : r.kind === 'at' ? [1440] : r.advance > 0 ? [r.advance] : [];
  return r.daily && !r.repeat && r.kind !== 'at' ? list.filter((m) => m < 1440) : list;
}

/**
 * Как записать выбор «заранее» в дело. Простые случаи храним по-старому (одно `advance`, у встречи «за день» — без
 * поля): так читают и прежние версии, и старые копии. Список — только когда вариантов несколько или он необычный.
 */
export function storeAdvances(kind: 'due' | 'at' | 'repeat', picked: readonly number[], daily: boolean): Pick<Reminder, 'advance' | 'advances' | 'daily'> {
  const list = cleanAdvances(picked);
  if (kind === 'due' && daily) {
    const hours = list.filter((m) => m < 1440);
    return { advance: 0, daily: true, ...(hours.length ? { advances: hours } : {}) };
  }
  if (kind === 'at') return list.length === 1 && list[0] === 1440 ? { advance: 0 } : { advance: 0, advances: list };
  if (kind === 'due' && list.length === 1 && list[0] !== 120) return { advance: list[0] as Reminder['advance'] };
  return list.length ? { advance: 0, advances: list } : { advance: 0 };
}

/** «за день и за час» — для подписи в строке и в сводке. */
export function advancesText(list: readonly number[]): string {
  const words = [...list].sort((a, b) => b - a).map((m) => ADVANCE_LABELS[m]?.toLowerCase() ?? '');
  return words.length > 1 ? `${words.slice(0, -1).join(', ')} и ${words[words.length - 1]}` : (words[0] ?? '');
}
