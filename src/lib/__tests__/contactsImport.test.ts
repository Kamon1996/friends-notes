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

test('номера сравниваются по последним 10 цифрам', () => {
  assert.equal(phoneKey('+7 (999) 123-45-67'), phoneKey('8 999 1234567'));
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
