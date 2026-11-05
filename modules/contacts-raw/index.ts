import { requireOptionalNativeModule } from 'expo';

export interface RawAccount {
  accountType: string;
  accountName: string;
  rawContacts: number;
}

export interface RawDumpItem {
  /** Колонки таблицы raw_contacts: _id, contact_id, account_type, display_name, sync1… */
  raw: Record<string, string | number>;
  /** Строки таблицы data: mimetype, data1…data14, sync1… */
  data: Record<string, string | number>[];
}

export interface RawDump {
  accountType: string;
  total: number;
  items: RawDumpItem[];
}

/** Строка таблицы data нужного типа с привязкой к склеенному контакту и аккаунту. */
export interface DataRow {
  contactId: string;
  mimetype: string;
  data1: string;
  data4: string;
  accountName: string;
  sync1: string;
}

export interface ContactPhoto {
  contactId: string;
  photoUri: string;
  thumbUri: string;
}

interface NativeContactsRaw {
  getAccounts(): Promise<RawAccount[]>;
  dump(accountType: string | null, limit: number): Promise<RawDump>;
  dataRows(mimetypes: string[]): Promise<DataRow[]>;
  contactPhotos(): Promise<ContactPhoto[]>;
}

/** Есть только в собранном Android-приложении (не в Expo Go, не на iOS и не в браузере). */
const native = requireOptionalNativeModule<NativeContactsRaw>('ContactsRaw');

export const contactsRawAvailable = native != null;

export function getAccounts(): Promise<RawAccount[]> {
  if (!native) return Promise.reject(new Error('Модуль ContactsRaw недоступен на этой платформе'));
  return native.getAccounts();
}

export function dumpAccount(accountType: string | null, limit = 300): Promise<RawDump> {
  if (!native) return Promise.reject(new Error('Модуль ContactsRaw недоступен на этой платформе'));
  return native.dump(accountType, limit);
}

export function dataRows(mimetypes: string[]): Promise<DataRow[]> {
  if (!native) return Promise.reject(new Error('Модуль ContactsRaw недоступен на этой платформе'));
  return native.dataRows(mimetypes);
}

export function contactPhotos(): Promise<ContactPhoto[]> {
  if (!native) return Promise.reject(new Error('Модуль ContactsRaw недоступен на этой платформе'));
  return native.contactPhotos();
}
