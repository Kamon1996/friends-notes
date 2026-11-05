/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { candidateToFriend, contactDateToISO, phoneKey, toCandidates, type RawContact } from '../contactsImport';
import type { Friend } from '../types';

test('даты из контактов', () => {
  assert.equal(contactDateToISO({ year: 1995, month: 11, day: 8 }), '1995-11-08');
  assert.equal(contactDateToISO({ month: 2, day: 29 }), '1904-02-29');
  assert.equal(contactDateToISO({ month: 13, day: 1 }), null);
  assert.equal(contactDateToISO({ year: 2026, month: 2, day: 30 }), null);
  assert.equal(contactDateToISO(null), null);
});

test('номера сравниваются по номеру абонента', () => {
  assert.equal(phoneKey('+7 (999) 123-45-67'), phoneKey('8 999 1234567'));
  assert.equal(phoneKey('+375 29 111-22-33'), phoneKey('80 29 111-22-33'));
  assert.equal(phoneKey('+380 95 111 22 33'), phoneKey('095 111 22 33'));
});

const existing: Friend[] = [
  { id: 'f', name: 'Аня', emoji: '🌸', birthday: null, phone: '+7 999 123-45-67', food: '', flowers: '', gifts: '', notes: '', dates: [], createdAt: 0 },
];

test('кандидаты: имя, дубликаты, даты, сортировка', () => {
  const raw: RawContact[] = [
    { id: '1', givenName: 'Дима', familyName: 'Петров', phones: [{ number: '+7 985 777-66-55' }], birthday: { year: 1993, month: 12, day: 30 },
      dates: [{ label: '_$!<Anniversary>!$_', date: { year: 2018, month: 6, day: 15 } }, { label: 'birthday', date: { year: 1993, month: 12, day: 30 } }] },
    { id: '2', fullName: 'Анна', phones: [{ number: '8 (999) 123-45-67' }] },
    { id: '3', fullName: '  ', phones: [{ number: '+7 900 000-00-00' }] },
    { id: '4', fullName: 'аня' },
    { id: '5', fullName: 'Борис', note: ' любит джаз ' },
    { id: '6', fullName: 'Борис' },
  ];
  const c = toCandidates(raw, existing);
  assert.deepEqual(c.map((x) => x.name), ['Анна', 'аня', 'Борис', 'Дима Петров']);
  assert.equal(c[0].duplicateOf, 'Аня'); // совпал телефон
  assert.equal(c[1].duplicateOf, 'Аня'); // совпало имя
  assert.equal(c[2].duplicateOf, null);
  assert.equal(c[2].note, 'любит джаз');
  const dima = c[3];
  assert.equal(dima.birthday, '1993-12-30');
  assert.deepEqual(dima.dates, [{ title: 'Годовщина', date: '2018-06-15' }]);

  let n = 0;
  const f = candidateToFriend(dima, 'id1', () => `d${++n}`);
  assert.equal(f.phone, '+7 985 777-66-55');
  assert.equal(f.dates[0].yearly, true);
  assert.equal(f.dates[0].id, 'd1');
});

test('разбор дат в разных форматах', async () => {
  const { parseLooseDate } = await import('../contactsImport');
  assert.deepEqual(parseLooseDate('1990-05-12'), { year: 1990, month: 5, day: 12 });
  assert.deepEqual(parseLooseDate('1990-05-12T00:00:00.000Z'), { year: 1990, month: 5, day: 12 });
  assert.deepEqual(parseLooseDate('--05-12'), { month: 5, day: 12 });
  assert.deepEqual(parseLooseDate('--0512'), { month: 5, day: 12 });
  assert.deepEqual(parseLooseDate('19900512'), { year: 1990, month: 5, day: 12 });
  assert.deepEqual(parseLooseDate('12.05.1990'), { year: 1990, month: 5, day: 12 });
  assert.deepEqual(parseLooseDate('12.05'), { year: undefined, month: 5, day: 12 });
  assert.deepEqual(parseLooseDate('1990/05/12'), { year: 1990, month: 5, day: 12 });
  assert.deepEqual(parseLooseDate('05/25/1990'), { year: 1990, month: 5, day: 25 });
  assert.equal(parseLooseDate('May 12'), null);
  assert.equal(parseLooseDate(''), null);
});

test('контакты из старого API: Android (rawDates) и iOS (месяцы с 0)', async () => {
  const { fromLegacyContact } = await import('../contactsImport');
  const android = fromLegacyContact(
    {
      id: 'a',
      name: 'Лена',
      phoneNumbers: [{ number: '+7 900 1' }],
      rawDates: [
        { type: 'birthday', value: '12.05.1990' },
        { type: 'anniversary', value: '--06-15' },
        { type: 'other', value: 'мусор' },
      ],
    },
    0,
  );
  assert.deepEqual(android.birthday, { year: 1990, month: 5, day: 12 });
  assert.deepEqual(android.dates, [{ label: 'anniversary', date: { month: 6, day: 15 } }]);
  const ios = fromLegacyContact({ name: 'Олег', birthday: { year: 1985, month: 0, day: 31 }, dates: [{ label: 'anniversary', month: 11, day: 1 }] }, 3);
  assert.equal(ios.id, 'legacy-3');
  assert.deepEqual(ios.birthday, { year: 1985, month: 1, day: 31 });
  assert.deepEqual(ios.dates, [{ label: 'anniversary', date: { year: undefined, month: 12, day: 1 } }]);

  // iOS: год 1604 означает «без года»
  const [c] = toCandidates([{ id: 'x', fullName: 'Без года', birthday: { year: 1604, month: 3, day: 8 } }], []);
  assert.equal(c.birthday, '1904-03-08');
  // Android (новый API): день рождения внутри dates
  const [d] = toCandidates([{ id: 'y', fullName: 'Даша', dates: [{ label: 'birthday', date: { year: 2000, month: 1, day: 2 } }] }], []);
  assert.equal(d.birthday, '2000-01-02');
  assert.deepEqual(d.dates, []);
});

test('своя метка дня рождения и контакты без имени в конце', async () => {
  const { fromLegacyContact } = await import('../contactsImport');
  const c = fromLegacyContact({ name: 'Света', rawDates: [{ type: 'День рождения', value: '1991-07-07' }] }, 0);
  assert.deepEqual(c.birthday, { year: 1991, month: 7, day: 7 });
  const list = toCandidates(
    [
      { id: '1', fullName: '+375256072741', phones: [{ number: '+375256072741' }] },
      { id: '2', fullName: 'Яна' },
      { id: '3', fullName: '069', phones: [{ number: '80447888069' }] },
      { id: '4', fullName: 'Антон' },
    ],
    [],
  );
  assert.deepEqual(list.map((x) => x.name), ['Антон', 'Яна', '+375256072741', '069']);
});

test('копии людей без номера от мессенджеров пропускаются', () => {
  const list = toCandidates(
    [
      { id: '1', fullName: 'Олег Иванов', phones: [{ number: '+7 900 111-22-33' }] },
      { id: '2', fullName: 'Олег Иванов' },
      { id: '3', fullName: 'Только в мессенджере' },
    ],
    [],
  );
  assert.deepEqual(list.map((x) => [x.name, x.phone]), [['Олег Иванов', '+7 900 111-22-33'], ['Только в мессенджере', '']]);
});

test('Telegram: преобразование контакта и разбор ошибок', async () => {
  const { tgToRawContact, floodWaitSeconds, tgErrorText } = await import('../telegramImport');
  const raw = tgToRawContact({
    id: 42,
    firstName: 'Лена',
    lastName: 'Ким',
    phoneNumber: '79991112233',
    usernames: ['lena_k'],
    birthdate: { day: 5, month: 3, year: 0 },
    bio: 'Люблю горы',
  });
  assert.equal(raw.id, 'tg-42');
  assert.equal(raw.fullName, 'Лена Ким');
  assert.deepEqual(raw.phones, [{ number: '+79991112233' }]);
  assert.deepEqual(raw.birthday, { day: 5, month: 3, year: undefined });
  assert.equal(raw.note, 'Telegram: @lena_k\nО себе: Люблю горы');
  assert.deepEqual(raw.links, { telegramId: 42 });
  assert.equal(raw.photoUri, null);
  const withPhoto = tgToRawContact({ id: 7, firstName: 'Ира', lastName: '', phoneNumber: '', usernames: [], birthdate: null, bio: null, photoUri: 'file:///x/7.jpg' });
  assert.equal(toCandidates([withPhoto], [])[0].photoUri, 'file:///x/7.jpg');
  const [c] = toCandidates([raw], []);
  assert.equal(c.birthday, '1904-03-05'); // год скрыт

  assert.equal(floodWaitSeconds('Too Many Requests: retry after 17'), 17);
  assert.equal(floodWaitSeconds('FLOOD_WAIT_300'), 300);
  assert.equal(floodWaitSeconds('PHONE_CODE_INVALID'), null);
  assert.match(tgErrorText(new Error('PHONE_CODE_INVALID')), /Неверный код/);
});
