import { withoutName } from './calendarAi';
import type { Advance, Friend, Reminder, Repeat, TimeOfDay } from './types';

/**
 * «Умные» подсказки в форме дела: время, «заранее» и шаблоны названий — по тому, как человек уже заводил дела.
 * Всё считается на телефоне из самих дел: ни отдельного журнала, ни сети, ни магии.
 *
 * Правила:
 * - частота × свежесть: каждое дело даёт очко, очко тает вдвое за `HALF_LIFE_DAYS`;
 * - не с первого раза: один случай — ещё не привычка, нужно хотя бы два;
 * - порядок не скачет: время показываем по часам, меняется набор и выбор, а не места;
 * - сначала ближний круг: если дел с таким же названием хватает — смотрим на них; иначе — на дела того же вида,
 *   а дела другого вида подсказывают слабее.
 */

/** Какое это дело: сделать до срока, на дату и время или повторять. */
export type TaskKind = 'due' | 'at' | 'repeat';

export function kindOf(r: Pick<Reminder, 'repeat' | 'kind'>): TaskKind {
  return r.repeat ? 'repeat' : r.kind === 'at' ? 'at' : 'due';
}

/** За сколько дней вес дела падает вдвое. */
export const HALF_LIFE_DAYS = 45;
/** Меньше двух дел — ещё не привычка. */
const MIN_USES = 2;
/** Привычка, которой давно не пользовались, перестаёт подсказываться. */
const MIN_SCORE = 0.3;
/** Дела другого вида тоже подсказывают время, но слабее. */
const OTHER_KIND = 0.3;
/** Сколько «своих» значений показываем рядом со стандартными. */
const MAX_OWN_TIMES = 3;
const MAX_TIME_CHIPS = 6;

/** Стандартное время — по убыванию полезности: что останется, когда место займут «свои» значения. */
const DEFAULT_TIMES: TimeOfDay[] = ['10:00', '19:00', '12:00', '09:00', '15:00'];
export const DEFAULT_TIME: TimeOfDay = '10:00';

const DAY = 86_400_000;

function weight(r: Pick<Reminder, 'createdAt' | 'repeat'>, now: number): number {
  // Старые записи без даты создания считаем давними, но не выбрасываем.
  const fresh = r.createdAt > 0 ? Math.pow(0.5, Math.max(0, now - r.createdAt) / DAY / HALF_LIFE_DAYS) : 0.25;
  // Повторяющееся дело заведено давно, но живёт каждый день — привычка не устарела.
  return r.repeat ? Math.max(fresh, 0.5) : fresh;
}

/** Название для сравнения: без имени друга, регистра, лишних пробелов и знаков в конце. */
export function titleKey(title: string, friendName?: string): string {
  const bare = friendName ? withoutName(title, friendName) || title : title;
  return bare
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .replace(/[\s.!?…,;:—–-]+$/, '')
    .trim();
}

interface Tally<T> {
  value: T;
  score: number;
  uses: number;
}

/** Самые весомые значения: очки и число дел по каждому. */
function tally<T>(items: readonly { value: T; weight: number }[], key: (v: T) => string): Tally<T>[] {
  const map = new Map<string, Tally<T>>();
  for (const { value, weight: w } of items) {
    const k = key(value);
    const cur = map.get(k);
    if (cur) {
      cur.score += w;
      cur.uses++;
    } else map.set(k, { value, score: w, uses: 1 });
  }
  return [...map.values()].sort((a, b) => b.score - a.score);
}

export interface HabitContext {
  kind: TaskKind;
  /** Название в форме: дела с таким же названием весят больше. */
  title?: string;
  /** Имя друга, для которого дело: в названиях из шаблонов оно дописано в конце. */
  friendName?: string;
}

export interface TimeSuggestions {
  /** Что показать в ленте — по порядку часов. */
  chips: TimeOfDay[];
  /** Какие из них — «свои» (по привычке), а не стандартные. */
  own: TimeOfDay[];
  /** Самое привычное время: его ставим в новое дело. Привычки нет — null. */
  usual: TimeOfDay | null;
}

/** Дела с таким же названием, как в форме (без учёта имени друга, регистра и знаков). */
function sameTitle(reminders: readonly Reminder[], friends: readonly Friend[], ctx: HabitContext): Reminder[] {
  const key = ctx.title ? titleKey(ctx.title, ctx.friendName) : '';
  if (!key) return [];
  const names = new Map(friends.map((f) => [f.id, f.name]));
  return reminders.filter((r) => titleKey(r.title, r.friendId ? names.get(r.friendId) : undefined) === key);
}

const habit = <T>(t: Tally<T>) => t.uses >= MIN_USES && t.score >= MIN_SCORE;

/** Время для ленты: два-три «своих» частых значения вместе со стандартными. */
export function timeSuggestions(reminders: readonly Reminder[], friends: readonly Friend[], ctx: HabitContext, now = Date.now()): TimeSuggestions {
  // Ближний круг — дела с таким же названием; дальше — все дела, свои по виду весят больше.
  const near = tally(sameTitle(reminders, friends, ctx).map((r) => ({ value: r.time, weight: weight(r, now) })), (t) => t).filter(habit);
  const wide = tally(reminders.map((r) => ({ value: r.time, weight: weight(r, now) * (kindOf(r) === ctx.kind ? 1 : OTHER_KIND) })), (t) => t).filter(habit);
  const own = [...new Set([...near, ...wide].map((t) => t.value))].slice(0, MAX_OWN_TIMES);
  const chips = [...new Set([...own, ...DEFAULT_TIMES])].slice(0, MAX_TIME_CHIPS).sort();
  return { chips, own: [...own].sort(), usual: own[0] ?? null };
}

export interface AdvanceChoice {
  advance: Advance;
  daily: boolean;
}

/**
 * Привычное «заранее» для дел «до срока»: что человек выбирает чаще всего — если это правда привычка
 * (не меньше двух дел и больше половины веса). Иначе null: оставляем «Нет».
 */
export function usualAdvance(reminders: readonly Reminder[], friends: readonly Friend[], ctx: HabitContext, now = Date.now()): AdvanceChoice | null {
  if (ctx.kind !== 'due') return null;
  const due = (list: readonly Reminder[]) => list.filter((r) => kindOf(r) === 'due');
  const top = (list: readonly Reminder[]) => {
    const ranked = tally(
      list.map((r) => ({ value: { advance: r.daily ? 0 : r.advance, daily: !!r.daily } as AdvanceChoice, weight: weight(r, now) })),
      (c) => (c.daily ? 'daily' : String(c.advance)),
    );
    const total = ranked.reduce((sum, t) => sum + t.score, 0);
    return ranked[0] && habit(ranked[0]) && ranked[0].score > total / 2 ? ranked[0].value : null;
  };
  // Сначала — дела с таким же названием, потом — все дела «до срока».
  return top(due(sameTitle(reminders, friends, ctx))) ?? top(due(reminders));
}

export interface TitleTemplate {
  /** Ключ для сравнения (см. `titleKey`). */
  key: string;
  /** Что написано на таблетке: название без имени друга. */
  label: string;
  /** Что подставить в название. */
  title: string;
  /** «Свой» шаблон — из повторявшихся дел; у него есть привычные время и остальное. */
  own: boolean;
  time?: TimeOfDay;
  kind?: TaskKind;
  repeat?: Repeat | null;
  advance?: Advance;
  daily?: boolean;
  /** Для кого: если дело всегда было для одного и того же человека. */
  friendId?: string | null;
}

const BUILT_IN_FRIEND = ['Написать', 'Позвонить', 'Купить цветы', 'Встретиться', 'Выбрать подарок'];
const BUILT_IN_PERSONAL = ['Оплатить счета', 'Записаться к врачу', 'Сдать проект'];
const MAX_OWN_TEMPLATES = 3;

/**
 * Шаблоны названий: сначала «свои» — названия, которые повторялись два раза и больше, с привычным временем,
 * «заранее» и человеком; за ними — стандартные. `friend` — дело заводят для этого друга.
 */
export function titleTemplates(reminders: readonly Reminder[], friends: readonly Friend[], friend: Friend | undefined, now = Date.now()): TitleTemplate[] {
  const byId = new Map(friends.map((f) => [f.id, f]));
  const groups = new Map<string, Reminder[]>();
  for (const r of reminders) {
    const key = titleKey(r.title, r.friendId ? byId.get(r.friendId)?.name : undefined);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  const own: (TitleTemplate & { score: number })[] = [];
  for (const [key, list] of groups) {
    if (list.length < MIN_USES) continue;
    const score = list.reduce((sum, r) => sum + weight(r, now), 0);
    if (score < MIN_SCORE) continue;
    const latest = list.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
    const latestFriend = latest.friendId ? byId.get(latest.friendId) : undefined;
    const label = (latestFriend ? withoutName(latest.title, latestFriend.name) : '') || latest.title.trim();
    const people = new Set(list.map((r) => r.friendId));
    const withFriends = list.some((r) => r.friendId);
    // Имя друга вписано в само название («Позвонить — Игорь», «Позвонить маме»): другому другу подставим его имя.
    const named = list.some((r) => r.friendId && titleKey(r.title) !== key);
    const onlyFriend = people.size === 1 ? latest.friendId : null;

    let title: string;
    let chip = label;
    let friendId: string | null;
    if (friend) {
      // Дело для друга: личные дела сюда не подсказываем.
      if (!withFriends) continue;
      title = named ? `${label} — ${friend.name}` : label;
      friendId = friend.id;
    } else if (onlyFriend) {
      // Дело всегда было для одного человека — подставим и его, и название как было («Позвонить маме»).
      title = chip = latest.title.trim();
      friendId = onlyFriend;
    } else {
      title = label;
      friendId = null;
    }

    const w = (r: Reminder) => weight(r, now);
    const kind = tally(list.map((r) => ({ value: kindOf(r), weight: w(r) })), (k) => k)[0].value;
    const time = tally(list.map((r) => ({ value: r.time, weight: w(r) })), (t) => t)[0].value;
    const due = list.filter((r) => kindOf(r) === 'due');
    const adv = due.length ? tally(due.map((r) => ({ value: { advance: r.daily ? 0 : r.advance, daily: !!r.daily }, weight: w(r) })), (c) => (c.daily ? 'daily' : String(c.advance)))[0].value : null;
    const repeats = list.filter((r) => r.repeat).sort((a, b) => b.createdAt - a.createdAt);
    own.push({
      key,
      label: chip,
      title,
      own: true,
      time,
      kind,
      repeat: kind === 'repeat' ? (repeats[0]?.repeat ?? null) : null,
      advance: kind === 'due' && adv ? (adv.advance as Advance) : 0,
      daily: kind === 'due' && !!adv?.daily,
      friendId,
      score,
    });
  }
  own.sort((a, b) => b.score - a.score);
  const top: TitleTemplate[] = own.slice(0, MAX_OWN_TEMPLATES).map(({ score: _score, ...t }) => t);

  const taken = new Set(top.map((t) => t.key));
  const builtIn = (friend ? BUILT_IN_FRIEND : BUILT_IN_PERSONAL)
    .filter((t) => !taken.has(titleKey(t)))
    .map((t): TitleTemplate => ({ key: titleKey(t), label: t, title: friend ? `${t} — ${friend.name}` : t, own: false }));
  return [...top, ...builtIn];
}
