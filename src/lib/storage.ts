import { cleanAdvances } from './advances';
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

/** Настоящая дата в виде ГГГГ-ММ-ДД: «10.11.2026», пустая строка и 31 февраля — не даты. */
export function isStoredDate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

const REPEAT_UNITS = ['day', 'week', 'month', 'year'];
const ADVANCES = [0, 60, 120, 1440, 4320, 10080];
/** Повтор — только понятный: счёт по известной единице и разумный шаг. Иначе пересчёт дат не закончится никогда. */
function normalizeRepeat(v: unknown): Reminder['repeat'] {
  if (!isObject(v) || typeof v.unit !== 'string' || !REPEAT_UNITS.includes(v.unit)) return null;
  const every = v.every;
  if (typeof every !== 'number' || !Number.isInteger(every) || every < 1 || every > 999) return null;
  const unit = v.unit as NonNullable<Reminder['repeat']>['unit'];
  // Дни недели — только у недельного повтора и только настоящие: 1 — понедельник … 7 — воскресенье.
  const days = unit === 'week' && Array.isArray(v.days) ? [...new Set(v.days.filter((d): d is number => Number.isInteger(d) && d >= 1 && d <= 7))].sort((a, b) => a - b) : [];
  return days.length ? { every, unit, days } : { every, unit };
}

function normalizeFriend(v: unknown): Friend | null {
  if (!isObject(v) || typeof v.id !== 'string' || typeof v.name !== 'string') return null;
  const dates = Array.isArray(v.dates)
    ? v.dates.filter((d): d is ImportantDate => isObject(d) && typeof d.id === 'string' && isStoredDate(d.date)).map((d) => ({ ...d, title: str(d.title), yearly: d.yearly !== false }))
    : [];
  // Пол берём только из проверенных полей ниже, а не из исходной записи как есть.
  const { gender: _gender, genderBy: _genderBy, genderStage: _genderStage, notesSeen: _seen, notesQueue: _queue, ...rest } = v;
  return {
    ...(rest as unknown as Friend),
    emoji: str(v.emoji),
    birthday: isStoredDate(v.birthday) ? v.birthday : null,
    phone: str(v.phone),
    food: str(v.food),
    flowers: str(v.flowers),
    gifts: str(v.gifts),
    notes: str(v.notes),
    dates,
    socials: Array.isArray(v.socials) ? v.socials.filter((l) => isObject(l) && typeof l.id === 'string' && typeof l.network === 'string') as Friend['socials'] : undefined,
    createdAt: typeof v.createdAt === 'number' ? v.createdAt : 0,
    ...genderFields(v),
    // Разбор заметок ИИ: отпечаток разобранного текста и «разобрать в фоне» — только допустимые значения.
    ...(typeof v.notesSeen === 'string' && v.notesSeen && { notesSeen: v.notesSeen }),
    ...(v.notesQueue === true && { notesQueue: true }),
  };
}

/**
 * Пол, его источник и ступень — только допустимые и согласованные значения:
 * - пол без источника или источник «автоматически» без пола — не доверяем, определим заново;
 * - ступень нужна, только пока пол не определён; «Не указан» вручную — это genderBy: 'manual' без пола.
 */
const GENDER_SOURCES = ['manual', 'names', 'genderize', 'device-ai', 'ai'];
const GENDER_STAGES = ['names', 'genderize', 'device-ai', 'ai'];
/** Сборка, где облачным ИИ был только Gemini, писала «gemini». */
const legacy = (v: unknown) => (v === 'gemini' ? 'ai' : v);

function genderFields(v: Record<string, unknown>): Pick<Friend, 'gender' | 'genderBy' | 'genderStage'> {
  const gender = v.gender === 'f' || v.gender === 'm' ? v.gender : undefined;
  const rawBy = legacy(v.genderBy);
  const rawStage = legacy(v.genderStage);
  const by = typeof rawBy === 'string' && GENDER_SOURCES.includes(rawBy) ? (rawBy as Friend['genderBy']) : undefined;
  if (by === 'manual') return gender ? { gender, genderBy: by } : { genderBy: by };
  if (gender && by) return { gender, genderBy: by };
  if (!gender && typeof rawStage === 'string' && GENDER_STAGES.includes(rawStage)) return { genderStage: rawStage as Friend['genderStage'] };
  return {};
}

function normalizeReminder(v: unknown): Reminder | null {
  // Без настоящей даты дело не посчитать: ни срок, ни повтор, ни уведомления.
  if (!isObject(v) || typeof v.id !== 'string' || !isStoredDate(v.date)) return null;
  const repeat = normalizeRepeat(v.repeat);
  const { daily, kind, priority, minutes, doneAt, calendar, calendarAi, calendarSeen, advances, ...rest } = v;
  const done = v.done === true;
  return {
    ...(rest as unknown as Reminder),
    // «Каждый день до срока» и «на дату и время» — только у разовых; всё необязательное — только понятных значений.
    ...(daily === true && !repeat && kind !== 'at' ? { daily: true } : {}),
    ...(kind === 'at' && !repeat ? { kind: 'at' as const } : {}),
    ...(priority === 1 || priority === 2 || priority === 3 ? { priority } : {}),
    ...(typeof minutes === 'number' && Number.isInteger(minutes) && minutes > 0 && minutes <= 24 * 60 ? { minutes } : {}),
    ...(done && typeof doneAt === 'number' && doneAt > 0 ? { doneAt } : {}),
    ...(typeof calendar === 'boolean' ? { calendar } : {}),
    // Несколько «заранее»: только известные значения; пустой список — тоже выбор («не напоминать заранее»).
    ...(Array.isArray(advances) ? { advances: cleanAdvances(advances) } : {}),
    ...(typeof calendarAi === 'boolean' && typeof calendarSeen === 'string' ? { calendarAi, calendarSeen } : {}),
    title: str(v.title),
    note: str(v.note),
    friendId: typeof v.friendId === 'string' ? v.friendId : null,
    time: typeof v.time === 'string' && /^\d{2}:\d{2}$/.test(v.time) ? v.time : '10:00',
    repeat,
    advance: (typeof v.advance === 'number' && ADVANCES.includes(v.advance) ? v.advance : 0) as Reminder['advance'],
    done,
    createdAt: typeof v.createdAt === 'number' ? v.createdAt : 0,
  };
}
