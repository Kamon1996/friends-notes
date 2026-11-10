import {
  addInterval,
  ageOn,
  combine,
  daysBetween,
  firstOccurrenceFrom,
  formatDateCompact,
  hasYear,
  nextAnniversary,
  nextOccurrenceAfter,
  occurrences,
  parseISODate,
  plural,
  previousOccurrence,
  sameDayInYear,
  toISODate,
  todayISO,
} from './dates';
import { advancesOf } from './advances';
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
    const overdue = reminderOverdue(r, now);
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

/**
 * «Сделано». Разовое — сделано. Повторяющееся — сделано до конца дня: дата не меняется (свайп ещё раз — вернуть как было),
 * а со следующего дня rollReminder вернёт его в активные на ближайший раз.
 */
export function completeReminder(r: Reminder, now = new Date()): Reminder {
  return { ...r, done: true, doneAt: now.getTime() };
}

/** Снова не сделано — как было до отметки. */
export function reopenReminder(r: Reminder): Reminder {
  const { doneAt: _, ...rest } = r;
  return { ...rest, done: false };
}

/**
 * Серию завели с уже прошедшего дня: «годовщина — 18 октября», а на дворе ноябрь. Такой раз не пропущен — дела тогда
 * ещё не было. Запас в два дня — чтобы смена часового пояса не выдала вчерашнее несделанное дело за такое.
 */
function startedInPast(r: Reminder): boolean {
  return r.createdAt > 0 && daysBetween(r.date, toISODate(new Date(r.createdAt))) >= 2;
}

/**
 * Повторяющееся, отмеченное «сделано» в прошлые дни, снова активно — на ближайший раз после отмеченного, но не раньше
 * сегодняшнего дня. Сегодняшнее «сделано» не трогаем. Считаем от начала серии, чтобы 31-е не съехало на 28-е.
 *
 * Сюда же — дела, которые старая форма сохранила с прошедшим днём и которые сразу стали «просрочены»: они встают
 * на ближайший раз не раньше сегодня (новая форма делает это сама, см. `settleSeries`).
 */
export function rollReminder(r: Reminder, now = new Date()): Reminder {
  if (!r.repeat) return r;
  const today = toISODate(now);
  if (!r.done) {
    if (r.date >= today || !startedInPast(r)) return r;
    const anchor = seriesStart(r);
    return { ...r, anchor, date: firstOccurrenceFrom(anchor, r.repeat, today) };
  }
  if (r.doneAt && toISODate(new Date(r.doneAt)) >= today) return r;
  const current = combine(r.date, r.time);
  const dayStart = new Date(combine(today, '00:00').getTime() - 1);
  const anchor = seriesStart(r);
  const next = nextOccurrenceAfter(anchor, r.time, r.repeat, current > dayStart ? current : dayStart);
  return { ...reopenReminder(r), anchor, date: next };
}

/**
 * По какой день серия закрыта отметкой «сделано»: текущий раз, а если отметили позже срока — день отметки.
 * Разы до этого дня включительно не напоминают: дело сделано, пропущенное уже не вернётся. Так же считает
 * `rollReminder`, когда на следующий день переносит дело на ближайший раз.
 */
export function doneThrough(r: Reminder): ISODate | null {
  if (!r.repeat || !r.done) return null;
  const doneDay = r.doneAt ? toISODate(new Date(r.doneAt)) : r.date;
  return doneDay > r.date ? doneDay : r.date;
}

/** Следующий раз повторяющегося после текущего — «снова завтра» у сделанного. */
export function nextAfterCurrent(r: Reminder): ISODate | null {
  if (!r.repeat) return null;
  const through = doneThrough(r);
  // Сделано позже срока — считаем от дня отметки: «снова» должно совпасть с тем, куда дело перенесётся завтра.
  const after = through && through > r.date ? combine(through, '23:59') : combine(r.date, r.time);
  return nextOccurrenceAfter(seriesStart(r), r.time, r.repeat, after);
}

/**
 * Просрочено ли. «На дату и время» — как только прошло время; «до срока» и повторяющееся — когда прошёл весь день
 * (дело на сегодня можно сделать и вечером).
 */
export function reminderOverdue(r: Reminder, now = new Date()): boolean {
  if (r.done) return false;
  if (!r.repeat && r.kind === 'at') return combine(r.date, r.time) < now;
  return r.date < toISODate(now);
}

/** Сколько фитиля видно при большом запасе: всё, что дальше двух недель, — полный фитиль. */
export const FUSE_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Фитиль: доля времени, что осталась до срока (1 — полный, 0 — догорел). Срок «до» и повторяющегося — конец дня,
 * «на дату и время» — само время. Отсчёт — от создания (у повторяющегося — от прошлого раза), но не дальше двух недель:
 * пока до срока больше двух недель, фитиль полный. У сделанного — null.
 */
export function reminderFuse(r: Reminder, now = new Date()): number | null {
  if (r.done) return null;
  const end = !r.repeat && r.kind === 'at' ? combine(r.date, r.time) : combine(addInterval(r.date, 'day', 1), '00:00');
  const from = r.repeat
    ? combine(addInterval(previousOccurrence(r.date, r.repeat), 'day', 1), '00:00').getTime()
    : r.createdAt > 0
      ? r.createdAt
      : end.getTime() - FUSE_DAYS * DAY_MS;
  const start = Math.max(from, end.getTime() - FUSE_DAYS * DAY_MS);
  const span = end.getTime() - start;
  const left = end.getTime() - now.getTime();
  if (left <= 0) return 0;
  if (span <= 0) return 1;
  return Math.min(1, left / span);
}

/** Начало серии повторяющегося напоминания: якорь, если он не позже ближайшего раза, иначе сам ближайший раз. */
export function seriesStart(r: Pick<Reminder, 'date' | 'anchor'>): ISODate {
  return r.anchor && r.anchor <= r.date ? r.anchor : r.date;
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
  /** Разовое напоминание: в уведомлении кнопка «Сделано» — отмечает его. */
  reminderId?: string;
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
  // «Сегодня» — от переданного времени, а не от часов устройства: так расписание детерминировано и проверяемо.
  const today = toISODate(now);
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
        // Ежегодная дата с годом впереди (свадьба в 2027-м) до самой даты не наступает — как и в календаре.
        if (d.yearly && hasYear(d.date) && date < d.date) continue;
        const years = d.yearly && hasYear(d.date) ? parseISODate(date).getFullYear() - parseISODate(d.date).getFullYear() : 0;
        const yearsText = years > 0 ? ` · ${years} ${plural(years, 'год', 'года', 'лет')}` : '';
        pushEvent(date, `${d.title} — ${f.name}${yearsText}`, 'Сегодня важная дата.', 'Завтра важная дата.', url, f);
      }
    }
  }

  for (const r of data.reminders) {
    // Сделанное повторяющееся — сделано только в этот раз: следующие уведомления остаются.
    if (r.done && !r.repeat) continue;
    const friend = r.friendId ? friendById.get(r.friendId) : undefined;
    const title = r.title;
    const body = r.note || (friend ? friend.name : 'Напоминание');
    const url = `/reminder/edit?id=${r.id}`;

    if (!r.repeat) {
      const at = combine(r.date, r.time);
      const reminderId = r.id;
      // Заранее: «за день» у встречи — «Завтра в 15:00», остальное — «Скоро: через час».
      const early = (minutes: number) => {
        const when = new Date(at.getTime() - minutes * 60_000);
        if (when <= now) return;
        const extra = r.note || friend?.name;
        const text = r.kind === 'at' && minutes === 1440 ? `Завтра в ${r.time}${extra ? ` · ${extra}` : ''}` : `Скоро: ${formatAdvance(minutes)} — ${body}`;
        out.push({ at: when, title, body: text, url, reminderId });
      };
      if (r.kind === 'at') {
        // На дату и время: в это время и заранее (по умолчанию — за день).
        advancesOf(r).forEach(early);
        if (at > now) out.push({ at, title, body, url, reminderId });
        continue;
      }
      if (r.daily) {
        // Каждый день до срока: с сегодняшнего дня (если время ещё не прошло) и до дня перед сроком — с обратным отсчётом.
        const extra = r.note || friend?.name;
        const withExtra = (text: string) => (extra ? `${text} · ${extra}` : text);
        let n = 0;
        for (let day = today; day < r.date && n < MAX_PER_SERIES; day = addInterval(day, 'day', 1)) {
          const nudge = combine(day, r.time);
          if (nudge <= now) continue;
          out.push({ at: nudge, title, body: withExtra(countdown(daysBetween(day, r.date), r.date)), url, reminderId });
          n++;
        }
        if (at > now) out.push({ at, title, body: withExtra('Сегодня срок'), url, reminderId });
        // В последний день — ещё и «за час», если выбрано.
        advancesOf(r).forEach(early);
        continue;
      }
      if (at > now) out.push({ at, title, body, url, reminderId });
      advancesOf(r).forEach(early);
      continue;
    }

    let n = 0;
    const closed = doneThrough(r);
    for (const date of occurrences(seriesStart(r), r.repeat)) {
      if (date < r.date || (closed && date <= closed)) continue; // прошедшие разы серии до ближайшего; сделанные разы
      const at = combine(date, r.time);
      for (const minutes of advancesOf(r)) {
        const when = new Date(at.getTime() - minutes * 60_000);
        if (when > now) out.push({ at: when, title, body: `Скоро: ${formatAdvance(minutes)} — ${body}`, url });
      }
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

/** «Осталось 5 дней — до 20 ноя», «Завтра срок» — для напоминаний «каждый день до срока». */
export function countdown(left: number, deadline: ISODate): string {
  if (left <= 0) return 'Сегодня срок';
  if (left === 1) return 'Завтра срок';
  return `${plural(left, 'Остался', 'Осталось', 'Осталось')} ${left} ${plural(left, 'день', 'дня', 'дней')} — до ${formatDateCompact(deadline, false)}`;
}

export function formatAdvance(minutes: number): string {
  switch (minutes) {
    case 60:
      return 'через час';
    case 120:
      return 'через 2 часа';
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
