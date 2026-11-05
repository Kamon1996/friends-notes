import { Contact, ContactField, requestPermissionsAsync } from 'expo-contacts';
import * as Legacy from 'expo-contacts/legacy';
import { Platform } from 'react-native';

import { fromLegacyContact, type LegacyContact, type RawContact } from './contactsImport';

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
    contacts = await loadLegacy();
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
