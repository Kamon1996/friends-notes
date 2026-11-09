import { inCalendar, smartCalendarOn } from './calendarAi';
import { addInterval, ageOn, hasYear, occurrences, parseISODate, sameDayInYear, toISODate } from './dates';
import { seriesStart } from './events';
import { holidayCountries, holidayName, holidaysIn, type Holiday } from './holidays';
import type { AppData, Friend, ISODate, Reminder, Settings } from './types';

/**
 * Событие в календаре: день рождения, важная дата друга (годовщина, знакомство…) или дело-событие: стоматолог в 15:00,
 * тренировка по вторникам (какие дела — события, решает «Умный календарь», src/lib/calendarAi.ts), праздник выбранных
 * стран (src/lib/holidays.ts; один праздник нескольких стран в один день — одно событие). Дела «до срока» и обычные
 * дела — только в «Напоминаниях».
 */
export type CalendarEvent =
  | { kind: 'birthday'; key: string; date: ISODate; friend: Friend; age: number | null }
  | { kind: 'date'; key: string; date: ISODate; friend: Friend; title: string; years: number | null }
  | { kind: 'meeting'; key: string; date: ISODate; reminder: Reminder; friend: Friend | null }
  | { kind: 'holiday'; key: string; date: ISODate; name: string; holidays: Holiday[] };

export const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
/** «в ноябре» — для подписи. */
export const MONTHS_IN = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];
export const WEEKDAYS_MON = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/** Сетка месяца — шесть недель с понедельника: 42 даты, по краям — дни соседних месяцев. */
export function monthGrid(year: number, month: number): ISODate[] {
  const first = new Date(year, month, 1);
  const shift = (first.getDay() + 6) % 7; // понедельник — 0
  return Array.from({ length: 42 }, (_, i) => toISODate(new Date(year, month, 1 - shift + i)));
}

/** Первый и последний день месяца. */
export function monthRange(year: number, month: number): [ISODate, ISODate] {
  return [toISODate(new Date(year, month, 1)), toISODate(new Date(year, month + 1, 0))];
}

// Праздник — про весь день, поэтому сверху.
const ORDER: Record<CalendarEvent['kind'], number> = { holiday: -1, birthday: 0, date: 1, meeting: 2 };

/** Ежегодное в диапазоне: по разу в каждом году, не раньше самой даты (если год известен). */
function yearly(date: ISODate, from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let y = parseISODate(from).getFullYear(); y <= parseISODate(to).getFullYear(); y++) {
    const d = sameDayInYear(date, y);
    if (d >= from && d <= to && (!hasYear(date) || d >= date)) out.push(d);
  }
  return out;
}

/** События с `from` по `to` включительно — по дате; в один день: дни рождения, важные даты, встречи по времени. */
export function calendarEvents(data: Pick<AppData, 'friends' | 'reminders'> & { settings?: Settings }, from: ISODate, to: ISODate): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  const byId = new Map(data.friends.map((f) => [f.id, f]));
  for (const friend of data.friends) {
    if (friend.birthday) {
      for (const date of yearly(friend.birthday, from, to)) {
        const age = hasYear(friend.birthday) ? ageOn(friend.birthday, date) : null;
        out.push({ kind: 'birthday', key: `b-${friend.id}-${date}`, date, friend, age: age && age > 0 ? age : null });
      }
    }
    for (const d of friend.dates) {
      const dates = d.yearly ? yearly(d.date, from, to) : d.date >= from && d.date <= to ? [d.date] : [];
      for (const date of dates) {
        const years = d.yearly && hasYear(d.date) ? parseISODate(date).getFullYear() - parseISODate(d.date).getFullYear() : 0;
        out.push({ kind: 'date', key: `d-${d.id}-${date}`, date, friend, title: d.title, years: years > 0 ? years : null });
      }
    }
  }
  const smart = smartCalendarOn(data.settings);
  for (const r of data.reminders) {
    if (!inCalendar(r, smart)) continue;
    const friend = r.friendId ? (byId.get(r.friendId) ?? null) : null;
    if (!r.repeat) {
      if (r.date >= from && r.date <= to) out.push({ kind: 'meeting', key: `m-${r.id}`, date: r.date, reminder: r, friend });
      continue;
    }
    // Повторяющееся событие (тренировка по вторникам) — каждый раз в диапазоне.
    for (const date of occurrences(seriesStart(r), r.repeat)) {
      if (date > to) break;
      if (date >= from) out.push({ kind: 'meeting', key: `m-${r.id}-${date}`, date, reminder: r, friend });
    }
  }
  const merged = new Map<string, Extract<CalendarEvent, { kind: 'holiday' }>>();
  for (const h of holidaysIn(holidayCountries(data.settings), from, to)) {
    const name = holidayName(h.id);
    const same = merged.get(`${h.date}|${name}`);
    if (same) same.holidays.push(h);
    else merged.set(`${h.date}|${name}`, { kind: 'holiday', key: `h-${h.id}-${h.date}`, date: h.date, name, holidays: [h] });
  }
  out.push(...merged.values());
  const time = (e: CalendarEvent) => (e.kind === 'meeting' ? e.reminder.time : '');
  const name = (e: CalendarEvent) => (e.kind === 'meeting' ? e.reminder.title : e.kind === 'holiday' ? '' : e.friend.name);
  return out.sort((a, b) => a.date.localeCompare(b.date) || ORDER[a.kind] - ORDER[b.kind] || time(a).localeCompare(time(b)) || name(a).localeCompare(name(b), 'ru'));
}

/**
 * Ближайшие события после `after` (не включая его) — не дальше двух месяцев: «через 365 дней» никому не нужно.
 * Праздник на несколько дней (новогодние каникулы) — один раз, первым днём.
 */
export function nextEvents(data: Pick<AppData, 'friends' | 'reminders'> & { settings?: Settings }, after: ISODate, limit = 5): CalendarEvent[] {
  const seen = new Set<string>();
  return calendarEvents(data, addInterval(after, 'day', 1), addInterval(after, 'month', 2))
    .filter((e) => {
      if (e.kind !== 'holiday') return true;
      // Один и тот же праздник (те же страны) — по набору id, а не по названию: «Рождество» России и Украины — разные дни.
      const id = e.holidays
        .map((h) => h.id)
        .sort()
        .join('|');
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .slice(0, limit);
}
