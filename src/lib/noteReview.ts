import { storeAdvances } from './advances';
import { UNKNOWN_YEAR, daysBetween, formatDate, hasYear, nextAnniversary, plural, snapToRepeat } from './dates';
import { DEFAULT_TIME, timeSuggestions, usualAdvance, type TaskKind } from './habits';
import type { DraftField, NoteAnswer, NoteDraft } from './noteTasks';
import type { Friend, ISODate, Reminder, Repeat, TimeOfDay } from './types';

/**
 * Список записей «Из заметки» — то, что человек видит после разбора (`src/lib/noteTasks.ts`) и до нажатия «Добавить».
 *
 * По каждой записи нужно решение: добавить или убрать. Пока есть записи «на проверку», ничего не добавляется.
 * Добавить можно только полную запись: у дела есть срок (у повтора — ещё и «как часто»), у дня рождения — день
 * и человек. Чего в заметке не было, того приложение не ставит — человек дополняет сам; единственное исключение —
 * время: не названо — будет привычное.
 *
 * Здесь только правила, без экрана и хранилища: состояния записей, поиск друга по имени из заметки, «поставить
 * срок всем» и перевод записей в дела и даты друзей.
 */

/** «На проверку» — решения ещё нет; «добавить» и «убрать» — решено. */
export type ReviewState = 'todo' | 'add' | 'skip';
/** Куда положить день рождения или важную дату: в карточку друга, новым другом или напоминанием. */
export type DateTo = 'friend' | 'new' | 'reminder';

export interface ReviewItem {
  id: string;
  /** Запись из заметки — уже с правками человека. */
  draft: NoteDraft;
  state: ReviewState;
  /** Друг, к которому относится запись. null — человека нет, он не из друзей или подходит несколько. */
  friendId: string | null;
  /** Только у дня рождения и важной даты. */
  to: DateTo;
  /** День рождения, который у выбранного друга уже записан (на момент выбора друга). */
  known?: ISODate | null;
  /** У друга записан другой день рождения — заменить его можно только по явному решению. */
  replace?: boolean;
}

/** Чего не хватает записи: пустое обязательное поле или решение о чужой дате (`conflict`). */
export type Missing = DraftField | 'conflict';

// ---------- друг по имени из заметки ----------

const low = (s: string) => s.toLowerCase().replace(/ё/g, 'е').trim();
const tokens = (s: string) => low(s).split(/[^a-zа-я0-9]+/).filter(Boolean);

/** Падежные формы имени: «Катя» — «Кати», «Кате», «Катю»; «Олег» — «Олега», «Олегу»; «Игорь» — «Игоря», «Игорю». */
function nameForms(name: string): string[] {
  const last = name.slice(-1);
  const stem = name.slice(0, -1);
  if (last === 'а') return [name, ...['ы', 'и', 'е', 'у', 'ой', 'ей'].map((e) => stem + e)];
  if (last === 'я') return [name, ...['и', 'е', 'ю', 'ей'].map((e) => stem + e)];
  if (last === 'ь' || last === 'й') return [name, ...['я', 'ю', 'ем', 'е', 'и'].map((e) => stem + e)];
  if (/[бвгджзклмнпрстфхцчшщ]/.test(last)) return [name, ...['а', 'у', 'ом', 'е'].map((e) => name + e)];
  return [name];
}

/** То же имя с поправкой на падеж: «Кате» и «Катя» — да; «Оля» и «Олег», «Аня» и «Анна», «Лена» и «Лёня» — нет. */
const sameName = (said: string, friend: string) => nameForms(friend).includes(said);

/**
 * Друзья, которых может означать имя из заметки. Модель называет человека так, как он назван в тексте («Аня»,
 * «Мама»), — сверяем со словами имени друга. Сокращения («Аня» — «Анна») не угадываем: ошибиться другом хуже,
 * чем спросить.
 */
export function friendsByName(name: string | null, friends: readonly Friend[]): Friend[] {
  const who = tokens(name ?? '');
  if (!who.length) return [];
  const full = friends.filter((f) => low(f.name) === low(name ?? ''));
  if (full.length) return full;
  return friends.filter((f) => {
    const parts = tokens(f.name);
    return who.every((w) => parts.some((p) => sameName(w, p)));
  });
}

/** Друг для записи: единственный подходящий. Подходит несколько — никого: выберет человек. */
export function matchFriend(name: string | null, friends: readonly Friend[]): string | null {
  const found = friendsByName(name, friends);
  return found.length === 1 ? found[0].id : null;
}

const sameDay = (a: ISODate, b: ISODate) => a.slice(5) === b.slice(5);

// ---------- список ----------

export function createReview(answer: NoteAnswer, friends: readonly Friend[], makeId: () => string): ReviewItem[] {
  return answer.drafts.map((draft) => {
    const friendId = matchFriend(draft.person, friends);
    const known = friends.find((f) => f.id === friendId)?.birthday ?? null;
    return { id: makeId(), draft, state: 'todo' as const, friendId, to: friendId ? ('friend' as const) : ('new' as const), known };
  });
}

/** Запись из куска заметки, который в дела не вошёл («Сделать делом»): название — сам кусок, остальное заполнит человек. */
export function itemFromRest(text: string, makeId: () => string): ReviewItem {
  const title = text.replace(/^[\s«"'(\-–—•*\d.)]+|[\s»"').,;:!?]+$/g, '').replace(/\s+/g, ' ');
  const draft: NoteDraft = {
    type: 'task', title: title ? title[0].toUpperCase() + title.slice(1) : '', quote: text, kind: 'due', date: null, time: null, repeat: null, person: null, note: '',
    sure: true, check: [], missing: ['date'],
  };
  return { id: makeId(), draft, state: 'todo', friendId: null, to: 'new' };
}

/** Чего не хватает, чтобы запись можно было добавить. */
export function missingOf(item: ReviewItem): Missing[] {
  const d = item.draft;
  const out: Missing[] = [];
  if (d.type === 'task') {
    if (!d.title.trim()) out.push('title');
    if (d.kind === 'repeat' && !d.repeat) out.push('repeat');
    if (!d.date) out.push('date');
    return out;
  }
  if (!d.date) out.push('date');
  if (d.type === 'date' && !d.title.trim()) out.push('title');
  // В карточку — нужен друг; новым другом или напоминанием — хотя бы имя.
  if (item.to === 'friend' ? !item.friendId : !(d.person ?? '').trim()) out.push('person');
  // У друга записан другой день рождения: чужую запись молча не меняем — нужно решение.
  if (birthdayConflict(item) && !item.replace) out.push('conflict');
  return out;
}

export const canAdd = (item: ReviewItem) => missingOf(item).length === 0;

const update = (items: readonly ReviewItem[], id: string, change: (item: ReviewItem) => ReviewItem) => items.map((i) => (i.id === id ? change(i) : i));

/** Решение по записи. «Добавить» неполную запись нельзя — она остаётся на проверке. */
export function decide(items: readonly ReviewItem[], id: string, state: ReviewState): ReviewItem[] {
  return update(items, id, (i) => (state === 'add' && !canAdd(i) ? i : { ...i, state }));
}

/** Что можно поправить в записи: поля дела и то, к кому и куда она относится. */
export type ItemPatch = Partial<Pick<NoteDraft, 'title' | 'date' | 'time' | 'repeat' | 'kind' | 'note' | 'person'>> & Partial<Pick<ReviewItem, 'friendId' | 'to' | 'replace' | 'known'>>;

/**
 * Правка записи. Поле заполнил человек — оно больше не «проверь». Запись «добавить» после правки стала неполной —
 * возвращается на проверку.
 */
export function editItem(items: readonly ReviewItem[], id: string, patch: ItemPatch): ReviewItem[] {
  return update(items, id, (i) => {
    const { friendId, to, replace, known, ...fields } = patch;
    const touched = Object.keys(fields) as DraftField[];
    let draft: NoteDraft = { ...i.draft, ...fields, check: i.draft.check.filter((f) => !touched.includes(f) && !(f === 'person' && friendId !== undefined)) };
    // Повтор выбран — это повторяющееся дело; повтор сняли — обычное дело до срока.
    if ('repeat' in fields) draft = { ...draft, kind: fields.repeat ? 'repeat' : draft.kind === 'repeat' ? 'due' : draft.kind };
    if (fields.kind && fields.kind !== 'repeat') draft = { ...draft, repeat: null };
    // Сменили друга — решение «заменить его день рождения» относилось к прежнему.
    const next: ReviewItem = {
      ...i, draft, ...(friendId !== undefined && { friendId, known: known ?? null, replace: false }), ...(to !== undefined && { to }), ...(replace !== undefined && { replace }),
    };
    return next.state === 'add' && !canAdd(next) ? { ...next, state: 'todo' } : next;
  });
}

/** Записи на проверке, которым не хватает только срока: им можно поставить один срок разом. */
export const withoutDate = (items: readonly ReviewItem[]) => items.filter((i) => i.state === 'todo' && i.draft.type === 'task' && !i.draft.date);

/** «Поставить всем»: срок — каждой записи на проверке, у которой его нет. Решения остаются за человеком. */
export function setDateForAll(items: readonly ReviewItem[], date: ISODate): ReviewItem[] {
  const ids = new Set(withoutDate(items).map((i) => i.id));
  return items.map((i) => (ids.has(i.id) ? { ...i, draft: { ...i.draft, date, check: i.draft.check.filter((f) => f !== 'date') } } : i));
}

export interface ReviewSections {
  todo: ReviewItem[];
  add: ReviewItem[];
  skip: ReviewItem[];
}

/** Разделы списка — в порядке заметки внутри каждого. */
export function sectionsOf(items: readonly ReviewItem[]): ReviewSections {
  return { todo: items.filter((i) => i.state === 'todo'), add: items.filter((i) => i.state === 'add'), skip: items.filter((i) => i.state === 'skip') };
}

/** Станет делом (в «Напоминаниях»), а не датой в карточке друга. */
const asReminder = (i: ReviewItem) => i.draft.type === 'task' || i.to === 'reminder';

/** Сколько чего добавится: дела и даты людей. */
export function addCounts(items: readonly ReviewItem[]): { tasks: number; dates: number } {
  const add = items.filter((i) => i.state === 'add');
  return { tasks: add.filter(asReminder).length, dates: add.filter((i) => !asReminder(i)).length };
}

const tasksWord = (n: number) => `${n} ${plural(n, 'дело', 'дела', 'дел')}`;
const datesWord = (n: number) => `${n} ${plural(n, 'дату', 'даты', 'дат')}`;

/** Подпись нижней кнопки: пока есть записи на проверке — сколько осталось; иначе — что добавится. */
export function buttonLabel(items: readonly ReviewItem[]): { text: string; ready: boolean } {
  const left = items.filter((i) => i.state === 'todo').length;
  if (left) return { text: `Осталось проверить ${left}`, ready: false };
  const { tasks, dates } = addCounts(items);
  if (!tasks && !dates) return { text: 'Добавлять нечего', ready: false };
  return { text: `Добавить ${[tasks ? tasksWord(tasks) : '', dates ? datesWord(dates) : ''].filter(Boolean).join(' и ')}`, ready: true };
}

/** «Добавлено 6 дел» и «и день рождения Кати» — для плашки после добавления. */
export function addedText(items: readonly ReviewItem[]): string {
  const { tasks, dates } = addCounts(items);
  const done = (n: number) => plural(n, 'Добавлено', 'Добавлены', 'Добавлено');
  if (tasks && dates) return `${done(tasks)} ${tasksWord(tasks)} и ${dates} ${plural(dates, 'дата', 'даты', 'дат')}`;
  if (tasks) return `${done(tasks)} ${tasksWord(tasks)}`;
  return `${plural(dates, 'Добавлена', 'Добавлены', 'Добавлено')} ${dates} ${plural(dates, 'дата', 'даты', 'дат')}`;
}

// ---------- перевод в дела ----------

/** День и месяц без года: так в приложении хранится день рождения, когда год неизвестен. */
const yearless = (date: ISODate): ISODate => `${UNKNOWN_YEAR}-${date.slice(5)}`;
const YEARLY: Repeat = { every: 1, unit: 'year' };

/** У друга уже записан другой день рождения — какой. Нет или тот же — null. */
export function birthdayConflict(item: ReviewItem): ISODate | null {
  if (item.draft.type !== 'birthday' || item.to !== 'friend' || !item.friendId || !item.draft.date) return null;
  return item.known && !sameDay(item.known, item.draft.date) ? item.known : null;
}

export interface ReviewContext {
  friends: readonly Friend[];
  reminders: readonly Reminder[];
  today: ISODate;
  now: number;
  /** Во сколько напоминать о датах людей (настройка приложения). */
  eventTime: TimeOfDay;
  makeId: () => string;
}

/** Что изменится в данных — и что вернуть на место при «Отменить». */
export interface ReviewChanges {
  reminders: Reminder[];
  /** Новые друзья. */
  friends: Friend[];
  /** Друзья с новой датой — уже изменённые. */
  updated: Friend[];
  /** Те же друзья, какими они были до изменения. */
  before: Friend[];
}

const NEW_FRIEND = { emoji: '🙂', phone: '', food: '', flowers: '', gifts: '', notes: '' };

/**
 * Записи «добавить» → дела и даты друзей. Время не названо — привычное для такого дела; «заранее» — привычное
 * (у встречи без привычки — за день). Повтор по дням недели встаёт на ближайший из своих дней.
 */
export function buildChanges(items: readonly ReviewItem[], ctx: ReviewContext): ReviewChanges {
  const out: ReviewChanges = { reminders: [], friends: [], updated: [], before: [] };
  const patched = new Map<string, Friend>();
  const friendOf = (id: string | null) => (id ? (patched.get(id) ?? ctx.friends.find((f) => f.id === id)) : undefined);
  const patch = (friend: Friend, next: Friend) => {
    if (!patched.has(friend.id)) out.before.push(friend);
    patched.set(friend.id, next);
  };

  for (const item of items) {
    if (item.state !== 'add' || !canAdd(item)) continue;
    const d = item.draft;
    const date = d.date as ISODate;
    const friend = friendOf(item.friendId);

    if (d.type === 'task') {
      const kind: TaskKind = d.kind === 'repeat' && d.repeat ? 'repeat' : d.kind === 'at' ? 'at' : 'due';
      const habit = { kind, title: d.title, friendName: friend?.name };
      const adv = usualAdvance(ctx.reminders, ctx.friends, habit) ?? { advances: kind === 'at' ? [1440] : [], daily: false };
      const repeat = kind === 'repeat' ? d.repeat : null;
      out.reminders.push({
        id: ctx.makeId(),
        title: d.title.trim(),
        note: d.note,
        friendId: friend?.id ?? null,
        date: snapToRepeat(date < ctx.today && repeat ? ctx.today : date, repeat),
        time: d.time ?? timeSuggestions(ctx.reminders, ctx.friends, habit).usual ?? DEFAULT_TIME,
        repeat,
        ...storeAdvances(kind, adv.advances, kind === 'due' && adv.daily),
        ...(kind === 'at' ? { kind: 'at' as const } : {}),
        done: false,
        createdAt: ctx.now,
      });
      continue;
    }

    const name = (d.person ?? '').trim();
    const what = d.type === 'birthday' ? 'День рождения' : d.title.trim();
    if (item.to === 'reminder') {
      out.reminders.push({
        id: ctx.makeId(), title: name ? `${what}: ${name}` : what, note: '', friendId: friend?.id ?? null, date: nextAnniversary(date, ctx.today), time: ctx.eventTime,
        repeat: YEARLY, advance: 0, done: false, createdAt: ctx.now,
      });
    } else if (item.to === 'new' || !friend) {
      out.friends.push({
        ...NEW_FRIEND, id: ctx.makeId(), name, createdAt: ctx.now,
        birthday: d.type === 'birthday' ? yearless(date) : null,
        dates: d.type === 'date' ? [{ id: ctx.makeId(), title: what, date, yearly: true }] : [],
      });
    } else if (d.type === 'birthday') {
      // Чужую запись молча не трогаем: другой день рождения меняем только по явному решению.
      if (!friend.birthday || item.replace) patch(friend, { ...friend, birthday: friend.birthday && hasYear(friend.birthday) && sameDay(friend.birthday, date) ? friend.birthday : yearless(date) });
    } else if (!friend.dates.some((x) => low(x.title) === low(what) && sameDay(x.date, date))) {
      patch(friend, { ...friend, dates: [...friend.dates, { id: ctx.makeId(), title: what, date, yearly: true }] });
    }
  }
  out.updated = [...patched.values()];
  return out;
}

// ---------- подписи строки ----------

/** Сколько дней до срока — для кольца слева: число и слово. Сегодня — «0 дней» не пишем: «сегодня». */
export function daysLeft(date: ISODate, today: ISODate): { n: number; unit: string } {
  const n = daysBetween(today, date);
  return { n, unit: plural(Math.abs(n), 'день', 'дня', 'дн') };
}

/** День рождения словами: «14 февраля». */
export const dayMonth = (date: ISODate) => formatDate(date, false);
