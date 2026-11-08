import { TASK_PROVIDERS } from './ai/tasks';
import { extractJson } from './ai/providers';
import type { AiRunner, AiTask } from './ai/types';
import { NETWORKS, SITE, linkFromInput, mergeLinks, networkById, parseSocialInput } from './socials';
import type { Friend, SocialLink } from './types';

/**
 * Соцсети и первые записи о друге — из его заметок и «О себе» из Telegram, силами ИИ.
 *
 * ИИ получает тексты пачкой и по каждому возвращает: ссылки и ники человека (сеть — из нашего каталога), тот же текст
 * без того, что было только ради ссылок, и подсказки для карточки (еда, цветы, идеи подарков), если о них сказано прямо.
 * Ответу не верим на слово: ник и адрес должны буквально встречаться в тексте; очищенный текст не может добавить слов
 * и выкинуть заметно больше, чем ссылки; подсказка должна опираться на слова из текста. Не прошло проверку — эту часть
 * ответа не берём, остальное берём.
 *
 * Модуль самостоятельный: его зовут при импорте из Telegram (в фоне, для новых друзей) и из меню магии (для всех,
 * чьи заметки ещё не разобраны). Что уже разобрано, помнится по отпечатку текста (`notesSeen`): поменял заметку —
 * её можно разобрать снова.
 */

/** Сколько текстов и символов в одном вопросе. */
export const NOTES_BATCH = { items: 15, chars: 6000 };
/** Длиннее — отправляем начало, но текст не чистим: конец ИИ не видел. */
export const NOTES_MAX_TEXT = 2000;
/** Сколько друзей за один проход: остальные — в следующий раз. */
export const NOTES_PASS_LIMIT = 150;
const FACT_MAX = 160;

export type NotesFact = 'food' | 'flowers' | 'gifts';
export const NOTES_FACTS: NotesFact[] = ['food', 'flowers', 'gifts'];

/** Ссылка, как её назвал ИИ, — до проверки. */
export interface RawNotesLink {
  network: string;
  handle?: string;
  url?: string;
}

/** Ответ ИИ по одному тексту — уже проверенный. */
export interface NotesAnswer {
  links: RawNotesLink[];
  /** Текст без ссылок; null — очистку не берём (не прошла проверку или текст был обрезан). */
  rest: string | null;
  facts: Partial<Record<NotesFact, string>>;
}

// ---------- Вопрос ----------

const CATALOG = NETWORKS.map((n) => (n.name.toLowerCase() === n.id ? n.id : `${n.id} (${n.name})`)).join(', ');

export const NOTES_RULES = [
  'Ты помогаешь вести записную книжку о друзьях. Тебе дают тексты о людях: раздел «О себе» из Telegram и заметки. По каждому тексту верни три вещи.',
  '',
  '1. links — соцсети, мессенджеры, сайты и ники ЭТОГО человека, которые указаны в тексте: ссылки (https://…, instagram.com/…, t.me/…), подписи с ником («inst: anya», «тг — @anya», «вк anya_s», «мой ютуб: …»), отдельные @ники.',
  '   network — id сети из списка ниже; любой другой сайт — "site". handle — ник ровно как в тексте, без @. url — адрес ровно как в тексте, если он есть.',
  '   Ничего не придумывай и не достраивай: каждый ник и адрес должен встречаться в тексте буквально. Не бери почту, телефоны, номера карт и кошельков, а также ссылки на чужие страницы, магазины и сервисы, если по тексту это не страница самого человека. Ник без названия сети (просто @anya) — это Telegram.',
  '2. rest — исходный текст, из которого убрано то, что было только ради ссылок: сами ссылки и ники, подписи к ним («inst:», «мой канал:», «пишите в лс»), призывы подписаться, разделители и эмодзи, оставшиеся без слов. Всё остальное оставь слово в слово: не переписывай, не сокращай, не исправляй ошибки, не переводи; порядок и переносы строк сохрани. Ссылок не было — верни текст без изменений. Ничего не осталось — "".',
  '3. facts — только если в тексте прямо сказано то, что пригодится для подарка: food — любимая еда и напитки, что человек не ест; flowers — любимые цветы; gifts — увлечения и то, что человек любит или собирает. Коротко, через запятую. Такого нет — поле не пиши.',
  '',
  `Сети: ${CATALOG}.`,
  '',
  'Ответ — только JSON без пояснений, по одному элементу на каждый текст, i — номер текста:',
  '{"items":[{"i":0,"links":[{"network":"instagram","handle":"anya.photo"}],"rest":"Фотограф из Казани","facts":{"gifts":"фотография, горы"}}]}',
].join('\n');

export function notesPrompt(texts: string[]): string {
  return `${NOTES_RULES}\n\nТексты (JSON):\n${JSON.stringify(texts.map((text, i) => ({ i, text: text.slice(0, NOTES_MAX_TEXT) })))}`;
}

// ---------- Проверка ответа ----------

const words = (s: string) => (s.toLowerCase().replace(/ё/g, 'е').match(/[\p{L}\p{N}]+/gu) ?? []) as string[];
/** Адрес для сравнения: без схемы, www. и косой черты в конце. */
const bareUrl = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '');
const KNOWN = new Set([...NETWORKS.map((n) => n.id), SITE.id]);
const HANDLE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$/;

/** Ссылки из ответа — только те, что буквально есть в тексте. */
function checkLinks(raw: unknown, text: string): RawNotesLink[] {
  if (!Array.isArray(raw)) return [];
  const low = text.toLowerCase();
  const bareText = low.replace(/[a-z][a-z0-9+.-]*:\/\//g, '').replace(/(^|[^\w])www\./g, '$1');
  const out: RawNotesLink[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const network = typeof r.network === 'string' ? r.network.trim().toLowerCase() : '';
    const handle = typeof r.handle === 'string' ? r.handle.trim().replace(/^@/, '') : '';
    const url = typeof r.url === 'string' ? r.url.trim() : '';
    // Адрес есть в тексте и это не хвост почты («anya@mail.ru» — не сайт mail.ru).
    const urlOk = !!url && bareUrl(url).length >= 4 && new RegExp(`(^|[^@\\w.-])${escapeRe(bareUrl(url))}`).test(bareText);
    const handleOk = !!handle && HANDLE.test(handle) && low.includes(handle.toLowerCase());
    if (!urlOk && !(handleOk && KNOWN.has(network) && network !== SITE.id)) continue;
    // Почта — не соцсеть: «anya@mail.ru» даёт и ник, и домен.
    if (handleOk && !urlOk && new RegExp(`${escapeRe(handle.toLowerCase())}@[a-z0-9-]+\\.`).test(low)) continue;
    out.push({ network: KNOWN.has(network) ? network : SITE.id, ...(handleOk && { handle }), ...(urlOk && { url }) });
  }
  return out;
}

const escapeRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Очищенный текст годится, если он не добавил ни одного слова и выкинул немного сверх ссылок и ников: ИИ мог
 * «подчистить» и живой текст — тогда заметку не трогаем.
 */
export function restIsSafe(text: string, rest: string, links: RawNotesLink[]): boolean {
  if (rest.length > text.length + 2) return false;
  const source = new Set(words(text));
  const kept = words(rest);
  if (kept.some((w) => !source.has(w))) return false;
  const inLinks = new Set(links.flatMap((l) => words(`${l.handle ?? ''} ${l.url ?? ''}`)));
  const keptSet = new Set(kept);
  const all = words(text);
  const dropped = all.filter((w) => !keptSet.has(w) && !inLinks.has(w)).length;
  return dropped <= 8 + Math.floor(all.length * 0.25);
}

/** Подсказка для карточки опирается на текст: хотя бы одно слово из неё (по первым четырём буквам) есть в тексте. */
function grounded(fact: string, text: string): boolean {
  const stems = new Set(words(text).filter((w) => w.length >= 3).map((w) => w.slice(0, 4)));
  return words(fact).some((w) => w.length >= 3 && stems.has(w.slice(0, 4)));
}

/** Наша же подпись «О себе:», после которой ничего не осталось, — тоже мусор. */
export function tidyRest(rest: string): string {
  return rest
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/g, ''))
    .filter((l) => !/^\s*О себе:\s*$/i.test(l))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Ответ ИИ → проверенные ответы по номерам текстов. null — ответ не разобрать (модуль ИИ спросит другую модель). */
export function parseNotesAnswer(text: string, texts: string[]): Map<number, NotesAnswer> | null {
  const json = extractJson(text);
  const obj = json && typeof json === 'object' && !Array.isArray(json) ? (json as Record<string, unknown>) : null;
  const list = Array.isArray(json) ? json : (obj?.items ?? obj?.answers ?? obj?.result);
  if (!Array.isArray(list)) return null;
  const out = new Map<number, NotesAnswer>();
  for (const item of list as Record<string, unknown>[]) {
    if (!item || typeof item !== 'object') continue;
    const i = typeof item.i === 'number' ? item.i : typeof item.i === 'string' ? Number(item.i) : NaN;
    if (!Number.isInteger(i) || i < 0 || i >= texts.length || out.has(i)) continue;
    const source = texts[i];
    const links = checkLinks(item.links, source);
    const rawRest = typeof item.rest === 'string' ? item.rest : null;
    const whole = source.length <= NOTES_MAX_TEXT;
    const rest = whole && rawRest !== null && restIsSafe(source, rawRest, links) ? tidyRest(rawRest) : null;
    const facts: NotesAnswer['facts'] = {};
    const rawFacts = item.facts && typeof item.facts === 'object' ? (item.facts as Record<string, unknown>) : {};
    for (const k of NOTES_FACTS) {
      const v = rawFacts[k];
      if (typeof v !== 'string') continue;
      const t = v.trim().replace(/\s+/g, ' ');
      if (t && t.length <= FACT_MAX && grounded(t, source)) facts[k] = t;
    }
    out.set(i, { links, rest, facts });
  }
  return out;
}

/** Задача «соцсети и записи из текста» для модуля ИИ. */
export const NOTES_TASK: AiTask<string[], Map<number, NotesAnswer>> = {
  id: 'notes',
  providers: TASK_PROVIDERS.notes,
  request: (texts) => ({
    prompt: notesPrompt(texts),
    json: true,
    temperature: 0,
    maxTokens: 600 + texts.reduce((n, t) => n + Math.min(t.length, NOTES_MAX_TEXT), 0),
  }),
  parse: (text, texts) => parseNotesAnswer(text, texts),
};

// ---------- Ссылки для приложения ----------

/** Ссылка из ответа → ссылка приложения: адрес разбираем по каталогу (домен главнее названия сети), ник — по сети. */
export function toSocialLink(raw: RawNotesLink, id: string): SocialLink | null {
  if (raw.url) {
    const parsed = parseSocialInput(raw.url);
    const link = linkFromInput(parsed, null, id, 'notes');
    if (link) {
      // Ник из ответа пригодится, если по адресу его не понять.
      if (!link.handle && raw.handle && link.network !== SITE.id && link.network === raw.network) link.handle = raw.handle;
      return link;
    }
  }
  if (raw.handle && raw.network !== SITE.id) {
    const n = networkById(raw.network);
    if (n.id === SITE.id) return null;
    return { id, network: n.id, url: n.profile ? n.profile(raw.handle) : '', handle: raw.handle, source: 'notes' };
  }
  return null;
}

// ---------- Проход по друзьям ----------

export type NotesSubject = Pick<Friend, 'id' | 'notes' | 'food' | 'flowers' | 'gifts' | 'socials' | 'notesSeen' | 'notesQueue'>;

/** Отпечаток текста заметки (FNV-1a): разобранный текст второй раз не отправляем. */
export function notesHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${text.length.toString(36)}-${h.toString(36)}`;
}

/** Ждёт разбора: заметка есть и с тех пор не разбиралась; в фоне — только те, кого поставили в очередь (импорт). */
export function notesPending(f: NotesSubject, mode: 'queued' | 'all'): boolean {
  if (!f.notes.trim() || f.notesSeen === notesHash(f.notes)) return false;
  return mode === 'all' || !!f.notesQueue;
}

export interface NotesUpdate {
  id: string;
  /** Заметка на момент вопроса: поменяли, пока ИИ думал, — изменение не применяем. */
  before: string;
  notes: string;
  links: SocialLink[];
  facts: Partial<Record<NotesFact, string>>;
}

export interface NotesPassResult {
  updates: NotesUpdate[];
  /** ИИ недоступен (нет сети, ключей, все на паузе) — остальных разберём в следующий раз. */
  unavailable: boolean;
}

/** Пачки по числу текстов и символов. */
export function notesBatches<T extends { notes: string }>(list: T[]): T[][] {
  const out: T[][] = [];
  let cur: T[] = [];
  let chars = 0;
  for (const f of list) {
    const len = Math.min(f.notes.length, NOTES_MAX_TEXT);
    if (cur.length && (cur.length >= NOTES_BATCH.items || chars + len > NOTES_BATCH.chars)) {
      out.push(cur);
      cur = [];
      chars = 0;
    }
    cur.push(f);
    chars += len;
  }
  if (cur.length) out.push(cur);
  return out;
}

/**
 * Один проход: друзья, чьи заметки ждут разбора, — пачками к ИИ. Возвращает изменения; ничего не сохраняет сам.
 * Ответил, но не по делу — заметку считаем разобранной (второй раз тот же текст не спрашиваем).
 */
export async function notesPass(friends: NotesSubject[], ai: AiRunner, opts: { mode: 'queued' | 'all'; idFor: () => string; limit?: number }): Promise<NotesPassResult> {
  const todo = friends.filter((f) => notesPending(f, opts.mode)).slice(0, opts.limit ?? NOTES_PASS_LIMIT);
  const updates: NotesUpdate[] = [];
  for (const batch of notesBatches(todo)) {
    const texts = batch.map((f) => f.notes);
    const result = await ai.run(NOTES_TASK, texts).catch(() => null);
    if (!result || result.status === 'unavailable') return { updates, unavailable: true };
    batch.forEach((f, i) => {
      const a = result.status === 'ok' ? result.value.get(i) : undefined;
      if (result.status === 'ok' && !a) return; // этот текст модель пропустила — спросим в следующий раз
      const links = mergeLinks((a?.links ?? []).map((l) => toSocialLink(l, opts.idFor())).filter((l): l is SocialLink => !!l));
      updates.push({ id: f.id, before: f.notes, notes: a?.rest ?? f.notes, links, facts: a?.facts ?? {} });
    });
  }
  return { updates, unavailable: false };
}

/**
 * Применить разбор к другу — если заметку за это время не меняли. Ссылки добавляются к уже известным (ручные главнее),
 * подсказки — только в пустые поля карточки. Заметка помечается разобранной.
 */
export function applyNotesUpdate<T extends NotesSubject>(f: T, u: NotesUpdate | undefined): T {
  if (!u || f.notes !== u.before) return f;
  const { notesQueue: _q, ...rest } = f;
  const next = { ...rest, notes: u.notes, notesSeen: notesHash(u.notes) } as T;
  const socials = mergeLinks(f.socials, u.links);
  if (socials.length) next.socials = socials;
  for (const k of NOTES_FACTS) if (!f[k].trim() && u.facts[k]) next[k] = u.facts[k] as T[NotesFact];
  return next;
}

/** Что изменилось у друга после разбора — для итоговой фразы. */
export function notesChanges(before: NotesSubject, after: NotesSubject): { links: number; facts: number; cleaned: boolean } {
  return {
    links: (after.socials?.length ?? 0) - (before.socials?.length ?? 0),
    facts: NOTES_FACTS.filter((k) => !before[k].trim() && after[k].trim()).length,
    cleaned: after.notes !== before.notes,
  };
}

/** Итог прохода — для фразы в меню и тоста. */
export interface NotesSummary {
  /** done — ИИ ответил; nothing — разбирать нечего; unavailable — ИИ недоступен, ничего не разобрали. */
  status: 'done' | 'nothing' | 'unavailable';
  /** У скольких друзей что-то нашлось (ссылки, подсказки или почищенная заметка). */
  friends: number;
  /** У скольких — новые соцсети и сколько их всего. */
  withLinks: number;
  links: number;
  facts: number;
  cleaned: number;
  /** Сколько заметок ещё ждут (не успели или ИИ отвалился на середине). */
  left: number;
}

export function notesSummary(friends: NotesSubject[], r: NotesPassResult, mode: 'queued' | 'all'): NotesSummary {
  const byId = new Map(r.updates.map((u) => [u.id, u]));
  const s: NotesSummary = { status: 'done', friends: 0, withLinks: 0, links: 0, facts: 0, cleaned: 0, left: 0 };
  for (const f of friends) {
    const u = byId.get(f.id);
    const after = applyNotesUpdate(f, u);
    if (notesPending(after, mode)) s.left++;
    if (!u) continue;
    const c = notesChanges(f, after);
    if (c.links > 0 || c.facts > 0 || c.cleaned) s.friends++;
    if (c.links > 0) s.withLinks++;
    s.links += Math.max(0, c.links);
    s.facts += c.facts;
    if (c.cleaned) s.cleaned++;
  }
  if (r.unavailable && !r.updates.length) s.status = 'unavailable';
  return s;
}
