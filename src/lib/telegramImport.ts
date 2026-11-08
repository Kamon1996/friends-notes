import type { RawContact } from './contactsImport';
import type { SocialLink } from './types';

/** Данные пользователя Telegram, нужные для импорта (совпадает с тем, что отдаёт модуль). */
export interface TgPerson {
  id: number;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  usernames: string[];
  birthdate: { day: number; month: number; year: number } | null;
  bio: string | null;
  photoUri?: string | null;
  thumbUri?: string | null;
}

let seq = 0;
const linkId = () => `tgl-${Date.now().toString(36)}-${(seq++).toString(36)}`;

/**
 * Контакт Telegram → формат общего импорта. @username становится ссылкой на Telegram, «О себе» целиком — заметкой.
 * Соцсети из «О себе» потом достаёт ИИ (src/lib/notesAi.ts) и убирает их из заметки — регулярными выражениями
 * свободный текст не разбираем: подписи, сокращения и опечатки ИИ понимает надёжнее.
 */
export function tgToRawContact(p: TgPerson): RawContact {
  const phone = p.phoneNumber ? (p.phoneNumber.startsWith('+') ? p.phoneNumber : `+${p.phoneNumber}`) : '';
  const own: SocialLink[] = p.usernames.map((u) => ({ id: linkId(), network: 'telegram', url: `https://t.me/${u}`, handle: u, source: 'tg' }));
  const bio = p.bio?.trim() ?? '';
  return {
    id: `tg-${p.id}`,
    fullName: [p.firstName, p.lastName].filter(Boolean).join(' ').trim(),
    phones: phone ? [{ number: phone }] : [],
    birthday: p.birthdate ? { day: p.birthdate.day, month: p.birthdate.month, year: p.birthdate.year || undefined } : null,
    note: bio ? `О себе: ${bio}` : '',
    links: { telegramId: p.id },
    socials: own,
    photoUri: p.photoUri ?? null,
    thumbUri: p.thumbUri ?? null,
  };
}

/** «Too Many Requests: retry after 17» / «FLOOD_WAIT_17» → 17 секунд; иначе null. */
export function floodWaitSeconds(message: string | undefined): number | null {
  const m = /retry after (\d+)|FLOOD_WAIT_(\d+)/i.exec(message ?? '');
  return m ? Number(m[1] ?? m[2]) : null;
}

const RU_ERRORS: [RegExp, string][] = [
  [/PHONE_NUMBER_INVALID/i, 'Неверный номер телефона. Введи его в международном формате, например +7 999 123-45-67.'],
  [/PHONE_NUMBER_BANNED/i, 'Этот номер заблокирован в Telegram.'],
  [/PHONE_CODE_INVALID|PHONE_CODE_EMPTY/i, 'Неверный код. Проверь сообщение от Telegram и попробуй ещё раз.'],
  [/PHONE_CODE_EXPIRED/i, 'Код устарел. Начни вход заново.'],
  [/PASSWORD_HASH_INVALID/i, 'Неверный облачный пароль.'],
  [/API_ID_INVALID|API_ID_PUBLISHED_FLOOD/i, 'Telegram не принял ключи приложения (api_id/api_hash). Проверь секреты TG_API_ID и TG_API_HASH.'],
  [/retry after|FLOOD_WAIT|Too Many Requests/i, 'Telegram просит подождать: слишком много попыток. Попробуй позже.'],
];

export function tgErrorText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return RU_ERRORS.find(([re]) => re.test(msg))?.[1] ?? msg;
}
