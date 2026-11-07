import type { RawContact } from './contactsImport';

export type ContactsResult =
  | { status: 'granted'; contacts: RawContact[]; limited: boolean; sample: boolean }
  | { status: 'denied'; canAskAgain: boolean };

/** В браузере доступа к телефонной книге нет — показываем пример, чтобы было видно, как работает импорт. */
export async function loadContacts(): Promise<ContactsResult> {
  const contacts: RawContact[] = [
    { id: 's1', fullName: 'Алина Смирнова', phones: [{ number: '+7 916 555-12-34' }], birthday: { year: 1997, month: 4, day: 12 }, links: { telegramId: 111, whatsapp: '79165551234' } },
    { id: 's2', fullName: 'Борис Ким', phones: [{ number: '+7 903 111-22-33' }], birthday: { month: 9, day: 3 } },
    { id: 's3', fullName: 'Вика', phones: [{ number: '8 926 000-00-01' }] },
    { id: 's4', fullName: 'Дима Петров', phones: [{ number: '+7 985 777-66-55' }], birthday: { year: 1993, month: 12, day: 30 }, dates: [{ label: 'anniversary', date: { year: 2018, month: 6, day: 15 } }] },
    { id: 's5', fullName: 'Катя Орлова', phones: [{ number: '+7 999 234-56-78' }], birthday: { year: 1999, month: 2, day: 14 }, links: { telegramId: 333 }, websites: ['https://www.instagram.com/katya.orlova'] },
    { id: 's6', fullName: 'Аня', phones: [{ number: '+7 999 123-45-67' }] },
    { id: 's7', fullName: 'Папа', phones: [{ number: '+7 901 222-33-44' }], birthday: { year: 1964, month: 7, day: 21 } },
    { id: 's8', fullName: 'Серёжа Волков', phones: [{ number: '+7 925 333-44-55' }], links: { telegramId: 444, viber: '79253334455' } },
  ];
  // Для стресс-теста в браузере: localStorage «friends-notes/sample-count» = N даёт N выдуманных контактов.
  let n = 0;
  try {
    n = Number(globalThis.localStorage?.getItem('friends-notes/sample-count') ?? 0);
  } catch {
    n = 0;
  }
  if (n > 0) {
    const first = ['Аня', 'Борис', 'Вика', 'Глеб', 'Даша', 'Егор', 'Жанна', 'Зоя', 'Иван', 'Катя', 'Лена', 'Миша', 'Нина', 'Олег', 'Паша', 'Рита', 'Саша', 'Таня', 'Уля', 'Федя'];
    const last = ['Смирнова', 'Ким', 'Петров', 'Орлова', 'Волков', 'Белова', 'Громова', 'Ветров', 'Козлов', 'Новикова'];
    for (let i = 0; i < n; i++) {
      contacts.push({
        id: `g${i}`,
        fullName: `${first[i % first.length]} ${last[(i * 7) % last.length]}${i >= 200 ? ' ' + (i + 1) : ''}`,
        phones: [{ number: `+7 9${String(i).padStart(2, '0')} ${String(100 + (i % 900)).padStart(3, '0')}-${String(i % 100).padStart(2, '0')}-${String((i * 3) % 100).padStart(2, '0')}` }],
        birthday: i % 3 === 0 ? { year: 1970 + (i % 35), month: 1 + (i % 12), day: 1 + (i % 28) } : undefined,
        links: i % 4 === 0 ? { telegramId: 1000 + i } : undefined,
      });
    }
  }
  // «friends-notes/sample-quiet» = 1 прячет плашку «это пример» — для скриншотов витрины.
  return { status: 'granted', contacts, limited: false, sample: globalThis.localStorage?.getItem('friends-notes/sample-quiet') !== '1' };
}

export async function pickMoreContacts(): Promise<void> {}

export type Enrichment = Map<string, { links: { telegramId?: number; whatsapp?: string; viber?: string }; photoUri: string | null; thumbUri?: string | null }>;

/** В браузере телефонной книги нет. */
export async function loadEnrichment(): Promise<Enrichment> {
  return new Map();
}
