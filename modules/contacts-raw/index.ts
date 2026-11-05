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

interface NativeContactsRaw {
  getAccounts(): Promise<RawAccount[]>;
  dump(accountType: string | null, limit: number): Promise<RawDump>;
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
