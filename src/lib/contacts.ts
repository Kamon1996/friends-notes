import { Contact, ContactField, requestPermissionsAsync } from 'expo-contacts';
import * as Legacy from 'expo-contacts/legacy';
import { Platform } from 'react-native';

import { contactPhotos, contactsRawAvailable, dataRows } from '../../modules/contacts-raw';
import { fromLegacyContact, isBirthdayLabel, parseLooseDate, type LegacyContact, type RawContact } from './contactsImport';
import { LINK_MIMETYPES, buildPhoneIndex, phoneKey, type Links } from './messengers';

export type ContactsResult =
  | { status: 'granted'; contacts: RawContact[]; limited: boolean; sample: boolean }
  | { status: 'denied'; canAskAgain: boolean };

/**
 * Старый API: на Android каждую дату разбирает отдельно (кривая дата не ломает чтение всей книги)
 * и отдаёт исходные строки дат, которые мы разбираем сами.
 */
async function loadLegacy(): Promise<RawContact[]> {
  const fields = [
    Legacy.Fields.Name,
    Legacy.Fields.FirstName,
    Legacy.Fields.LastName,
    Legacy.Fields.PhoneNumbers,
    Legacy.Fields.Birthday,
    Legacy.Fields.Dates,
    // Заметки на iOS читаются только со специальным разрешением Apple.
    ...(Platform.OS === 'android' ? [Legacy.Fields.Note] : []),
  ];
  const { data } = await Legacy.getContactsAsync({ fields });
  return (data as unknown as LegacyContact[]).map(fromLegacyContact);
}

/** Новый API (iOS): день рождения — отдельное поле. */
async function loadNext(): Promise<RawContact[]> {
  const details = await Contact.getAllDetails([
    ContactField.FULL_NAME,
    ContactField.GIVEN_NAME,
    ContactField.FAMILY_NAME,
    ContactField.PHONES,
    ContactField.BIRTHDAY,
    ContactField.DATES,
  ] as const);
  return details as unknown as RawContact[];
}

const NAME_MIME = 'vnd.android.cursor.item/name';
const PHONE_MIME = 'vnd.android.cursor.item/phone_v2';
const EVENT_MIME = 'vnd.android.cursor.item/contact_event';
const NOTE_MIME = 'vnd.android.cursor.item/note';

/**
 * Быстрый путь на Android: вся книга одним запросом к таблице data (имена, номера, даты, заметки
 * и строки мессенджеров) плюс фото. На 10 тысячах контактов это доли секунды, тогда как expo-contacts
 * собирает каждый контакт отдельно.
 */
async function loadViaRaw(): Promise<RawContact[]> {
  const [rows, photos] = await Promise.all([dataRows([NAME_MIME, PHONE_MIME, EVENT_MIME, NOTE_MIME, ...LINK_MIMETYPES]), contactPhotos()]);
  const byId = new Map<string, RawContact>();
  const get = (id: string) => {
    let c = byId.get(id);
    if (!c) {
      c = { id, phones: [], dates: [], normalizedPhones: [] };
      byId.set(id, c);
    }
    return c;
  };
  for (const r of rows) {
    if (r.mimetype === NAME_MIME) {
      const c = get(r.contactId);
      if (!c.fullName && r.data1) {
        c.fullName = r.data1;
        c.givenName = r.data2 || null;
        c.familyName = r.data3 || null;
      }
    } else if (r.mimetype === PHONE_MIME) {
      const c = get(r.contactId);
      if (r.data1) c.phones!.push({ number: r.data1 });
      if (r.data4) c.normalizedPhones!.push(r.data4);
    } else if (r.mimetype === EVENT_MIME) {
      const date = parseLooseDate(r.data1);
      if (!date) continue;
      const c = get(r.contactId);
      const label = r.data2 === '3' ? 'birthday' : r.data2 === '1' ? 'anniversary' : r.data2 === '0' ? r.data3 || 'other' : 'other';
      if (isBirthdayLabel(label) && !c.birthday) c.birthday = date;
      else c.dates!.push({ label, date });
    } else if (r.mimetype === NOTE_MIME) {
      const c = get(r.contactId);
      if (r.data1 && !c.note) c.note = r.data1;
    }
  }
  const index = buildPhoneIndex(rows);
  const photoMap = new Map(photos.map((p) => [p.contactId, p]));
  const list = [...byId.values()].map((c) => {
    const byPhone = (c.normalizedPhones ?? []).map((p) => index.byPhone.get(phoneKey(p))).find(Boolean);
    return {
      ...c,
      links: { ...byPhone, ...index.byContact.get(c.id) },
      photoUri: photoMap.get(c.id)?.photoUri ?? null,
      thumbUri: photoMap.get(c.id)?.thumbUri ?? null,
      isSelf: index.selfContactIds.has(c.id),
    };
  });
  const nameOf = (c: RawContact) => c.fullName ?? '';
  return list.sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'ru'));
}

/** Запрашивает доступ и читает телефонную книгу. */
export async function loadContacts(): Promise<ContactsResult> {
  const perm = await requestPermissionsAsync();
  if (!perm.granted) return { status: 'denied', canAskAgain: perm.canAskAgain };

  let contacts: RawContact[];
  if (Platform.OS === 'android') {
    contacts = contactsRawAvailable ? await loadViaRaw().catch((e) => (console.warn('Быстрое чтение книги не сработало, читаю через expo-contacts', e), loadLegacy().then(attachPhoneData))) : await attachPhoneData(await loadLegacy());
  } else {
    try {
      contacts = await loadNext();
    } catch (e) {
      console.warn('Новый API контактов не сработал, пробую старый', e);
      contacts = await loadLegacy();
    }
  }
  return { status: 'granted', contacts, limited: perm.accessPrivileges === 'limited', sample: false };
}

/** iOS 18+: дать доступ к дополнительным контактам при ограниченном доступе. */
export async function pickMoreContacts(): Promise<void> {
  if (Platform.OS === 'ios') await Contact.presentAccessPicker();
}

/** Данные из телефонной книги Android по нашему модулю: нормализованные номера, мессенджеры, фото. */
async function loadPhoneData() {
  const [rows, photos] = await Promise.all([dataRows(LINK_MIMETYPES), contactPhotos()]);
  return { index: buildPhoneIndex(rows), photos: new Map(photos.map((p) => [p.contactId, p])) };
}

/** Дополняет контакты (id = id склеенного контакта Android) номерами, мессенджерами и фото. */
async function attachPhoneData(contacts: RawContact[]): Promise<RawContact[]> {
  if (!contactsRawAvailable) return contacts;
  try {
    const { index, photos } = await loadPhoneData();
    return contacts.map((c) => {
      const normalizedPhones = index.phonesByContact.get(c.id) ?? [];
      const byPhone = normalizedPhones.map((p) => index.byPhone.get(phoneKey(p))).find(Boolean);
      return {
        ...c,
        normalizedPhones,
        links: { ...byPhone, ...index.byContact.get(c.id) },
        photoUri: photos.get(c.id)?.photoUri ?? null,
        thumbUri: photos.get(c.id)?.thumbUri ?? null,
        isSelf: index.selfContactIds.has(c.id),
      };
    });
  } catch (e) {
    console.warn('Не удалось прочитать мессенджеры и фото из контактов', e);
    return contacts;
  }
}

export type Enrichment = Map<string, { links: Links; photoUri: string | null; thumbUri?: string | null }>;

/**
 * Мессенджеры и фото по номеру телефона (последние 9 цифр) — чтобы дополнить друзей,
 * которые уже есть в приложении.
 */
export async function loadEnrichment(): Promise<Enrichment> {
  const out: Enrichment = new Map();
  if (Platform.OS !== 'android' || !contactsRawAvailable) return out;
  const perm = await requestPermissionsAsync();
  if (!perm.granted) throw new Error('Нет доступа к контактам');
  const { index, photos } = await loadPhoneData();
  for (const [contactId, phones] of index.phonesByContact) {
    for (const p of phones) {
      const key = phoneKey(p);
      const prev = out.get(key);
      out.set(key, {
        links: { ...index.byPhone.get(key), ...index.byContact.get(contactId), ...prev?.links },
        photoUri: prev?.photoUri ?? photos.get(contactId)?.photoUri ?? null,
        thumbUri: prev?.thumbUri ?? photos.get(contactId)?.thumbUri ?? null,
      });
    }
  }
  for (const [key, links] of index.byPhone) {
    if (!out.has(key)) out.set(key, { links, photoUri: null });
  }
  return out;
}
