/// <reference types="node" />
// Даты друзей в календаре телефона и в файле .ics: какие события, с какими датами и как синхронизируются.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { BASE_YEAR, LEAP_YEARS_AHEAD, calendarItems, diffCalendar, eventSignature, planCalendarEvents } from '../calendarPlan';
import { buildIcs, escapeText, fold } from '../ics';
import { DEFAULT_SETTINGS, EMPTY_DATA, type AppData, type Friend } from '../types';

const friend = (patch: Partial<Friend>): Friend => ({
  id: 'f',
  name: 'Аня Смирнова',
  emoji: '',
  birthday: null,
  phone: '',
  food: '',
  flowers: '',
  gifts: '',
  notes: '',
  dates: [],
  createdAt: 0,
  ...patch,
});
const data = (friends: Friend[]): AppData => ({ ...EMPTY_DATA, friends, settings: DEFAULT_SETTINGS });

describe('какие даты попадают в календарь', () => {
  test('день рождения с годом: повтор каждый год с настоящей даты, год рождения в описании', () => {
    const [b] = calendarItems(data([friend({ birthday: '1995-11-07' })]));
    assert.deepEqual([b.key, b.title, b.date, b.yearly], ['b-f', '🎂 Аня Смирнова', '1995-11-07', true]);
    assert.match(b.notes, /^Дата рождения: 7 ноября 1995\.\nИз приложения «Друзья»\.$/);
  });

  test('день рождения без года: повтор с той же даты в базовом году, без года в описании', () => {
    const [b] = calendarItems(data([friend({ birthday: '1904-03-05' })]));
    assert.equal(b.date, `${BASE_YEAR}-03-05`);
    assert.equal(b.notes, 'Из приложения «Друзья».');
  });

  test('важные даты: ежегодные с годом начала, разовые как есть, недозаполненные пропускаются', () => {
    const f = friend({
      dates: [
        { id: 'w', title: 'Свадьба', date: '2021-12-22', yearly: true },
        { id: 'm', title: 'Переезд', date: '2027-04-01', yearly: false },
        { id: 'n', title: 'Без даты', date: '', yearly: true },
        { id: 't', title: '  ', date: '2020-01-01', yearly: true },
      ],
    });
    const items = calendarItems(data([f]));
    assert.deepEqual(items.map((i) => [i.key, i.title, i.date, i.yearly]), [
      ['d-w', '♥ Свадьба · Аня Смирнова', '2021-12-22', true],
      ['d-m', '♥ Переезд · Аня Смирнова', '2027-04-01', false],
    ]);
    assert.match(items[0].notes, /^С 2021 года\./);
  });
});

describe('события в календаре телефона', () => {
  test('обычные годовщины — по одному событию с повтором', () => {
    const plan = planCalendarEvents(data([friend({ birthday: '1995-11-07' })]), '2026-11-08');
    assert.deepEqual(plan, [{ key: 'b-f', title: '🎂 Аня Смирнова', notes: 'Дата рождения: 7 ноября 1995.\nИз приложения «Друзья».', date: '1995-11-07', yearly: true }]);
  });

  test('29 февраля — отдельные события по годам: 28-го в невисокосный год, с возрастом в названии', () => {
    const plan = planCalendarEvents(data([friend({ birthday: '2000-02-29' })]), '2026-11-08');
    assert.equal(plan.length, LEAP_YEARS_AHEAD);
    assert.deepEqual(plan.slice(0, 3).map((e) => [e.key, e.date, e.title, e.yearly]), [
      ['b-f-2026', '2026-02-28', '🎂 Аня Смирнова · 26 лет', false],
      ['b-f-2027', '2027-02-28', '🎂 Аня Смирнова · 27 лет', false],
      ['b-f-2028', '2028-02-29', '🎂 Аня Смирнова · 28 лет', false],
    ]);
    const noYear = planCalendarEvents(data([friend({ birthday: '1904-02-29' })]), '2026-11-08');
    assert.equal(noYear[0].title, '🎂 Аня Смирнова');
  });
});

describe('синхронизация с календарём', () => {
  const plan = planCalendarEvents(data([friend({ id: 'a', birthday: '1995-11-07' }), friend({ id: 'b', name: 'Игорь', birthday: '1992-06-13' })]), '2026-11-08');

  test('с нуля всё создаётся', () => {
    const d = diffCalendar(plan, {});
    assert.deepEqual([d.create.length, d.replace.length, d.remove.length], [2, 0, 0]);
  });

  test('без изменений ничего не трогаем; изменённое пересоздаём; удалённого друга убираем', () => {
    const stored = { 'b-a': { id: '1', sig: eventSignature(plan[0]) }, 'b-b': { id: '2', sig: eventSignature(plan[1]) } };
    assert.deepEqual(diffCalendar(plan, stored), { create: [], replace: [], remove: [], keep: stored });

    const renamed = [{ ...plan[0], title: '🎂 Анна Смирнова' }, plan[1]];
    const d = diffCalendar(renamed, stored);
    assert.deepEqual(d.replace.map((r) => [r.id, r.event.title]), [['1', '🎂 Анна Смирнова']]);

    const gone = diffCalendar([plan[1]], stored);
    assert.deepEqual([gone.remove, Object.keys(gone.keep)], [['1'], ['b-b']]);
  });
});

describe('файл .ics', () => {
  const ics = buildIcs(
    data([
      friend({ id: 'a', birthday: '1995-11-07' }),
      friend({ id: 'l', name: 'Лера; «Лерочка», друг', birthday: '2000-02-29', dates: [{ id: 'w', title: 'Свадьба', date: '2021-12-22', yearly: true }] }),
    ]),
    new Date(Date.UTC(2026, 10, 8, 4, 0, 0)),
  );

  test('календарь с событиями на весь день, повтором и стабильными UID', () => {
    assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
    assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
    assert.equal(ics.split('BEGIN:VEVENT').length - 1, 3);
    assert.ok(ics.includes('UID:b-a@friends-notes\r\nDTSTAMP:20261108T040000Z\r\nDTSTART;VALUE=DATE:19951107\r\nDTEND;VALUE=DATE:19951108\r\nRRULE:FREQ=YEARLY\r\n'));
    assert.ok(ics.includes('DTSTART;VALUE=DATE:20000229\r\nDTEND;VALUE=DATE:20000301\r\nRRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1\r\n'), '29 февраля — последний день февраля');
    assert.ok(!/\r(?!\n)|(?<!\r)\n/.test(ics), 'только CRLF');
  });

  test('спецсимволы экранируются, длинные строки переносятся по байтам, не разрывая буквы', () => {
    assert.equal(escapeText('a;b,c\\d\ne'), 'a\;b\\,c\\\\d\\ne');
    assert.ok(ics.includes('SUMMARY:🎂 Лера\; «Лерочка»\\, друг'));
    const long = fold(`DESCRIPTION:${'Ю'.repeat(80)}`);
    const enc = new TextEncoder();
    for (const line of long.split('\r\n')) assert.ok(enc.encode(line).length <= 75, line);
    assert.equal(long.replace(/\r\n /g, ''), `DESCRIPTION:${'Ю'.repeat(80)}`);
  });
});
