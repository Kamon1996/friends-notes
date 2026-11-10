import { addInterval, combine, daysBetween, formatDayShort, formatRepeat, toISODate, toTime } from './dates';
import { byName, favoritesFirst } from './friendList';
import { kindOf } from './habits';
import type { Friend, ISODate, Reminder, TimeOfDay } from './types';

/** «9:00» вместо «09:00» — в лентах и подписях формы. */
export function shortTime(t: TimeOfDay): string {
  return t.replace(/^0/, '');
}

/** День словами для подписи: «сегодня», «завтра», иначе «ср, 11 июн». */
export function dayWord(date: ISODate, today: ISODate): string {
  const diff = daysBetween(today, date);
  return diff === 0 ? 'сегодня' : diff === 1 ? 'завтра' : diff === -1 ? 'вчера' : formatDayShort(date, today);
}

/** Когда придут уведомления — одной фразой под карточкой «Когда». */
export function whenSummary(r: Pick<Reminder, 'date' | 'time' | 'advance' | 'daily' | 'repeat' | 'kind'>, today: ISODate): string {
  const kind = kindOf(r);
  const time = shortTime(r.time);
  const day = (d: ISODate) => dayWord(d, today);
  if (kind === 'repeat') {
    const every = formatRepeat(r.repeat);
    return `${every[0].toUpperCase()}${every.slice(1)} в ${time}. Ближайший раз — ${day(r.date)}.`;
  }
  if (kind === 'at') return `Напомню ${day(addInterval(r.date, 'day', -1))} и ${day(r.date)} в ${time}.`;
  if (r.daily) return `Напомню каждый день в ${time} до ${formatDayShort(r.date, today)} — пока не отметишь «Сделано».`;
  if (!r.advance) return `Напомню ${day(r.date)} в ${time}.`;
  const early = new Date(combine(r.date, r.time).getTime() - r.advance * 60_000);
  const earlyDay = toISODate(early);
  return earlyDay === r.date ? `Напомню ${day(r.date)} в ${shortTime(toTime(early))} и в ${time}.` : `Напомню ${day(earlyDay)} и ${day(r.date)} в ${time}.`;
}

/**
 * Кого показать кружками в «Для кого»: выбранный, потом те, для кого дела заводили недавно, потом избранные и
 * остальные по алфавиту. Не больше `limit` — остальных находят поиском.
 */
export function friendChoices(friends: readonly Friend[], reminders: readonly Reminder[], selectedId: string | null, limit = 6): Friend[] {
  const recent = [...reminders].filter((r) => r.friendId).sort((a, b) => b.createdAt - a.createdAt).map((r) => r.friendId as string);
  const rank = new Map<string, number>();
  if (selectedId) rank.set(selectedId, -1);
  recent.forEach((id, i) => {
    if (!rank.has(id)) rank.set(id, i);
  });
  const rest = favoritesFirst(byName);
  return [...friends]
    .sort((a, b) => {
      const ra = rank.get(a.id);
      const rb = rank.get(b.id);
      if (ra !== undefined || rb !== undefined) return (ra ?? Infinity) - (rb ?? Infinity);
      return rest(a, b);
    })
    .slice(0, limit);
}
