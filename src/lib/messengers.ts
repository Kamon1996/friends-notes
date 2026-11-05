/** Мессенджеры, в которых есть человек, — для кнопок «Написать» в карточке друга. */
export interface Links {
  /** ID пользователя Telegram (открывает чат по tg://user?id=…). */
  telegramId?: number;
  /** Номер WhatsApp — только цифры в международном формате. */
  whatsapp?: string;
  /** Номер Viber — только цифры в международном формате. */
  viber?: string;
}

const ITEM = 'vnd.android.cursor.item/';
export const MIME = {
  phone: `${ITEM}phone_v2`,
  telegram: `${ITEM}vnd.org.telegram.messenger.android.profile`,
  whatsapp: `${ITEM}vnd.com.whatsapp.profile`,
  // Viber не заводит свой аккаунт, а дописывает строки в существующие контакты.
  // viber_number_* — у человека есть Viber; viber_out_call — платный звонок, не признак аккаунта.
  viberMessage: `${ITEM}vnd.com.viber.voip.viber_number_message`,
  viberCall: `${ITEM}vnd.com.viber.voip.viber_number_call`,
};
export const LINK_MIMETYPES = Object.values(MIME);

export interface DataRowLike {
  contactId: string;
  mimetype: string;
  data1: string;
  data4: string;
  accountName: string;
  sync1: string;
}

export interface PhoneIndex {
  /** Мессенджеры по id склеенного контакта. */
  byContact: Map<string, Links>;
  /** Нормализованные номера (+375…) по id контакта. */
  phonesByContact: Map<string, string[]>;
  /** Мессенджеры по номеру абонента (последние 9 цифр) — для друзей, уже добавленных в приложение. */
  byPhone: Map<string, Links>;
  /** Контакты, которые на самом деле — ты сам (своя запись Telegram). */
  selfContactIds: Set<string>;
}

const digits = (s: string) => s.replace(/\D/g, '');

/**
 * Ключ для сравнения номеров — последние 9 цифр (номер абонента). Так совпадают
 * +375 29 111-22-33 и местное 80 29 111-22-33, +7 999… и 8 999…, +48…, +380… и 0….
 */
export function phoneKey(phone: string): string {
  return digits(phone).slice(-9);
}

/** Служебные и короткие номера (*100#, 101, 2222) — это не люди. */
export function isServiceNumber(phone: string): boolean {
  return /[*#]/.test(phone) || digits(phone).length < 7;
}

function merge(map: Map<string, Links>, key: string, patch: Links) {
  if (!key) return;
  map.set(key, { ...map.get(key), ...patch });
}

export function buildPhoneIndex(rows: DataRowLike[]): PhoneIndex {
  const byContact = new Map<string, Links>();
  const phonesByContact = new Map<string, string[]>();
  const byPhone = new Map<string, Links>();
  const selfContactIds = new Set<string>();

  for (const r of rows) {
    switch (r.mimetype) {
      case MIME.phone: {
        const normalized = r.data4 || (r.data1.trim().startsWith('+') ? r.data1.trim() : '');
        if (normalized && !isServiceNumber(normalized)) {
          const list = phonesByContact.get(r.contactId) ?? [];
          if (!list.includes(normalized)) list.push(normalized);
          phonesByContact.set(r.contactId, list);
        }
        break;
      }
      case MIME.telegram: {
        const id = Number(r.data1);
        if (!id) break;
        // Аккаунт Telegram в телефоне называется ID владельца — его собственная запись это он сам.
        if (r.accountName && r.data1 === r.accountName) {
          selfContactIds.add(r.contactId);
          break;
        }
        merge(byContact, r.contactId, { telegramId: id });
        if (r.sync1 && digits(r.sync1).length >= 7) merge(byPhone, phoneKey(r.sync1), { telegramId: id });
        break;
      }
      case MIME.whatsapp: {
        const number = digits(r.data1.split('@')[0]); // 375291234567@s.whatsapp.net
        if (number.length < 7) break;
        merge(byContact, r.contactId, { whatsapp: number });
        merge(byPhone, phoneKey(number), { whatsapp: number });
        break;
      }
      case MIME.viberMessage:
      case MIME.viberCall: {
        const number = digits(r.data1);
        if (number.length < 7) break;
        merge(byContact, r.contactId, { viber: number });
        merge(byPhone, phoneKey(number), { viber: number });
        break;
      }
    }
  }
  return { byContact, phonesByContact, byPhone, selfContactIds };
}

/**
 * Ссылки для открытия чатов.
 * Telegram для Android не понимает tg://user?id=… (это формат iOS) — он открывает чат по
 * tg://openmessage?user_id=…, той же ссылкой пользуется кнопка «Сообщение» в системных контактах.
 */
export const telegramUrl = (id: number, os: string = 'android') =>
  os === 'android' ? `tg://openmessage?user_id=${id}` : `tg://user?id=${id}`;
export const whatsappUrl = (number: string) => `https://wa.me/${digits(number)}`;
export const viberUrl = (number: string) => `viber://chat?number=%2B${digits(number)}`;
export const phoneUrl = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;
