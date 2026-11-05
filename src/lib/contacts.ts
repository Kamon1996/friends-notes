import { Contact, ContactField, requestPermissionsAsync } from 'expo-contacts';
import * as Legacy from 'expo-contacts/legacy';
import { Platform } from 'react-native';

import { contactPhotos, contactsRawAvailable, dataRows } from '../../modules/contacts-raw';
import { fromLegacyContact, type LegacyContact, type RawContact } from './contactsImport';
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

/** Запрашивает доступ и читает телефонную книгу. */
export async function loadContacts(): Promise<ContactsResult> {
  const perm = await requestPermissionsAsync();
  if (!perm.granted) return { status: 'denied', canAskAgain: perm.canAskAgain };

  let contacts: RawContact[];
  if (Platform.OS === 'android') {
    contacts = await attachPhoneData(await loadLegacy());
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
  return { index: buildPhoneIndex(rows), photos: new Map(photos.map((p) => [p.contactId, p.photoUri])) };
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
        photoUri: photos.get(c.id) ?? null,
        isSelf: index.selfContactIds.has(c.id),
      };
    });
  } catch (e) {
    console.warn('Не удалось прочитать мессенджеры и фото из контактов', e);
    return contacts;
  }
}

export type Enrichment = Map<string, { links: Links; photoUri: string | null }>;

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
        photoUri: prev?.photoUri ?? photos.get(contactId) ?? null,
      });
    }
  }
  for (const [key, links] of index.byPhone) {
    if (!out.has(key)) out.set(key, { links, photoUri: null });
  }
  return out;
}
