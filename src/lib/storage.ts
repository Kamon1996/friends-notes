import { DEFAULT_SETTINGS, EMPTY_DATA, type AppData, type Friend, type ImportantDate, type Reminder } from './types';

/**
 * Приведение сохранённых данных к текущему виду: данные старых версий без новых полей, обрывки после сбоя записи,
 * чужие типы. Ничего не выбрасываем, если это можно понять; непонятные записи пропускаем, а не роняем приложение.
 */
export function normalizeData(raw: unknown): AppData {
  const obj = isObject(raw) ? raw : {};
  const friends = Array.isArray(obj.friends) ? obj.friends.map(normalizeFriend).filter((f): f is Friend => f !== null) : [];
  const reminders = Array.isArray(obj.reminders) ? obj.reminders.map(normalizeReminder).filter((r): r is Reminder => r !== null) : [];
  const settings = isObject(obj.settings) ? { ...DEFAULT_SETTINGS, ...obj.settings } : DEFAULT_SETTINGS;
  return { ...EMPTY_DATA, friends, reminders, settings };
}

/** Что делать с прочитанной строкой: разобрать или отложить в резервную копию, если разобрать нельзя. */
export function parseStored(raw: string | null): { data: AppData | null; broken: boolean } {
  if (raw === null) return { data: null, broken: false };
  try {
    return { data: normalizeData(JSON.parse(raw)), broken: false };
  } catch {
    return { data: null, broken: true };
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);

function normalizeFriend(v: unknown): Friend | null {
  if (!isObject(v) || typeof v.id !== 'string' || typeof v.name !== 'string') return null;
  const dates = Array.isArray(v.dates)
    ? v.dates.filter((d): d is ImportantDate => isObject(d) && typeof d.id === 'string' && typeof d.date === 'string').map((d) => ({ ...d, title: str(d.title), yearly: d.yearly !== false }))
    : [];
  // Пол берём только из проверенных полей ниже, а не из исходной записи как есть.
  const { gender: _gender, genderBy: _genderBy, ...rest } = v;
  return {
    ...(rest as unknown as Friend),
    emoji: str(v.emoji),
    birthday: typeof v.birthday === 'string' ? v.birthday : null,
    phone: str(v.phone),
    food: str(v.food),
    flowers: str(v.flowers),
    gifts: str(v.gifts),
    notes: str(v.notes),
    dates,
    socials: Array.isArray(v.socials) ? v.socials.filter((l) => isObject(l) && typeof l.id === 'string' && typeof l.network === 'string') as Friend['socials'] : undefined,
    createdAt: typeof v.createdAt === 'number' ? v.createdAt : 0,
    ...genderFields(v),
  };
}

/** Пол и его источник — только допустимые значения; иначе полей нет вовсе. */
function genderFields(v: Record<string, unknown>): Pick<Friend, 'gender' | 'genderBy'> {
  const out: Pick<Friend, 'gender' | 'genderBy'> = {};
  if (v.gender === 'f' || v.gender === 'm') out.gender = v.gender;
  if (typeof v.genderBy === 'string' && ['manual', 'names', 'genderize', 'device-ai', 'gemini'].includes(v.genderBy)) out.genderBy = v.genderBy as Friend['genderBy'];
  return out;
}

function normalizeReminder(v: unknown): Reminder | null {
  if (!isObject(v) || typeof v.id !== 'string' || typeof v.date !== 'string') return null;
  const repeat = isObject(v.repeat) && typeof v.repeat.every === 'number' && typeof v.repeat.unit === 'string' ? (v.repeat as unknown as Reminder['repeat']) : null;
  return {
    ...(v as unknown as Reminder),
    title: str(v.title),
    note: str(v.note),
    friendId: typeof v.friendId === 'string' ? v.friendId : null,
    time: typeof v.time === 'string' && /^\d{2}:\d{2}$/.test(v.time) ? v.time : '10:00',
    repeat,
    advance: (typeof v.advance === 'number' ? v.advance : 0) as Reminder['advance'],
    done: v.done === true,
    createdAt: typeof v.createdAt === 'number' ? v.createdAt : 0,
  };
}
