import { advancesOf, advancesText } from './advances';
import { combine, daysBetween, firstOccurrenceFrom, formatDayShort, formatRepeat, repeatDays, snapToRepeat, toISODate, toTime } from './dates';
import { byName, favoritesFirst } from './friendList';
import { kindOf } from './habits';
import type { Friend, ISODate, Reminder, Repeat, TimeOfDay } from './types';

/** «9:00» вместо «09:00» — в лентах и подписях формы. */
export function shortTime(t: TimeOfDay): string {
  return t.replace(/^0/, '');
}

const sameRepeat = (a: Repeat | null, b: Repeat | null) =>
  a === b || (!!a && !!b && a.every === b.every && a.unit === b.unit && (repeatDays(a) ?? []).join() === (repeatDays(b) ?? []).join());

/** Дата и повтор дела в форме; `from` — день, выбранный началом серии, если он уже прошёл. */
export interface SeriesDraft {
  date: ISODate;
  repeat: Repeat | null;
  from: ISODate | null;
}

/**
 * Куда встаёт дело после правки даты или повтора в форме.
 *
 * Повторяющееся дело не начинается в прошлом. Человек выбирает день, с которого идёт серия («годовщина — 18 октября»);
 * если этот день уже прошёл, ближайший раз — первый раз серии не раньше сегодня, а выбранный день остаётся её началом
 * (`from`): от него считаются следующие разы, чтобы 31-е и 29 февраля не съезжали, и к нему возвращаемся, если
 * поменять повтор или сделать дело разовым. Раньше такой день сохранялся как есть, и новое дело сразу было
 * «просрочено».
 *
 * Исключение — готовое дело, у которого поменяли только повтор: его прошедший срок правда пропущен, дату не трогаем
 * (`keepOverdue`).
 */
export function settleSeries(prev: SeriesDraft, next: { date: ISODate; repeat: Repeat | null }, today: ISODate, keepOverdue = false): SeriesDraft {
  const picked = next.date !== prev.date;
  if (!picked && sameRepeat(next.repeat, prev.repeat)) return { ...next, from: prev.from };
  // Выбрали день — он и есть начало серии; поменяли только повтор — начало прежнее.
  const start = picked ? next.date : (prev.from ?? next.date);
  // Разовое дело стоит там, где его поставили, хоть в прошлом; начало серии помним — вдруг повтор вернут.
  if (!next.repeat) return { date: start, repeat: null, from: picked ? null : prev.from };
  const first = snapToRepeat(start, next.repeat);
  if (first >= today) return { date: first, repeat: next.repeat, from: start < today ? start : null };
  if (keepOverdue && !picked && prev.from === null) return { date: next.date, repeat: next.repeat, from: null };
  return { date: firstOccurrenceFrom(first, next.repeat, today), repeat: next.repeat, from: start };
}

/** День словами для подписи: «сегодня», «завтра», иначе «ср, 11 июн». */
export function dayWord(date: ISODate, today: ISODate): string {
  const diff = daysBetween(today, date);
  return diff === 0 ? 'сегодня' : diff === 1 ? 'завтра' : diff === -1 ? 'вчера' : formatDayShort(date, today);
}

const joinAnd = (list: string[], and = ' и ') => (list.length > 1 ? `${list.slice(0, -1).join(', ')}${and}${list[list.length - 1]}` : (list[0] ?? ''));

/** Когда придут уведомления — одной фразой под карточкой «Когда». */
export function whenSummary(r: Pick<Reminder, 'date' | 'time' | 'advance' | 'advances' | 'daily' | 'repeat' | 'kind'>, today: ISODate): string {
  const kind = kindOf(r);
  const time = shortTime(r.time);
  const day = (d: ISODate) => dayWord(d, today);
  const early = advancesOf(r);
  if (kind === 'repeat') {
    const every = formatRepeat(r.repeat);
    return `${every[0].toUpperCase()}${every.slice(1)} в ${time}${early.length ? `, заранее — ${advancesText(early)}` : ''}. Ближайший раз — ${day(r.date)}.`;
  }
  if (kind === 'due' && r.daily) {
    return `Напомню каждый день в ${time} до ${formatDayShort(r.date, today)} — пока не отметишь «Сделано».${early.length ? ` В день срока — ещё ${advancesText(early)}.` : ''}`;
  }
  // Все уведомления по дням: «чт, 12 ноя в 10:00, пт, 13 ноя в 9:00 и в 10:00».
  const at = combine(r.date, r.time);
  const byDay = new Map<ISODate, string[]>();
  for (const moment of [...early.map((m) => new Date(at.getTime() - m * 60_000)), at].sort((a, b) => a.getTime() - b.getTime())) {
    const d = toISODate(moment);
    byDay.set(d, [...(byDay.get(d) ?? []), shortTime(toTime(moment))]);
  }
  const groups = [...byDay];
  // Время везде одно — короче: «сегодня и завтра в 10:00».
  if (groups.every(([, times]) => times.length === 1 && times[0] === time)) return `Напомню ${joinAnd(groups.map(([d]) => day(d)))} в ${time}.`;
  return `Напомню ${groups.map(([d, times]) => `${day(d)} в ${joinAnd(times, ' и в ')}`).join(', ')}.`;
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
