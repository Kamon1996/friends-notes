/// <reference types="node" />
// Даты друзей в календаре телефона и в файле .ics: какие события, с какими датами и как синхронизируются.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { BASE_YEAR, CALENDAR_YEARS, calendarItems, diffCalendar, eventSignature, planCalendarEvents, sameEvent, titleMentions, withoutDuplicates, type ContactBirthday } from '../calendarPlan';
import { phoneKey } from '../messengers';
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
  const view = (plan: ReturnType<typeof planCalendarEvents>) => plan.map((e) => [e.key, e.date, e.title]);

  test('каждый год — отдельное событие с возрастом: этот год и два следующих, без повтора', () => {
    const plan = planCalendarEvents(data([friend({ birthday: '1995-11-07' })]), '2026-11-08');
    assert.equal(CALENDAR_YEARS, 3);
    assert.deepEqual(view(plan), [
      ['b-f-2026', '2026-11-07', '🎂 Аня Смирнова · 31 год'],
      ['b-f-2027', '2027-11-07', '🎂 Аня Смирнова · 32 года'],
      ['b-f-2028', '2028-11-07', '🎂 Аня Смирнова · 33 года'],
    ]);
    assert.ok(plan.every((e) => !e.yearly && e.notes === 'Дата рождения: 7 ноября 1995.\nИз приложения «Друзья».'));
  });

  test('с новым годом окно сдвигается: прошлогоднее уходит, добавляется ещё один год', () => {
    const plan = planCalendarEvents(data([friend({ birthday: '1995-11-07' })]), '2027-01-01');
    assert.deepEqual(plan.map((e) => e.key), ['b-f-2027', 'b-f-2028', 'b-f-2029']);
  });

  test('без года — без возраста; 29 февраля в невисокосный год — 28-го', () => {
    assert.deepEqual(view(planCalendarEvents(data([friend({ birthday: '1904-03-05' })]), '2026-11-08'))[0], ['b-f-2026', '2026-03-05', '🎂 Аня Смирнова']);
    assert.deepEqual(view(planCalendarEvents(data([friend({ birthday: '2000-02-29' })]), '2026-11-08')), [
      ['b-f-2026', '2026-02-28', '🎂 Аня Смирнова · 26 лет'],
      ['b-f-2027', '2027-02-28', '🎂 Аня Смирнова · 27 лет'],
      ['b-f-2028', '2028-02-29', '🎂 Аня Смирнова · 28 лет'],
    ]);
  });

  test('важные даты: годовщины с числом лет и не раньше первой, разовые — только если попадают в окно', () => {
    const f = friend({
      dates: [
        { id: 'w', title: 'Свадьба', date: '2021-12-22', yearly: true },
        { id: 'z', title: 'Знакомство', date: '2027-05-01', yearly: true },
        { id: 'm', title: 'Переезд', date: '2027-04-01', yearly: false },
        { id: 'o', title: 'Выпускной', date: '2025-06-20', yearly: false },
      ],
    });
    assert.deepEqual(view(planCalendarEvents(data([f]), '2026-11-08')), [
      ['d-w-2026', '2026-12-22', '♥ Свадьба · Аня Смирнова · 5 лет'],
      ['d-w-2027', '2027-12-22', '♥ Свадьба · Аня Смирнова · 6 лет'],
      ['d-w-2028', '2028-12-22', '♥ Свадьба · Аня Смирнова · 7 лет'],
      ['d-z-2027', '2027-05-01', '♥ Знакомство · Аня Смирнова'],
      ['d-z-2028', '2028-05-01', '♥ Знакомство · Аня Смирнова · 1 год'],
      ['d-m', '2027-04-01', '♥ Переезд · Аня Смирнова'],
    ]);
  });
});

describe('без дублей', () => {
  const anya = friend({ id: 'a', birthday: '1995-11-07', phone: '+7 999 123-45-67', dates: [{ id: 'w', title: 'Свадьба', date: '2021-12-22', yearly: true }] });
  const igor = friend({ id: 'i', name: 'Игорь', birthday: '1992-06-13' });
  const d = data([anya, igor]);
  const plan = planCalendarEvents(d, '2026-11-08');
  const keys = (list: ReturnType<typeof planCalendarEvents>) => list.map((e) => e.key);
  const contact = (patch: Partial<ContactBirthday>): ContactBirthday => ({ name: 'Кто-то', phones: [], month: 11, day: 7, ...patch });

  test('имя в другом падеже узнаётся, похожее имя — нет', () => {
    assert.ok(titleMentions('День рождения Ани Смирновой', 'Аня Смирнова'));
    assert.ok(titleMentions('ДР Яна', 'Ян'));
    assert.ok(!titleMentions('Совещание 5 января', 'Ян'), '«января» — не «Ян»');
    assert.ok(!titleMentions('ДР Андрея', 'Аня'));
    assert.ok(!titleMentions('Ужин', ''));
  });

  test('что считается тем же событием', () => {
    const b = { kind: 'birthday' as const, name: 'Аня Смирнова', label: '' };
    assert.ok(sameEvent(b, 'Аня Смирнова'), 'календарь «Дни рождения» подписывает просто именем');
    assert.ok(sameEvent(b, 'ДР Ани'));
    assert.ok(sameEvent(b, '🎂 Аня'));
    assert.ok(sameEvent(b, 'Birthday: Аня Смирнова'));
    assert.ok(!sameEvent(b, 'Ужин с Аней Смирновой'), 'встреча в день рождения — не дубль');
    assert.ok(!sameEvent(b, 'ДР Игоря'));
    const mom = { kind: 'birthday' as const, name: 'Мама', label: '' };
    assert.ok(sameEvent(mom, 'День рождения мамы'));
    assert.ok(!sameEvent(mom, 'Позвонить маме'));
    const wedding = { kind: 'date' as const, name: 'Аня Смирнова', label: 'Свадьба' };
    assert.ok(sameEvent(wedding, 'Годовщина свадьбы Ани и Пети'));
    assert.ok(!sameEvent(wedding, 'Аня Смирнова'));
  });

  test('день рождения из контактов (по номеру или имени, тот же день) не повторяем — у остальных всё на месте', () => {
    const byPhone = withoutDuplicates(plan, d, [], [contact({ name: 'Анюта', phones: ['8 (999) 123-45-67'] })], phoneKey);
    assert.deepEqual(keys(byPhone), keys(plan).filter((k) => !k.startsWith('b-a-')));
    const byName = withoutDuplicates(plan, d, [], [contact({ name: 'аня  смирнова' })], phoneKey);
    assert.equal(keys(byName).filter((k) => k.startsWith('b-a-')).length, 0);
    const otherDay = withoutDuplicates(plan, d, [], [contact({ name: 'Аня Смирнова', day: 8 })], phoneKey);
    assert.deepEqual(keys(otherDay), keys(plan), 'в контактах другой день — значит, не тот');
    const shortPhone = withoutDuplicates(plan, data([{ ...anya, name: 'А', phone: '123' }]), [], [contact({ phones: ['123'] })], phoneKey);
    assert.equal(shortPhone.length, plan.length, 'короткий номер не повод');
  });

  test('событие из другого календаря убирает только свой год', () => {
    const left = withoutDuplicates(plan, d, [{ title: 'ДР Ани', date: '2027-11-07' }, { title: 'Ани', date: '2026-06-13' }], [], phoneKey);
    assert.deepEqual(
      keys(plan).filter((k) => !keys(left).includes(k)),
      ['b-a-2027'],
    );
  });
});

describe('синхронизация с календарём', () => {
  const plan = planCalendarEvents(data([friend({ id: 'a', birthday: '1995-11-07' }), friend({ id: 'b', name: 'Игорь', birthday: '1992-06-13' })]), '2026-11-08', 1);

  test('с нуля всё создаётся', () => {
    const d = diffCalendar(plan, {});
    assert.deepEqual([d.create.length, d.replace.length, d.remove.length], [2, 0, 0]);
  });

  test('без изменений ничего не трогаем; изменённое пересоздаём; удалённого друга убираем', () => {
    const stored = { 'b-a-2026': { id: '1', sig: eventSignature(plan[0]) }, 'b-b-2026': { id: '2', sig: eventSignature(plan[1]) } };
    assert.deepEqual(diffCalendar(plan, stored), { create: [], replace: [], remove: [], keep: stored });

    const renamed = [{ ...plan[0], title: '🎂 Анна Смирнова · 31 год' }, plan[1]];
    const d = diffCalendar(renamed, stored);
    assert.deepEqual(d.replace.map((r) => [r.id, r.event.title]), [['1', '🎂 Анна Смирнова · 31 год']]);

    const gone = diffCalendar([plan[1]], stored);
    assert.deepEqual([gone.remove, Object.keys(gone.keep)], [['1'], ['b-b-2026']]);
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
