import { TASK_PROVIDERS } from './ai/tasks';
import { extractJson } from './ai/providers';
import type { AiRunner, AiTask } from './ai/types';
import { formatRepeat } from './dates';
import { notesHash } from './notesAi';
import type { Reminder, Settings } from './types';

/**
 * «Умный календарь»: какие напоминания — события для календаря (стоматолог в 15:00, тренировка по вторникам, массаж),
 * а какие — обычные дела, которым там не место (позвонить маме, купить в аптеке). Решает магия по названию; человек
 * может поправить в деле, и его выбор главнее. Дела «до срока» в календарь не попадают никогда.
 */

/** Включён ли умный календарь (по умолчанию — да). */
export const smartCalendarOn = (s: Pick<Settings, 'smartCalendar'> | undefined) => s?.smartCalendar !== false;

/** Что видела магия: название и повтор. Поменялось — спросим снова. */
export function calendarKey(r: Pick<Reminder, 'title' | 'repeat'>): string {
  return notesHash(`${r.title.trim().toLowerCase()}|${r.repeat ? formatRepeat(r.repeat) : 'once'}`);
}

/** Может ли дело быть в календаре: только «на дату и время» и повторяющиеся. «До срока» — никогда. */
export const calendarCandidate = (r: Pick<Reminder, 'repeat' | 'kind'>) => !!r.repeat || r.kind === 'at';

/**
 * Показывать ли дело в календаре. Выбор человека главнее; дальше — решение магии (если она включена и видела это
 * название); без него — по типу: «на дату и время» — да, повторяющееся — нет.
 */
export function inCalendar(r: Reminder, smart = true): boolean {
  if (!calendarCandidate(r)) return false;
  if (r.calendar !== undefined) return r.calendar;
  if (smart && r.calendarAi !== undefined && r.calendarSeen === calendarKey(r)) return r.calendarAi;
  return !r.repeat;
}

/** Ждёт ли дело решения магии. */
export const calendarPending = (r: Reminder) => calendarCandidate(r) && r.calendar === undefined && r.calendarSeen !== calendarKey(r);

/** Откуда решение — для подписи в форме дела. */
export function calendarSource(r: Reminder, smart: boolean): 'manual' | 'ai' | 'waiting' | 'type' {
  if (r.calendar !== undefined) return 'manual';
  if (!smart) return 'type';
  return r.calendarAi !== undefined && r.calendarSeen === calendarKey(r) ? 'ai' : 'waiting';
}

/** Задание для ИИ: что такое событие и обычное дело, примеры, формат ответа. Названия без имён друзей. */
export function calendarPrompt(lines: string[]): string {
  return [
    'Задание: ты ведёшь календарь человека. Ниже — его напоминания: название, время и, если есть, повтор.',
    'Для каждого реши: это СОБЫТИЕ, которое стоит показать в календаре, или ОБЫЧНОЕ ДЕЛО, которому в календаре не место.',
    '',
    'СОБЫТИЕ — назначено на конкретное время и обычно происходит где-то вне дома или с другими людьми: приём у врача,',
    'запись к мастеру (массаж, парикмахер, маникюр), тренировка или занятие, встреча, созвон в назначенное время,',
    'концерт, спектакль, рейс или поезд, собеседование, экзамен, родительское собрание, праздник у друзей.',
    'ОБЫЧНОЕ ДЕЛО — человек делает его сам, когда удобно, а время стоит только чтобы не забыть: позвонить, написать,',
    'купить, заказать, оплатить, забрать, убраться, приготовить, поесть, выпить таблетки, полить цветы,',
    'а ещё записаться куда-то (сама запись — дело, а визит по записи — событие).',
    '',
    'Примеры:',
    '«Стоматолог · 15:00» → event',
    '«К терапевту · 09:30» → event',
    '«Настольный теннис · каждую неделю · 19:00» → event',
    '«Массаж · 18:00» → event',
    '«Встреча с Олегом в кафе · 13:00» → event',
    '«Самолёт в Сочи · 07:40» → event',
    '«Собеседование · 11:00» → event',
    '«Позвонить маме · 18:00» → task',
    '«Купить лекарства в аптеке · 10:00» → task',
    '«Записаться к врачу · 10:00» → task',
    '«Пообедать · 13:00» → task',
    '«Оплатить интернет · каждый месяц · 10:00» → task',
    '«Выпить таблетки · каждый день · 09:00» → task',
    '',
    'Сомневаешься — task: лучше не добавить в календарь, чем засорить его.',
    'Ответ — только JSON: {"answers":[{"i":0,"c":"event"}]}, где i — номер строки, c — "event" или "task".',
    '',
    'Напоминания:',
    ...lines.map((l, i) => `${i}: ${l}`),
  ].join('\n');
}

/** Ответ ИИ → по номеру строки: true — событие, false — дело. null — ответ не разобрать. */
export function parseCalendarAnswer(text: string, count: number): Map<number, boolean> | null {
  const json = extractJson(text);
  const obj = json && typeof json === 'object' && !Array.isArray(json) ? (json as Record<string, unknown>) : null;
  const list = Array.isArray(json) ? json : (obj?.answers ?? obj?.result ?? obj?.items);
  if (!Array.isArray(list)) return null;
  const out = new Map<number, boolean>();
  for (const item of list as Record<string, unknown>[]) {
    const i = typeof item?.i === 'number' ? item.i : typeof item?.i === 'string' ? Number(item.i) : NaN;
    if (!Number.isInteger(i) || i < 0 || i >= count) continue;
    const c = typeof item.c === 'string' ? item.c.toLowerCase().trim() : '';
    if (c === 'event' || c === 'task') out.set(i, c === 'event');
  }
  return out;
}

export const CALENDAR_TASK: AiTask<string[], Map<number, boolean>> = {
  id: 'calendar',
  providers: TASK_PROVIDERS.calendar,
  request: (lines) => ({ prompt: calendarPrompt(lines), json: true, temperature: 0, maxTokens: 300 + lines.length * 25 }),
  parse: (text, lines) => parseCalendarAnswer(text, lines.length),
};

/**
 * Строка для ИИ: название без имени друга (шаблоны пишут «Позвонить — Игорь Ветров»), повтор и время. Заметки и
 * имена не отправляем.
 */
export function calendarLine(r: Pick<Reminder, 'title' | 'time' | 'repeat'>, friendName?: string): string {
  let title = r.title.trim();
  if (friendName) title = withoutName(title, friendName) || title;
  return [title, r.repeat ? formatRepeat(r.repeat) : null, r.time].filter(Boolean).join(' · ');
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Название без имени друга — целыми словами и в любом падеже: «Встреча с Олегом в кафе» → «Встреча в кафе».
 * Вырезать имя как подстроку нельзя: от «Олегом» оставалось «ом». Осиротевший предлог перед именем тоже убираем.
 */
export function withoutName(title: string, friendName: string): string {
  let out = title;
  for (const word of friendName.split(/\s+/).filter((w) => w.length >= 2)) {
    // Основа без окончания: «Аня» → «Ан» (Ане, Аню), «Олег» → «Олег» (Олегу, Олегом).
    const stem = word.length > 3 ? word.replace(/[аяйьеиоуюы]$/i, '') : word.replace(/[аяйь]$/i, '');
    if (stem.length < 2) continue;
    const name = new RegExp(`(?<![\\p{L}])(?:(?:с|со|к|ко|у|от|для|про|о|об|за)\\s+)?${escapeRe(stem)}[\\p{L}]{0,${stem.length >= 3 ? 3 : 2}}(?![\\p{L}])`, 'giu');
    out = out.replace(name, ' ');
  }
  return out
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.!?:;])/g, '$1')
    .replace(/[\s:;,—–-]+$/, '')
    .replace(/^[\s:;,.—–-]+/, '')
    .trim();
}

export interface CalendarUpdate {
  id: string;
  key: string;
  event: boolean;
}

/** Сколько дел за один проход и в одном вопросе. */
export const CALENDAR_BATCH = 40;

/**
 * Один проход: дела, которые ждут решения, — пачкой к ИИ. Возвращает решения; ничего не сохраняет сам. ИИ недоступен —
 * пусто, спросим в следующий раз; строку пропустил — тоже.
 */
export async function calendarPass(reminders: Reminder[], ai: AiRunner, friendName: (id: string) => string | undefined): Promise<CalendarUpdate[]> {
  const todo = reminders.filter(calendarPending).slice(0, CALENDAR_BATCH);
  if (!todo.length) return [];
  const lines = todo.map((r) => calendarLine(r, r.friendId ? friendName(r.friendId) : undefined));
  const result = await ai.run(CALENDAR_TASK, lines).catch(() => null);
  if (!result || result.status !== 'ok') return [];
  return todo.flatMap((r, i) => {
    const event = result.value.get(i);
    return event === undefined ? [] : [{ id: r.id, key: calendarKey(r), event }];
  });
}

/** Применить решение — если название и повтор за это время не поменялись и человек не выбрал сам. */
export function applyCalendarUpdate(r: Reminder, u: CalendarUpdate | undefined): Reminder {
  if (!u || r.calendar !== undefined || calendarKey(r) !== u.key) return r;
  return { ...r, calendarAi: u.event, calendarSeen: u.key };
}
