import { ageOn, formatDate, hasYear, parseISODate, plural, sameDayInYear } from './dates';
import type { AppData, ISODate } from './types';

/** Дата для календаря: день рождения или важная дата друга. */
export interface CalendarItem {
  /** Стабильный ключ: по нему событие находится при следующей синхронизации и в файле .ics (UID). */
  key: string;
  /** «🎂 Аня Смирнова» или «♥ Свадьба · Аня Смирнова». */
  title: string;
  notes: string;
  /** Первая дата события. С известным годом — настоящая дата, без года — та же дата в BASE_YEAR. */
  date: ISODate;
  yearly: boolean;
  /** 29 февраля: в невисокосный год событие должно быть 28-го (как в самом приложении). */
  leapDay: boolean;
  /** Год рождения или год, с которого считается годовщина: из него — возраст или «5 лет» в названии. */
  startYear?: number;
  friendId: string;
  name: string;
  /** Название важной даты («Свадьба»); у дня рождения пусто. */
  label: string;
}

/** Событие в календаре телефона: одно событие на один год. */
export interface PlannedEvent {
  key: string;
  title: string;
  notes: string;
  date: ISODate;
  yearly: boolean;
  /** Чьё событие и какое — чтобы не добавлять то, что уже есть в контактах или другом календаре. */
  friendId: string;
  name: string;
  kind: 'birthday' | 'date';
  /** Название важной даты («Свадьба»); у дня рождения пусто. */
  label: string;
}

const SIGNATURE = 'Из приложения «Друзья».';
/** Високосный год для дат без года: от него считается повтор в файле .ics, и 29 февраля в нём существует. */
export const BASE_YEAR = 2000;

const withBaseYear = (date: ISODate) => `${BASE_YEAR}-${date.slice(5)}`;
const yearsWord = (n: number) => `${n} ${plural(n, 'год', 'года', 'лет')}`;

/** Все даты друзей, которые стоит показать в календаре: дни рождения и важные даты с названием и числом. */
export function calendarItems(data: AppData): CalendarItem[] {
  const out: CalendarItem[] = [];
  for (const f of data.friends) {
    if (f.birthday) {
      const known = hasYear(f.birthday);
      out.push({
        key: `b-${f.id}`,
        title: `🎂 ${f.name}`,
        notes: known ? `Дата рождения: ${formatDate(f.birthday)}.\n${SIGNATURE}` : SIGNATURE,
        date: known ? f.birthday : withBaseYear(f.birthday),
        yearly: true,
        leapDay: f.birthday.slice(5) === '02-29',
        startYear: known ? parseISODate(f.birthday).getFullYear() : undefined,
        friendId: f.id,
        name: f.name,
        label: '',
      });
    }
    for (const d of f.dates) {
      if (!d.date || !d.title.trim()) continue;
      const known = hasYear(d.date);
      out.push({
        key: `d-${d.id}`,
        title: `♥ ${d.title.trim()} · ${f.name}`,
        notes: d.yearly && known ? `С ${parseISODate(d.date).getFullYear()} года.\n${SIGNATURE}` : SIGNATURE,
        date: known || !d.yearly ? d.date : withBaseYear(d.date),
        yearly: d.yearly,
        leapDay: d.yearly && d.date.slice(5) === '02-29',
        startYear: d.yearly && known ? parseISODate(d.date).getFullYear() : undefined,
        friendId: f.id,
        name: f.name,
        label: d.title.trim(),
      });
    }
  }
  return out;
}

/** Сколько лет показывать в календаре телефона: этот и два следующих. При каждом запуске окно сдвигается. */
export const CALENDAR_YEARS = 3;

/**
 * События для календаря телефона: каждая годовщина — отдельным событием на этот год и два следующих,
 * с возрастом или числом лет в названии («🎂 Аня Смирнова · 31 год»). 29 февраля в невисокосный год — 28-го.
 * Разовые важные даты попадают, только если они в этом окне.
 */
export function planCalendarEvents(data: AppData, today: ISODate, years = CALENDAR_YEARS): PlannedEvent[] {
  const first = parseISODate(today).getFullYear();
  const last = first + years - 1;
  const out: PlannedEvent[] = [];
  for (const item of calendarItems(data)) {
    const kind = item.key.startsWith('b-') ? 'birthday' : 'date';
    const base = { notes: item.notes, yearly: false, friendId: item.friendId, name: item.name, label: item.label, kind } as const;
    if (!item.yearly) {
      const y = parseISODate(item.date).getFullYear();
      if (y >= first && y <= last) out.push({ ...base, key: item.key, title: item.title, date: item.date });
      continue;
    }
    for (let y = first; y <= last; y++) {
      if (item.startYear && y < item.startYear) continue;
      const date = sameDayInYear(item.date, y);
      const n = item.startYear ? ageOn(`${item.startYear}${item.date.slice(4)}`, date) : 0;
      out.push({ ...base, key: `${item.key}-${y}`, title: n > 0 ? `${item.title} · ${yearsWord(n)}` : item.title, date });
    }
  }
  return out;
}

/** Событие из другого календаря телефона (Google, Samsung, рабочий…). */
export interface OtherEvent {
  title: string;
  date: ISODate;
}

const words = (s: string) => s.toLowerCase().replace(/ё/g, 'е').split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** Слово в другом падеже: «Аня» — «Ани», «Смирнова» — «Смирновой», но не «Андрей» и не «января» для «Ян». */
function sameWord(word: string, other: string): boolean {
  const stem = word.slice(0, Math.max(2, Math.min(4, word.length - 1)));
  return other.startsWith(stem) && Math.abs(other.length - word.length) <= 2;
}

/** Упомянуты ли в названии все слова фразы (с учётом падежей). */
export function titleMentions(title: string, phrase: string): boolean {
  const inTitle = words(title);
  const parts = words(phrase).filter((w) => w.length >= 2);
  return parts.length > 0 && parts.every((w) => inTitle.some((t) => sameWord(w, t)));
}

const BIRTHDAY_TITLE = /рожд|(^|[^\p{L}])др([^\p{L}]|$)|birthday|b-?day|🎂/iu;

/**
 * То же ли это событие, что и наше (дата уже совпала). День рождения: название — просто имя друга («Аня Смирнова»,
 * так подписывает события календарь «Дни рождения»), или имя вместе со словами «день рождения» («ДР Ани»).
 * Важная дата: имя и название даты («Годовщина свадьбы Ани» для «Свадьба»). «Ужин с Аней» в её день рождения — не дубль.
 */
export function sameEvent(e: Pick<PlannedEvent, 'kind' | 'name' | 'label'>, otherTitle: string): boolean {
  const nameParts = words(e.name).filter((w) => w.length >= 2);
  if (!nameParts.length) return false;
  const inTitle = words(otherTitle);
  if (e.kind === 'birthday' && inTitle.length && inTitle.every((t) => nameParts.some((w) => sameWord(w, t)))) return true;
  if (!titleMentions(otherTitle, nameParts[0])) return false;
  return e.kind === 'birthday' ? BIRTHDAY_TITLE.test(otherTitle) : titleMentions(otherTitle, e.label);
}

/** Человек из телефонной книги с днём рождения — его уже показывают календари Samsung и Google («Дни рождения»). */
export interface ContactBirthday {
  name: string;
  phones: string[];
  month: number;
  day: number;
}

const nameKey = (n: string) => n.trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');

/**
 * Убирает события, которые телефон и так покажет: дни рождения друзей, у которых в контактах записан тот же день
 * (человек узнаётся по номеру или полному имени), и любые даты, если в другом календаре в тот же день уже есть
 * такое событие. Сомнительное совпадение не считаем дублем: лишнее событие лучше потерянного дня рождения.
 */
export function withoutDuplicates(
  planned: PlannedEvent[],
  data: AppData,
  others: OtherEvent[],
  contacts: ContactBirthday[],
  phoneKey: (phone: string) => string,
): PlannedEvent[] {
  const inContacts = new Set<string>();
  for (const f of data.friends) {
    if (!f.birthday) continue;
    const [month, day] = [Number(f.birthday.slice(5, 7)), Number(f.birthday.slice(8, 10))];
    const phone = f.phone ? phoneKey(f.phone) : '';
    const name = nameKey(f.name);
    const found = contacts.some(
      (c) => c.month === month && c.day === day && ((!!name && nameKey(c.name) === name) || (phone.length >= 7 && c.phones.some((p) => phoneKey(p) === phone))),
    );
    if (found) inContacts.add(f.id);
  }
  const titlesByDate = new Map<ISODate, string[]>();
  for (const o of others) titlesByDate.set(o.date, [...(titlesByDate.get(o.date) ?? []), o.title]);
  return planned.filter((e) => {
    if (e.kind === 'birthday' && inContacts.has(e.friendId)) return false;
    return !(titlesByDate.get(e.date) ?? []).some((t) => sameEvent(e, t));
  });
}

/** Что сохранено о событии в календаре: его id и «подпись» содержимого, чтобы заметить изменения. */
export interface StoredEvent {
  id: string;
  sig: string;
}

export const eventSignature = (e: PlannedEvent) => JSON.stringify([e.title, e.notes, e.date, e.yearly]);

/**
 * Что сделать с календарём, чтобы он совпал с приложением: создать новые события, пересоздать изменённые,
 * удалить лишние. Неизменённые остаются как есть.
 */
export function diffCalendar(planned: PlannedEvent[], stored: Record<string, StoredEvent>) {
  const create: PlannedEvent[] = [];
  const replace: { id: string; event: PlannedEvent }[] = [];
  const keep: Record<string, StoredEvent> = {};
  const wanted = new Set<string>();
  for (const e of planned) {
    wanted.add(e.key);
    const old = stored[e.key];
    if (!old) create.push(e);
    else if (old.sig !== eventSignature(e)) replace.push({ id: old.id, event: e });
    else keep[e.key] = old;
  }
  const remove = Object.entries(stored)
    .filter(([key]) => !wanted.has(key))
    .map(([, s]) => s.id);
  return { create, replace, remove, keep };
}
