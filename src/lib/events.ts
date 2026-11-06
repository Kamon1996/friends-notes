import {
  addInterval,
  ageOn,
  combine,
  daysBetween,
  hasYear,
  nextAnniversary,
  nextOccurrenceAfter,
  occurrences,
  parseISODate,
  plural,
  sameDayInYear,
  todayISO,
} from './dates';
import { phoneUrl, telegramUrl, viberUrl, whatsappUrl } from './messengers';
import type { AppData, Friend, ISODate, Reminder } from './types';

/** Элемент ленты «Скоро». */
export type UpcomingItem =
  | { kind: 'birthday'; key: string; date: ISODate; friend: Friend; age: number | null }
  | { kind: 'date'; key: string; date: ISODate; friend: Friend; title: string; years: number | null }
  | { kind: 'reminder'; key: string; date: ISODate; reminder: Reminder; friend: Friend | null; overdue: boolean };

export function upcomingItems(data: AppData, horizonDays = 60, today: ISODate = todayISO()): UpcomingItem[] {
  const items: UpcomingItem[] = [];
  const limit = addInterval(today, 'day', horizonDays);
  const friendById = new Map(data.friends.map((f) => [f.id, f]));

  for (const friend of data.friends) {
    if (friend.birthday) {
      const date = nextAnniversary(friend.birthday, today);
      if (date <= limit) {
        const age = hasYear(friend.birthday) ? ageOn(friend.birthday, date) : null;
        items.push({ kind: 'birthday', key: `b-${friend.id}`, date, friend, age });
      }
    }
    for (const d of friend.dates) {
      const date = d.yearly ? nextAnniversary(d.date, today) : d.date;
      if (date >= today && date <= limit) {
        const years = d.yearly && hasYear(d.date) ? parseISODate(date).getFullYear() - parseISODate(d.date).getFullYear() : null;
        items.push({ kind: 'date', key: `d-${d.id}`, date, friend, title: d.title, years: years || null });
      }
    }
  }

  const now = new Date();
  for (const r of data.reminders) {
    if (r.done) continue;
    if (r.date > limit) continue;
    const overdue = combine(r.date, r.time) < now;
    items.push({
      kind: 'reminder',
      key: `r-${r.id}`,
      date: r.date,
      reminder: r,
      friend: r.friendId ? friendById.get(r.friendId) ?? null : null,
      overdue,
    });
  }

  const rank = (i: UpcomingItem) => (i.kind === 'reminder' ? i.reminder.time : '');
  items.sort((a, b) => (a.date === b.date ? rank(a).localeCompare(rank(b)) : a.date.localeCompare(b.date)));
  return items;
}

/** «Сделано» для повторяющегося напоминания — перенос на следующее срабатывание. */
export function completeReminder(r: Reminder, now = new Date()): Reminder {
  if (!r.repeat) return { ...r, done: true };
  // Следующее срабатывание после текущего, но не в прошлом.
  const afterCurrent = combine(r.date, r.time) > now ? combine(r.date, r.time) : now;
  const next = nextOccurrenceAfter(r.date, r.time, r.repeat, afterCurrent);
  return { ...r, date: next, done: false };
}

export interface PlannedNotification {
  at: Date;
  title: string;
  body: string;
  /** Куда перейти при нажатии на уведомление. */
  url: string;
  /** Ссылки для кнопок «Позвонить» и «Написать» в самом уведомлении. */
  callUrl?: string;
  writeUrl?: string;
}

const clip = (s: string, max = 60) => (s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s);

/** Подсказка в уведомлении о дне рождения: что любит, какие цветы. */
export function birthdayHint(f: Pick<Friend, 'flowers' | 'food' | 'gifts'>): string | null {
  const parts = [f.flowers.trim() && `Цветы: ${clip(f.flowers.trim())}`, f.food.trim() && `Еда: ${clip(f.food.trim())}`].filter(Boolean);
  if (!parts.length) return giftHint(f);
  return parts.join('. ') + '.';
}

export function giftHint(f: Pick<Friend, 'gifts'>): string | null {
  return f.gifts.trim() ? `Идеи подарков: ${clip(f.gifts.trim(), 80)}.` : null;
}

/** Куда ведут кнопки уведомления: звонок по номеру и чат в первом доступном мессенджере. */
export function notificationActions(f: Pick<Friend, 'phone' | 'telegramId' | 'whatsapp' | 'viber'>): { callUrl?: string; writeUrl?: string } {
  const out: { callUrl?: string; writeUrl?: string } = {};
  if (f.phone) out.callUrl = phoneUrl(f.phone);
  if (f.telegramId) out.writeUrl = telegramUrl(f.telegramId, 'android');
  else if (f.whatsapp) out.writeUrl = whatsappUrl(f.whatsapp);
  else if (f.viber) out.writeUrl = viberUrl(f.viber);
  return out;
}

const MAX_PER_SERIES = 12;
/** iOS хранит максимум 64 запланированных уведомления — держим запас. */
export const MAX_SCHEDULED = 60;

/**
 * Список уведомлений на будущее. Пересчитывается при каждом изменении данных и
 * при открытии приложения, поэтому хватает ближайших MAX_SCHEDULED штук.
 */
export function planNotifications(data: AppData, now = new Date()): PlannedNotification[] {
  const out: PlannedNotification[] = [];
  const today = todayISO();
  const { eventTime, eventDayBefore } = data.settings;
  const friendById = new Map(data.friends.map((f) => [f.id, f]));

  const pushEvent = (date: ISODate, title: string, body: string, bodyBefore: string, url: string, friend: Friend) => {
    const actions = notificationActions(friend);
    const at = combine(date, eventTime);
    if (at > now) out.push({ at, title, body, url, ...actions });
    if (eventDayBefore) {
      const before = combine(addInterval(date, 'day', -1), eventTime);
      if (before > now) out.push({ at: before, title, body: bodyBefore, url, ...actions });
    }
  };

  for (const f of data.friends) {
    if (f.muted) continue; // уведомления о событиях этого человека выключены
    const url = `/friend/${f.id}`;
    if (f.birthday) {
      const year = parseISODate(today).getFullYear();
      for (const y of [year, year + 1]) {
        const date = sameDayInYear(f.birthday, y);
        const knownYear = hasYear(f.birthday);
        const age = knownYear ? ageOn(f.birthday, date) : null;
        const ageText = age && age > 0 ? ` · ${age} ${plural(age, 'год', 'года', 'лет')}` : '';
        const hint = birthdayHint(f);
        pushEvent(
          date,
          `${f.name} — день рождения${ageText}`,
          hint ?? 'Самое время поздравить.',
          `Завтра день рождения${ageText}. ${giftHint(f) ?? 'Подготовь подарок и поздравление.'}`,
          url,
          f,
        );
      }
    }
    for (const d of f.dates) {
      const dates = d.yearly
        ? [0, 1].map((k) => sameDayInYear(d.date, parseISODate(today).getFullYear() + k))
        : [d.date];
      for (const date of dates) {
        const years = d.yearly && hasYear(d.date) ? parseISODate(date).getFullYear() - parseISODate(d.date).getFullYear() : 0;
        const yearsText = years > 0 ? ` · ${years} ${plural(years, 'год', 'года', 'лет')}` : '';
        pushEvent(date, `${d.title} — ${f.name}${yearsText}`, 'Сегодня важная дата.', 'Завтра важная дата.', url, f);
      }
    }
  }

  for (const r of data.reminders) {
    if (r.done) continue;
    const friend = r.friendId ? friendById.get(r.friendId) : undefined;
    const title = r.title;
    const body = r.note || (friend ? friend.name : 'Напоминание');
    const url = `/reminder/edit?id=${r.id}`;

    if (!r.repeat) {
      const at = combine(r.date, r.time);
      if (at > now) out.push({ at, title, body, url });
      if (r.advance > 0) {
        const early = new Date(at.getTime() - r.advance * 60_000);
        if (early > now) out.push({ at: early, title, body: `Скоро: ${formatAdvance(r.advance)} — ${body}`, url });
      }
      continue;
    }

    let n = 0;
    for (const date of occurrences(r.date, r.repeat)) {
      const at = combine(date, r.time);
      if (at > now) {
        out.push({ at, title, body, url });
        if (++n >= MAX_PER_SERIES) break;
      }
      if (daysBetween(today, date) > 3 * 366) break;
    }
  }

  out.sort((a, b) => a.at.getTime() - b.at.getTime());
  return out.slice(0, MAX_SCHEDULED);
}

export function formatAdvance(minutes: number): string {
  switch (minutes) {
    case 60:
      return 'через час';
    case 1440:
      return 'через день';
    case 4320:
      return 'через 3 дня';
    case 10080:
      return 'через неделю';
    default:
      return '';
  }
}
