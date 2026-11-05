import type { RawAccount, RawDump } from '../../modules/contacts-raw';

/** Пример для превью в браузере: так выглядят данные, которые мессенджеры кладут в телефонную книгу Android. */
export const SAMPLE_ACCOUNTS: RawAccount[] = [
  { accountType: '', accountName: '', rawContacts: 2 },
  { accountType: 'com.google', accountName: 'me@gmail.com', rawContacts: 2 },
  { accountType: 'org.telegram.messenger', accountName: '+79990000000', rawContacts: 2 },
  { accountType: 'com.whatsapp', accountName: 'WhatsApp', rawContacts: 1 },
];

const item = (id: number, type: string, name: string, data: Record<string, string | number>[]) => ({
  raw: { _id: id, contact_id: id + 100, account_type: type, display_name: name, sync1: `${id}` },
  data,
});

export const SAMPLE_DUMPS: Record<string, RawDump> = {
  '': {
    accountType: '',
    total: 2,
    items: [
      item(1, '', 'Аня', [
        { mimetype: 'vnd.android.cursor.item/name', data1: 'Аня', data2: 'Аня' },
        { mimetype: 'vnd.android.cursor.item/phone_v2', data1: '+7 999 123-45-67', data2: 2 },
      ]),
      item(2, '', 'Дима Петров', [
        { mimetype: 'vnd.android.cursor.item/name', data1: 'Дима Петров', data2: 'Дима', data3: 'Петров' },
        { mimetype: 'vnd.android.cursor.item/phone_v2', data1: '+7 985 777-66-55', data2: 2 },
        { mimetype: 'vnd.android.cursor.item/contact_event', data1: '1993-12-30', data2: 3 },
      ]),
    ],
  },
  'com.google': {
    accountType: 'com.google',
    total: 2,
    items: [
      item(3, 'com.google', 'Катя Орлова', [
        { mimetype: 'vnd.android.cursor.item/name', data1: 'Катя Орлова' },
        { mimetype: 'vnd.android.cursor.item/contact_event', data1: '--02-14', data2: 3 },
        { mimetype: 'vnd.android.cursor.item/note', data1: 'Любит пионы' },
      ]),
      item(4, 'com.google', 'Папа', [{ mimetype: 'vnd.android.cursor.item/name', data1: 'Папа' }]),
    ],
  },
  'org.telegram.messenger': {
    accountType: 'org.telegram.messenger',
    total: 2,
    items: [
      item(5, 'org.telegram.messenger', 'Аня', [
        { mimetype: 'vnd.android.cursor.item/name', data1: 'Аня' },
        { mimetype: 'vnd.android.cursor.item/vnd.org.telegram.messenger.android.profile', data1: 123456789, data2: 'Telegram Profile', data3: '+79991234567' },
        { mimetype: 'vnd.android.cursor.item/vnd.org.telegram.messenger.android.call', data1: 123456789, data2: 'Telegram Voice Call' },
      ]),
      item(6, 'org.telegram.messenger', 'Дима Петров', [
        { mimetype: 'vnd.android.cursor.item/name', data1: 'Дима Петров' },
        { mimetype: 'vnd.android.cursor.item/vnd.org.telegram.messenger.android.profile', data1: 987654321, data2: 'Telegram Profile', data3: '+79857776655' },
      ]),
    ],
  },
  'com.whatsapp': {
    accountType: 'com.whatsapp',
    total: 1,
    items: [
      item(7, 'com.whatsapp', 'Аня', [
        { mimetype: 'vnd.android.cursor.item/name', data1: 'Аня' },
        { mimetype: 'vnd.android.cursor.item/vnd.com.whatsapp.profile', data1: '79991234567@s.whatsapp.net', data2: 'WhatsApp', data3: 'Написать +7 999 123-45-67' },
        { mimetype: 'vnd.android.cursor.item/vnd.com.whatsapp.voip.call', data1: '79991234567@s.whatsapp.net', data3: 'Аудиозвонок +7 999 123-45-67' },
      ]),
    ],
  },
};
