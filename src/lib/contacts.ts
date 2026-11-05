import { Contact, ContactField, requestPermissionsAsync } from 'expo-contacts';
import { Platform } from 'react-native';

import type { RawContact } from './contactsImport';

export type ContactsResult =
  | { status: 'granted'; contacts: RawContact[]; limited: boolean; sample: boolean }
  | { status: 'denied'; canAskAgain: boolean };

const FIELDS = [
  ContactField.FULL_NAME,
  ContactField.GIVEN_NAME,
  ContactField.FAMILY_NAME,
  ContactField.PHONES,
  ContactField.BIRTHDAY,
  ContactField.DATES,
] as const;

/** Запрашивает доступ и читает телефонную книгу. */
export async function loadContacts(): Promise<ContactsResult> {
  const perm = await requestPermissionsAsync();
  if (!perm.granted) return { status: 'denied', canAskAgain: perm.canAskAgain };

  // Заметки на iOS читаются только со специальным разрешением Apple — берём их только на Android.
  const fields = Platform.OS === 'android' ? [...FIELDS, ContactField.NOTE] : [...FIELDS];
  const details = await Contact.getAllDetails(fields);
  return {
    status: 'granted',
    contacts: details as unknown as RawContact[],
    limited: perm.accessPrivileges === 'limited',
    sample: false,
  };
}

/** iOS 18+: дать доступ к дополнительным контактам при ограниченном доступе. */
export async function pickMoreContacts(): Promise<void> {
  if (Platform.OS === 'ios') await Contact.presentAccessPicker();
}
