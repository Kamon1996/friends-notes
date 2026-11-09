import { addInterval, toISODate } from './dates';
import type { ISODate, Priority, Reminder } from './types';

/** Фильтры вкладки «Напоминания». */
export type ReminderFilter = 'all' | 'quick' | 'important' | 'personal' | 'friends' | 'done';

/** «Быстрые» — те, что займут не больше получаса. */
export const QUICK_MINUTES = 30;

/** Важность — подписи для чипа и формы. */
export const PRIORITY_LABELS: Record<Priority, string> = { 1: 'Низкая', 2: 'Средняя', 3: 'Важно' };

/** Сколько займёт — варианты в форме. */
export const DURATIONS = [5, 15, 30, 60, 120, 240] as const;

/** «30 мин», «1 ч», «1 ч 30 мин», «полдня». */
export function formatMinutes(m: number): string {
  if (m === 240) return 'полдня';
  if (m < 60) return `${m} мин`;
  return m % 60 ? `${Math.floor(m / 60)} ч ${m % 60} мин` : `${m / 60} ч`;
}

export interface ReminderSection {
  key: 'today' | 'week' | 'month' | 'later' | 'doneToday' | 'done';
  title: string;
  rows: Reminder[];
}

/** По сроку; срок одинаковый — важнее выше; дальше — по времени и названию. */
export function byDeadline(a: Reminder, b: Reminder): number {
  return a.date.localeCompare(b.date) || (b.priority ?? 0) - (a.priority ?? 0) || a.time.localeCompare(b.time) || a.title.localeCompare(b.title, 'ru');
}

const doneDay = (r: Reminder): ISODate | null => (r.doneAt ? toISODate(new Date(r.doneAt)) : null);

/**
 * Разделы вкладки: «Сегодня» (с просроченными), «На неделе», «В течение месяца», «Позже» — по сроку, затем по важности;
 * внизу — «Сделано сегодня», чтобы сделанное можно было вернуть тем же свайпом. «Сделанные» — всё сделанное, новое сверху.
 */
export function reminderSections(reminders: readonly Reminder[], filter: ReminderFilter, now = new Date()): ReminderSection[] {
  const today = toISODate(now);
  if (filter === 'done') {
    const done = reminders.filter((r) => r.done).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0) || b.date.localeCompare(a.date));
    return done.length ? [{ key: 'done', title: 'Сделанные', rows: done }] : [];
  }
  const keep = (r: Reminder) => {
    switch (filter) {
      case 'quick':
        return !!r.minutes && r.minutes <= QUICK_MINUTES;
      case 'important':
        return r.priority === 3;
      case 'personal':
        return !r.friendId;
      case 'friends':
        return !!r.friendId;
      default:
        return true;
    }
  };
  const list = reminders.filter(keep);
  const week = addInterval(today, 'day', 7);
  const month = addInterval(today, 'day', 31);
  const sections: ReminderSection[] = [
    { key: 'today', title: 'Сегодня', rows: [] },
    { key: 'week', title: 'На неделе', rows: [] },
    { key: 'month', title: 'В течение месяца', rows: [] },
    { key: 'later', title: 'Позже', rows: [] },
  ];
  for (const r of list.filter((x) => !x.done).sort(byDeadline)) {
    sections[r.date <= today ? 0 : r.date <= week ? 1 : r.date <= month ? 2 : 3].rows.push(r);
  }
  const doneToday = list.filter((r) => r.done && doneDay(r) === today).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));
  sections.push({ key: 'doneToday', title: 'Сделано сегодня', rows: doneToday });
  return sections.filter((s) => s.rows.length > 0);
}

/** Цвет фитиля: пока запас большой — зелёный, к концу — через янтарный в красный. */
export function fuseColor(left: number, colors: { success: string; warn: string; danger: string }): string {
  if (left >= 0.5) return colors.success;
  if (left >= 0.25) return mix(colors.warn, colors.success, (left - 0.25) / 0.25);
  return mix(colors.danger, colors.warn, left / 0.25);
}

/** Смесь двух цветов #RRGGBB: t = 0 — a, t = 1 — b. */
export function mix(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  const k = Math.max(0, Math.min(1, t));
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join('')}`;
}

/** Тот же цвет с прозрачностью: #RRGGBB → rgba(). */
export function alpha(hex: string, a: number): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
