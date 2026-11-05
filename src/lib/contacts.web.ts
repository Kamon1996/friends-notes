import type { RawContact } from './contactsImport';

export type ContactsResult =
  | { status: 'granted'; contacts: RawContact[]; limited: boolean; sample: boolean }
  | { status: 'denied'; canAskAgain: boolean };

/** В браузере доступа к телефонной книге нет — показываем пример, чтобы было видно, как работает импорт. */
export async function loadContacts(): Promise<ContactsResult> {
  const contacts: RawContact[] = [
    { id: 's1', fullName: 'Алина Смирнова', phones: [{ number: '+7 916 555-12-34' }], birthday: { year: 1997, month: 4, day: 12 } },
    { id: 's2', fullName: 'Борис Ким', phones: [{ number: '+7 903 111-22-33' }], birthday: { month: 9, day: 3 } },
    { id: 's3', fullName: 'Вика', phones: [{ number: '8 926 000-00-01' }] },
    { id: 's4', fullName: 'Дима Петров', phones: [{ number: '+7 985 777-66-55' }], birthday: { year: 1993, month: 12, day: 30 }, dates: [{ label: 'anniversary', date: { year: 2018, month: 6, day: 15 } }] },
    { id: 's5', fullName: 'Катя Орлова', phones: [{ number: '+7 999 234-56-78' }], birthday: { year: 1999, month: 2, day: 14 } },
    { id: 's6', fullName: 'Аня', phones: [{ number: '+7 999 123-45-67' }] },
    { id: 's7', fullName: 'Папа', phones: [{ number: '+7 901 222-33-44' }], birthday: { year: 1964, month: 7, day: 21 } },
    { id: 's8', fullName: 'Серёжа Волков', phones: [{ number: '+7 925 333-44-55' }] },
  ];
  return { status: 'granted', contacts, limited: false, sample: true };
}

export async function pickMoreContacts(): Promise<void> {}

export type Enrichment = Map<string, { links: { telegramId?: number; whatsapp?: string; viber?: string }; photoUri: string | null }>;

/** В браузере телефонной книги нет. */
export async function loadEnrichment(): Promise<Enrichment> {
  return new Map();
}
