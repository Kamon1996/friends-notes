import { holidayCountry } from './holidays';
import { normalizeData } from './storage';
import { ACCENTS } from './theme';
import { DEFAULT_SETTINGS, type AppData, type Friend, type Settings } from './types';
import { plural } from './dates';

/**
 * Резервная копия в файл: все друзья, даты, напоминания, настройки и фото. Формат — JSON, фото внутри (base64),
 * чтобы один файл можно было отправить себе в Telegram или положить в Google Диск и восстановить на другом телефоне.
 * Файл приходит снаружи, поэтому при восстановлении ему не доверяем: проверяем вид, размеры и тип картинок,
 * пути к файлам из копии не берём никогда — фото записываем сами.
 */

export const BACKUP_KIND = 'friends-notes-backup';
export const BACKUP_FORMAT = 1;
/** Больше — точно не наша копия: даже тысяча фото по 360 точек весит меньше. */
export const MAX_BACKUP_CHARS = 80 * 1024 * 1024;
/** Одно фото в копии — до ~1 МБ (у нас они ~20–40 КБ). */
export const MAX_PHOTO_CHARS = 1_400_000;
/** До такой ширины ужимаем фото для копии: аватар на экране — 88 точек, ×3 на плотных экранах. */
export const BACKUP_PHOTO_WIDTH = 360;

export interface BackupContents {
  data: AppData;
  /** Фото по id друга: base64 JPEG, PNG или WebP. */
  photos: Record<string, string>;
  createdAt: Date | null;
  appVersion: string;
}

export type ParsedBackup = ({ ok: true } & BackupContents) | { ok: false; error: string };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Без путей к фото: на другом телефоне их нет, а в копии фото лежат отдельно. */
const withoutPhotoPaths = ({ photoUri: _p, thumbUri: _t, ...f }: Friend): Friend => f;

/** Файл копии. Фото — только для друзей, которые есть в данных. */
export function buildBackup(data: AppData, photos: Record<string, string>, now: Date, appVersion: string): string {
  const ids = new Set(data.friends.map((f) => f.id));
  return JSON.stringify({
    kind: BACKUP_KIND,
    format: BACKUP_FORMAT,
    createdAt: now.toISOString(),
    appVersion,
    data: { ...data, friends: data.friends.map(withoutPhotoPaths) },
    photos: Object.fromEntries(Object.entries(photos).filter(([id, b64]) => ids.has(id) && !!b64)),
  });
}

export const backupFileName = (now: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `druzya-kopiya-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
};

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Первые байты из base64 — чтобы узнать тип файла, не раскодируя его целиком. */
function headBytes(base64: string, count: number): number[] {
  const out: number[] = [];
  for (let i = 0; out.length < count && i + 3 < base64.length; i += 4) {
    const [a, b, c, d] = [0, 1, 2, 3].map((k) => B64.indexOf(base64[i + k]));
    if (a < 0 || b < 0) break;
    out.push(((a << 2) | (b >> 4)) & 255);
    if (c >= 0) out.push(((b << 4) | (c >> 2)) & 255);
    if (d >= 0) out.push(((c << 6) | d) & 255);
  }
  return out.slice(0, count);
}

const ascii = (bytes: number[]) => String.fromCharCode(...bytes);

/** Тип картинки по первым байтам; не картинка — null. */
export function imageMime(base64: string): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  const b = headBytes(base64, 12);
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (ascii(b.slice(0, 8)) === '\x89PNG\r\n\x1a\n') return 'image/png';
  if (ascii(b.slice(0, 4)) === 'RIFF' && ascii(b.slice(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** Настройки из копии: только известные поля и только допустимые значения, остальное — по умолчанию. */
export function sanitizeSettings(raw: unknown): Settings {
  const s = isObject(raw) ? raw : {};
  const accent = (v: unknown, fallback: Settings['accentLight']) => (ACCENTS.some((a) => a.id === v) ? (v as Settings['accentLight']) : fallback);
  return {
    eventTime: typeof s.eventTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s.eventTime) ? s.eventTime : DEFAULT_SETTINGS.eventTime,
    eventDayBefore: typeof s.eventDayBefore === 'boolean' ? s.eventDayBefore : DEFAULT_SETTINGS.eventDayBefore,
    theme: s.theme === 'light' || s.theme === 'dark' || s.theme === 'system' ? s.theme : DEFAULT_SETTINGS.theme,
    accentLight: accent(s.accentLight, DEFAULT_SETTINGS.accentLight),
    accentDark: accent(s.accentDark, DEFAULT_SETTINGS.accentDark),
    crashReports: typeof s.crashReports === 'boolean' ? s.crashReports : DEFAULT_SETTINGS.crashReports,
    ...(typeof s.calendarSync === 'boolean' ? { calendarSync: s.calendarSync } : {}),
    ...(typeof s.showZodiac === 'boolean' ? { showZodiac: s.showZodiac } : {}),
    ...(typeof s.smartCalendar === 'boolean' ? { smartCalendar: s.smartCalendar } : {}),
    // Пустой список — тоже выбор («праздники не показывать»); незнакомые страны отбрасываем.
    ...(Array.isArray(s.holidayCountries) ? { holidayCountries: s.holidayCountries.filter((c): c is string => typeof c === 'string' && !!holidayCountry(c)) } : {}),
    ...(typeof s.calendarLegend === 'boolean' ? { calendarLegend: s.calendarLegend } : {}),
    ...(s.calendarDayView === 'sheet' || s.calendarDayView === 'inline' ? { calendarDayView: s.calendarDayView } : {}),
    ...(s.newReminderForm === 'quick' || s.newReminderForm === 'rows' ? { newReminderForm: s.newReminderForm } : {}),
  };
}

/** Разобрать файл копии. Ошибки — короткими фразами для человека. */
export function parseBackup(text: string): ParsedBackup {
  if (text.length > MAX_BACKUP_CHARS) return { ok: false, error: 'Файл слишком большой — это не копия «Друзей».' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Это не копия «Друзей»: файл не читается.' };
  }
  if (!isObject(raw) || raw.kind !== BACKUP_KIND || !isObject(raw.data)) return { ok: false, error: 'Это не копия «Друзей».' };
  if (typeof raw.format !== 'number' || raw.format > BACKUP_FORMAT) {
    return { ok: false, error: 'Копия сделана в более новой версии приложения. Обнови «Друзей» и попробуй снова.' };
  }

  const normalized = normalizeData(raw.data);
  // Одинаковые id в файле — берём первую запись, иначе одна правка задела бы обе.
  const seen = new Set<string>();
  const friends = normalized.friends
    .filter((f) => !seen.has(f.id) && !!seen.add(f.id))
    .map(withoutPhotoPaths)
    .map((f) => ({ ...f, name: f.name.trim() || 'Без имени' }));
  const friendIds = new Set(friends.map((f) => f.id));
  const reminderIds = new Set<string>();
  const reminders = normalized.reminders
    .filter((r) => !reminderIds.has(r.id) && !!reminderIds.add(r.id))
    .map((r) => (r.friendId && !friendIds.has(r.friendId) ? { ...r, friendId: null } : r));
  if (!friends.length && !reminders.length) return { ok: false, error: 'В копии нет ни друзей, ни напоминаний.' };

  const photos: Record<string, string> = {};
  if (isObject(raw.photos)) {
    for (const [id, b64] of Object.entries(raw.photos)) {
      if (!friendIds.has(id) || typeof b64 !== 'string' || b64.length > MAX_PHOTO_CHARS || !BASE64.test(b64) || !imageMime(b64)) continue;
      photos[id] = b64;
    }
  }
  const created = typeof raw.createdAt === 'string' ? new Date(raw.createdAt) : null;
  return {
    ok: true,
    data: { ...normalized, friends, reminders, settings: sanitizeSettings(isObject(raw.data) ? raw.data.settings : null) },
    photos,
    createdAt: created && !Number.isNaN(created.getTime()) ? created : null,
    appVersion: typeof raw.appVersion === 'string' ? raw.appVersion.slice(0, 20) : '',
  };
}

/**
 * Данные после восстановления: всё из копии; «Что нового» — как на этом телефоне (иначе покажется заново),
 * дата последней копии — дата этой копии.
 */
export function restoredData(current: AppData, backup: BackupContents): AppData {
  return {
    ...backup.data,
    settings: {
      ...backup.data.settings,
      ...(current.settings.lastSeenVersion ? { lastSeenVersion: current.settings.lastSeenVersion } : {}),
      ...(backup.createdAt ? { lastBackupAt: backup.createdAt.toISOString() } : {}),
    },
  };
}

/** «40 друзей, 12 напоминаний и 25 фото» — для вопроса перед восстановлением. */
export function describeBackup(b: Pick<BackupContents, 'data' | 'photos'>): string {
  const parts = [
    `${b.data.friends.length} ${plural(b.data.friends.length, 'друг', 'друга', 'друзей')}`,
    `${b.data.reminders.length} ${plural(b.data.reminders.length, 'напоминание', 'напоминания', 'напоминаний')}`,
  ];
  const photos = Object.keys(b.photos).length;
  if (photos) parts.push(`${photos} фото`);
  return parts.length === 3 ? `${parts[0]}, ${parts[1]} и ${parts[2]}` : parts.join(' и ');
}

/**
 * Имя файла для восстановленного фото. id друга приходит из файла копии, поэтому в имя идут только буквы и цифры:
 * «../» и прочие фокусы не выведут запись за папку с аватарами.
 */
export function restoredPhotoName(friendId: string, stamp: number, base64: string): string {
  const safe = friendId.replace(/[^A-Za-z0-9]/g, '_').slice(0, 40) || 'friend';
  const ext = imageMime(base64) === 'image/png' ? 'png' : imageMime(base64) === 'image/webp' ? 'webp' : 'jpg';
  return `${safe}-${stamp}-r.${ext}`;
}
