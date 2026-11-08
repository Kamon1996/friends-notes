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

/** Подпись в описании каждого нашего события: по ней приложение отличает свои события от добавленных вручную. */
export const CALENDAR_SIGNATURE = 'Из приложения «Друзья».';
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
        notes: known ? `Дата рождения: ${formatDate(f.birthday)}.\n${CALENDAR_SIGNATURE}` : CALENDAR_SIGNATURE,
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
        notes: d.yearly && known ? `С ${parseISODate(d.date).getFullYear()} года.\n${CALENDAR_SIGNATURE}` : CALENDAR_SIGNATURE,
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

/** Годы в календаре телефона: прошлый (чтобы недавние даты не пропадали сразу после Нового года), этот и два следующих. */
export const CALENDAR_PAST_YEARS = 1;
export const CALENDAR_FUTURE_YEARS = 2;

export function calendarYears(today: ISODate): number[] {
  const year = parseISODate(today).getFullYear();
  const out: number[] = [];
  for (let y = year - CALENDAR_PAST_YEARS; y <= year + CALENDAR_FUTURE_YEARS; y++) out.push(y);
  return out;
}

/**
 * События для календаря телефона: каждая годовщина — отдельным событием на каждый год окна, с возрастом или числом
 * лет в названии («🎂 Аня Смирнова · 31 год»). 29 февраля в невисокосный год — 28-го. Годовщины не раньше первого раза,
 * разовые важные даты — только если попадают в окно.
 */
export function planCalendarEvents(data: AppData, today: ISODate, years = calendarYears(today)): PlannedEvent[] {
  const out: PlannedEvent[] = [];
  for (const item of calendarItems(data)) {
    const kind = item.key.startsWith('b-') ? 'birthday' : 'date';
    const base = { notes: item.notes, yearly: false, friendId: item.friendId, name: item.name, label: item.label, kind } as const;
    if (!item.yearly) {
      if (years.includes(parseISODate(item.date).getFullYear())) out.push({ ...base, key: item.key, title: item.title, date: item.date });
      continue;
    }
    for (const y of years) {
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

/** «День рождения», «ДР», «Д.Р.», «днюха», «именины», «день народження», birthday, bday, 🎂. */
const BIRTHDAY_TITLE = /рожд|народж|нарадж|днюх|именин|(^|[^\p{L}])д\.?\s?р\.?(?=[^\p{L}]|$)|д\/р|birthday|b-?day|hbd|🎂/iu;

/**
 * То же ли это событие, что и наше (дата уже совпала). День рождения: название — просто имя друга («Аня Смирнова»,
 * так подписывает события календарь «Дни рождения»), или его имя либо фамилия вместе со словами «день рождения»
 * («ДР Ани»). Важная дата: имя и название даты («Годовщина свадьбы Ани» для «Свадьба»).
 * «Ужин с Аней» в её день рождения — не дубль: лишнее событие лучше потерянного дня рождения.
 */
export function sameEvent(e: Pick<PlannedEvent, 'kind' | 'name' | 'label'>, otherTitle: string): boolean {
  const nameParts = words(e.name).filter((w) => w.length >= 2);
  if (!nameParts.length) return false;
  const inTitle = words(otherTitle);
  if (e.kind === 'birthday' && inTitle.length && inTitle.every((t) => nameParts.some((w) => sameWord(w, t)))) return true;
  if (!nameParts.some((w) => inTitle.some((t) => sameWord(w, t)))) return false;
  return e.kind === 'birthday' ? BIRTHDAY_TITLE.test(otherTitle) : titleMentions(otherTitle, e.label);
}

/** Человек из телефонной книги с днём рождения — его уже показывают календари Samsung и Google («Дни рождения»). */
export interface ContactBirthday {
  name: string;
  phones: string[];
  month: number;
  day: number;
}

/** Имя без учёта регистра, «ё» и порядка слов: «Смирнова Аня» — тот же человек, что «аня смирнова». */
const nameKey = (n: string) => words(n).sort().join(' ');

export interface CalendarPlanSplit {
  /** Что положить в календарь. */
  keep: PlannedEvent[];
  /** Дни рождения, записанные у этого человека в контактах: календарь телефона покажет их сам. */
  fromContacts: PlannedEvent[];
  /** Такие же события уже есть в другом календаре. */
  fromOthers: PlannedEvent[];
}

/**
 * Делит события на те, что нужно добавить, и те, что телефон и так покажет: дни рождения друзей, у которых в контактах
 * записан тот же день (человек узнаётся по номеру или полному имени), и события, которые в тот же день уже есть
 * в другом календаре. Два одинаковых события у двух записей одного человека в приложении тоже сливаются в одно.
 */
export function splitDuplicates(
  planned: PlannedEvent[],
  data: AppData,
  others: OtherEvent[],
  contacts: ContactBirthday[],
  phoneKey: (phone: string) => string,
): CalendarPlanSplit {
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

  const out: CalendarPlanSplit = { keep: [], fromContacts: [], fromOthers: [] };
  const seen = new Set<string>();
  for (const e of planned) {
    if (e.kind === 'birthday' && inContacts.has(e.friendId)) out.fromContacts.push(e);
    else if ((titlesByDate.get(e.date) ?? []).some((t) => sameEvent(e, t))) out.fromOthers.push(e);
    else if (!seen.has(`${e.date}|${e.title}`)) {
      seen.add(`${e.date}|${e.title}`);
      out.keep.push(e);
    }
  }
  return out;
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
