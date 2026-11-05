import type { RawContact } from './contactsImport';

/** Данные пользователя Telegram, нужные для импорта (совпадает с тем, что отдаёт модуль). */
export interface TgPerson {
  id: number;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  usernames: string[];
  birthdate: { day: number; month: number; year: number } | null;
  bio: string | null;
}

/** Контакт Telegram → формат общего импорта. */
export function tgToRawContact(p: TgPerson): RawContact {
  const phone = p.phoneNumber ? (p.phoneNumber.startsWith('+') ? p.phoneNumber : `+${p.phoneNumber}`) : '';
  const notes = [
    p.usernames.length ? `Telegram: ${p.usernames.map((u) => '@' + u).join(', ')}` : '',
    p.bio ? `О себе: ${p.bio}` : '',
  ].filter(Boolean);
  return {
    id: `tg-${p.id}`,
    fullName: [p.firstName, p.lastName].filter(Boolean).join(' ').trim(),
    phones: phone ? [{ number: phone }] : [],
    birthday: p.birthdate ? { day: p.birthdate.day, month: p.birthdate.month, year: p.birthdate.year || undefined } : null,
    note: notes.join('\n'),
    links: { telegramId: p.id },
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

/** Данные, переданные с экрана входа в Telegram на экран выбора контактов. */
let pending: { label: string; contacts: RawContact[]; partial: boolean } | null = null;

export function setPendingImport(value: typeof pending) {
  pending = value;
}

export function getPendingImport() {
  return pending;
}
