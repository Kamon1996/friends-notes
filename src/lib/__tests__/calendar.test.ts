/// <reference types="node" />
// Даты друзей в календаре телефона и в файле .ics: какие события, с какими датами и названиями, что считается дублем.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  BASE_YEAR,
  CALENDAR_SIGNATURE,
  calendarItems,
  calendarYears,
  diffCalendar,
  eventSignature,
  planCalendarEvents,
  sameEvent,
  splitDuplicates,
  titleMentions,
  type ContactBirthday,
  type PlannedEvent,
} from '../calendarPlan';
import { buildIcs, escapeText, fold } from '../ics';
import { phoneKey } from '../messengers';
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
const view = (plan: PlannedEvent[]) => plan.map((e) => [e.key, e.date, e.title]);
const TODAY = '2026-11-08';

describe('какие даты попадают в календарь', () => {
  test('день рождения с годом: настоящая дата, год рождения в описании, подпись приложения', () => {
    const [b] = calendarItems(data([friend({ birthday: '1995-11-07' })]));
    assert.deepEqual([b.key, b.title, b.date, b.yearly, b.startYear], ['b-f', '🎂 Аня Смирнова', '1995-11-07', true, 1995]);
    assert.equal(b.notes, `Дата рождения: 7 ноября 1995.\n${CALENDAR_SIGNATURE}`);
  });

  test('день рождения без года: та же дата в базовом году, в описании только подпись', () => {
    const [b] = calendarItems(data([friend({ birthday: '1904-03-05' })]));
    assert.deepEqual([b.date, b.startYear, b.notes], [`${BASE_YEAR}-03-05`, undefined, CALENDAR_SIGNATURE]);
  });

  test('важные даты: ежегодные с годом начала, разовые как есть, без названия или числа — пропускаются', () => {
    const f = friend({
      dates: [
        { id: 'w', title: ' Свадьба ', date: '2021-12-22', yearly: true },
        { id: 'k', title: 'Знакомство', date: '1904-05-01', yearly: true },
        { id: 'm', title: 'Переезд', date: '2027-04-01', yearly: false },
        { id: 'n', title: 'Без даты', date: '', yearly: true },
        { id: 't', title: '  ', date: '2020-01-01', yearly: true },
      ],
    });
    const items = calendarItems(data([f]));
    assert.deepEqual(
      items.map((i) => [i.key, i.title, i.date, i.yearly, i.label]),
      [
        ['d-w', '♥ Свадьба · Аня Смирнова', '2021-12-22', true, 'Свадьба'],
        ['d-k', '♥ Знакомство · Аня Смирнова', `${BASE_YEAR}-05-01`, true, 'Знакомство'],
        ['d-m', '♥ Переезд · Аня Смирнова', '2027-04-01', false, 'Переезд'],
      ],
    );
    assert.match(items[0].notes, /^С 2021 года\./);
    assert.ok(items.every((i) => i.notes.endsWith(CALENDAR_SIGNATURE)), 'по подписи приложение узнаёт свои события');
  });

  test('друзья без дат календарь не засоряют', () => {
    assert.deepEqual(calendarItems(data([friend({}), friend({ id: 'g', name: 'Игорь' })])), []);
    assert.deepEqual(planCalendarEvents(data([]), TODAY), []);
  });
});

describe('события по годам', () => {
  test('окно: прошлый год, этот и два следующих', () => {
    assert.deepEqual(calendarYears(TODAY), [2025, 2026, 2027, 2028]);
    assert.deepEqual(calendarYears('2027-01-01'), [2026, 2027, 2028, 2029]);
    assert.deepEqual(calendarYears('2026-12-31'), [2025, 2026, 2027, 2028]);
  });

  test('каждый год — отдельное событие на весь день с возрастом и склонением «год/года/лет»', () => {
    const plan = planCalendarEvents(data([friend({ birthday: '1995-11-07' })]), TODAY);
    assert.deepEqual(view(plan), [
      ['b-f-2025', '2025-11-07', '🎂 Аня Смирнова · 30 лет'],
      ['b-f-2026', '2026-11-07', '🎂 Аня Смирнова · 31 год'],
      ['b-f-2027', '2027-11-07', '🎂 Аня Смирнова · 32 года'],
      ['b-f-2028', '2028-11-07', '🎂 Аня Смирнова · 33 года'],
    ]);
    assert.ok(plan.every((e) => !e.yearly && e.kind === 'birthday' && e.friendId === 'f' && e.label === ''));
  });

  test('с новым годом окно сдвигается: позапрошлый год уходит, добавляется ещё один вперёд', () => {
    const plan = planCalendarEvents(data([friend({ birthday: '1995-11-07' })]), '2027-01-01');
    assert.deepEqual(plan.map((e) => e.key), ['b-f-2026', 'b-f-2027', 'b-f-2028', 'b-f-2029']);
  });

  test('без года — без возраста', () => {
    const plan = planCalendarEvents(data([friend({ birthday: '1904-03-05' })]), TODAY);
    assert.deepEqual(plan.map((e) => e.title), Array(4).fill('🎂 Аня Смирнова'));
    assert.deepEqual(plan.map((e) => e.date), ['2025-03-05', '2026-03-05', '2027-03-05', '2028-03-05']);
  });

  test('29 февраля: в невисокосный год — 28-го, возраст по годам; без года — тоже', () => {
    assert.deepEqual(view(planCalendarEvents(data([friend({ birthday: '2000-02-29' })]), TODAY)), [
      ['b-f-2025', '2025-02-28', '🎂 Аня Смирнова · 25 лет'],
      ['b-f-2026', '2026-02-28', '🎂 Аня Смирнова · 26 лет'],
      ['b-f-2027', '2027-02-28', '🎂 Аня Смирнова · 27 лет'],
      ['b-f-2028', '2028-02-29', '🎂 Аня Смирнова · 28 лет'],
    ]);
    assert.deepEqual(
      planCalendarEvents(data([friend({ birthday: '1904-02-29' })]), TODAY).map((e) => e.date),
      ['2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29'],
    );
  });

  test('родился в этом году: в год рождения без «0 лет», раньше рождения событий нет', () => {
    assert.deepEqual(view(planCalendarEvents(data([friend({ birthday: '2026-03-01' })]), TODAY)), [
      ['b-f-2026', '2026-03-01', '🎂 Аня Смирнова'],
      ['b-f-2027', '2027-03-01', '🎂 Аня Смирнова · 1 год'],
      ['b-f-2028', '2028-03-01', '🎂 Аня Смирнова · 2 года'],
    ]);
  });

  test('возраст для 11–14 и 21: «лет» и «год»', () => {
    const titles = (birthday: string) => planCalendarEvents(data([friend({ birthday })]), TODAY).map((e) => e.title.split(' · ')[1]);
    assert.deepEqual(titles('2014-06-01'), ['11 лет', '12 лет', '13 лет', '14 лет']);
    assert.deepEqual(titles('2005-06-01'), ['20 лет', '21 год', '22 года', '23 года']);
  });

  test('важные даты: годовщины с числом лет и не раньше первой, разовые — только в окне', () => {
    const f = friend({
      dates: [
        { id: 'w', title: 'Свадьба', date: '2021-12-22', yearly: true },
        { id: 'z', title: 'Знакомство', date: '2027-05-01', yearly: true },
        { id: 'k', title: 'Именины', date: '1904-01-25', yearly: true },
        { id: 'm', title: 'Переезд', date: '2027-04-01', yearly: false },
        { id: 'o', title: 'Выпускной', date: '2024-06-20', yearly: false },
        { id: 'p', title: 'Отпуск', date: '2025-07-01', yearly: false },
        { id: 'q', title: 'Свадьба брата', date: '2030-07-01', yearly: false },
      ],
    });
    assert.deepEqual(view(planCalendarEvents(data([f]), TODAY)), [
      ['d-w-2025', '2025-12-22', '♥ Свадьба · Аня Смирнова · 4 года'],
      ['d-w-2026', '2026-12-22', '♥ Свадьба · Аня Смирнова · 5 лет'],
      ['d-w-2027', '2027-12-22', '♥ Свадьба · Аня Смирнова · 6 лет'],
      ['d-w-2028', '2028-12-22', '♥ Свадьба · Аня Смирнова · 7 лет'],
      ['d-z-2027', '2027-05-01', '♥ Знакомство · Аня Смирнова'],
      ['d-z-2028', '2028-05-01', '♥ Знакомство · Аня Смирнова · 1 год'],
      ['d-k-2025', '2025-01-25', '♥ Именины · Аня Смирнова'],
      ['d-k-2026', '2026-01-25', '♥ Именины · Аня Смирнова'],
      ['d-k-2027', '2027-01-25', '♥ Именины · Аня Смирнова'],
      ['d-k-2028', '2028-01-25', '♥ Именины · Аня Смирнова'],
      ['d-m', '2027-04-01', '♥ Переезд · Аня Смирнова'],
      ['d-p', '2025-07-01', '♥ Отпуск · Аня Смирнова'],
    ]);
  });

  test('ключи событий уникальны у всех друзей и дат', () => {
    const friends = Array.from({ length: 30 }, (_, i) =>
      friend({ id: `f${i}`, name: `Друг ${i}`, birthday: `199${i % 10}-0${(i % 9) + 1}-1${i % 9}`, dates: [{ id: `d${i}`, title: 'Дата', date: '2020-02-02', yearly: true }] }),
    );
    const keys = planCalendarEvents(data(friends), TODAY).map((e) => e.key);
    assert.equal(new Set(keys).size, keys.length);
    assert.equal(keys.length, 30 * 4 * 2);
  });
});

describe('что считается тем же событием', () => {
  test('имя в другом падеже узнаётся, похожее имя — нет', () => {
    assert.ok(titleMentions('День рождения Ани Смирновой', 'Аня Смирнова'));
    assert.ok(titleMentions('ДР Яна', 'Ян'));
    assert.ok(titleMentions('Алёна', 'алена'), 'ё и е — одно и то же');
    assert.ok(!titleMentions('Совещание 5 января', 'Ян'), '«января» — не «Ян»');
    assert.ok(!titleMentions('ДР Андрея', 'Аня'));
    assert.ok(!titleMentions('ДР Ани', 'Аня Смирнова'), 'нужны все слова');
    assert.ok(!titleMentions('Ужин', ''));
  });

  const anya = { kind: 'birthday' as const, name: 'Аня Смирнова', label: '' };

  test('день рождения: просто имя, имя или фамилия со словами «день рождения» — дубль', () => {
    for (const title of [
      'Аня Смирнова',
      'Смирнова Аня',
      'Аня',
      'ДР Ани',
      'Д.Р. Ани',
      'д/р Ани',
      'Днюха Ани',
      'День рождения Смирновой',
      'Birthday: Аня Смирнова',
      "Аня Смирнова's birthday",
      '🎂 Аня',
      '🎂 Аня Смирнова · 31 год',
      'День народження Ані',
    ]) {
      assert.ok(sameEvent(anya, title), title);
    }
  });

  test('встреча с человеком в его день рождения и чужие дни рождения — не дубль', () => {
    for (const title of ['Ужин с Аней Смирновой', 'Позвонить Ане', 'ДР Игоря', 'Совещание', 'Др', '', '🎉🎉', 'Андрей Смирнов']) {
      assert.ok(!sameEvent(anya, title), title);
    }
  });

  test('одно слово в имени: «Мама» только со словами «день рождения»', () => {
    const mom = { kind: 'birthday' as const, name: 'Мама', label: '' };
    assert.ok(sameEvent(mom, 'День рождения мамы'));
    assert.ok(sameEvent(mom, 'Мама'));
    assert.ok(!sameEvent(mom, 'Позвонить маме'));
    assert.ok(!sameEvent({ ...mom, name: '🙂' }, 'День рождения'), 'без букв в имени сравнивать нечего');
  });

  test('важная дата: нужны имя и название даты', () => {
    const wedding = { kind: 'date' as const, name: 'Аня Смирнова', label: 'Свадьба' };
    assert.ok(sameEvent(wedding, 'Годовщина свадьбы Ани и Пети'));
    assert.ok(sameEvent(wedding, '♥ Свадьба · Аня Смирнова'), 'копия из нашего файла .ics в Google Календаре');
    assert.ok(!sameEvent(wedding, 'Аня Смирнова'));
    assert.ok(!sameEvent(wedding, 'Свадьба Пети'));
  });
});

describe('без дублей', () => {
  const anya = friend({ id: 'a', birthday: '1995-11-07', phone: '+7 999 123-45-67', dates: [{ id: 'w', title: 'Свадьба', date: '2021-12-22', yearly: true }] });
  const igor = friend({ id: 'i', name: 'Игорь', birthday: '1992-06-13' });
  const d = data([anya, igor]);
  const plan = planCalendarEvents(d, TODAY);
  const keys = (list: PlannedEvent[]) => list.map((e) => e.key);
  const anyaBirthdays = keys(plan).filter((k) => k.startsWith('b-a-'));
  const contact = (patch: Partial<ContactBirthday>): ContactBirthday => ({ name: 'Кто-то', phones: [], month: 11, day: 7, ...patch });
  const split = (others: { title: string; date: string }[], contacts: ContactBirthday[] = [], dd = d, pp = plan) => splitDuplicates(pp, dd, others, contacts, phoneKey);

  test('ничего не нашлось — всё остаётся', () => {
    const s = split([]);
    assert.deepEqual([keys(s.keep), s.fromContacts, s.fromOthers], [keys(plan), [], []]);
  });

  test('день рождения из контактов: узнаём по номеру в любом формате', () => {
    const s = split([], [contact({ name: 'Анюта', phones: ['8 (999) 123-45-67'] })]);
    assert.deepEqual(keys(s.fromContacts), anyaBirthdays);
    assert.deepEqual(keys(s.keep), keys(plan).filter((k) => !k.startsWith('b-a-')), 'свадьба Ани и Игорь на месте');
  });

  test('…и по полному имени без учёта регистра, «ё» и порядка слов', () => {
    for (const name of ['аня  смирнова', 'Смирнова Аня', 'АНЯ СМИРНОВА']) {
      assert.deepEqual(keys(split([], [contact({ name })]).fromContacts), anyaBirthdays, name);
    }
    const alena = friend({ id: 'l', name: 'Алёна', birthday: '1990-01-02' });
    assert.equal(split([], [contact({ name: 'Алена', month: 1, day: 2 })], data([alena]), planCalendarEvents(data([alena]), TODAY)).fromContacts.length, 4);
  });

  test('в контактах другой день, только имя, короткий номер — не тот человек', () => {
    assert.equal(split([], [contact({ name: 'Аня Смирнова', day: 8 })]).fromContacts.length, 0);
    assert.equal(split([], [contact({ name: 'Аня' })]).fromContacts.length, 0, 'одного имени мало');
    const shortPhone = friend({ id: 'a', name: 'А', birthday: '1995-11-07', phone: '123' });
    assert.equal(split([], [contact({ phones: ['123'] })], data([shortPhone]), planCalendarEvents(data([shortPhone]), TODAY)).fromContacts.length, 0);
  });

  test('контакты убирают только дни рождения, не важные даты', () => {
    const s = split([], [contact({ name: 'Аня Смирнова', month: 12, day: 22 })]);
    assert.equal(s.fromContacts.length, 0, 'в контактах 22 декабря, а день рождения 7 ноября');
  });

  test('событие из другого календаря убирает только свой год', () => {
    const s = split([
      { title: 'ДР Ани', date: '2027-11-07' },
      { title: 'Ани', date: '2026-06-13' },
      { title: 'Годовщина свадьбы Ани', date: '2026-12-22' },
    ]);
    assert.deepEqual(keys(s.fromOthers), ['b-a-2027', 'd-w-2026']);
  });

  test('календарь «Дни рождения» Google с повтором на все годы убирает все годы', () => {
    const others = [2025, 2026, 2027, 2028].map((y) => ({ title: 'Аня Смирнова', date: `${y}-11-07` }));
    assert.deepEqual(keys(split(others).fromOthers), anyaBirthdays);
  });

  test('две записи одного человека в приложении дают одно событие в год', () => {
    const twins = data([friend({ id: 'a', birthday: '1995-11-07' }), friend({ id: 'b', birthday: '1995-11-07' })]);
    const s = splitDuplicates(planCalendarEvents(twins, TODAY), twins, [], [], phoneKey);
    assert.deepEqual(keys(s.keep), ['b-a-2025', 'b-a-2026', 'b-a-2027', 'b-a-2028']);
  });

  test('тёзки с разными днями рождения — каждый своим событием', () => {
    const two = data([friend({ id: 'a', birthday: '1995-11-07' }), friend({ id: 'b', birthday: '1990-03-01' })]);
    assert.equal(splitDuplicates(planCalendarEvents(two, TODAY), two, [], [], phoneKey).keep.length, 8);
  });
});

describe('что поменять в календаре', () => {
  const plan = planCalendarEvents(data([friend({ id: 'a', birthday: '1995-11-07' }), friend({ id: 'b', name: 'Игорь', birthday: '1992-06-13' })]), TODAY, [2026]);

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

  test('подпись события меняется от названия, описания и даты', () => {
    const base = eventSignature(plan[0]);
    assert.notEqual(eventSignature({ ...plan[0], notes: 'x' }), base);
    assert.notEqual(eventSignature({ ...plan[0], date: '2026-11-08' }), base);
    assert.equal(eventSignature({ ...plan[0], friendId: 'другой' }), base, 'служебные поля не пересоздают событие');
  });
});

describe('файл .ics', () => {
  const ics = buildIcs(
    data([
      friend({ id: 'a', birthday: '1995-11-07' }),
      friend({ id: 'n', name: 'Без года', birthday: '1904-03-05' }),
      friend({ id: 'l', name: 'Лера; «Лерочка», друг\\', birthday: '2000-02-29', dates: [{ id: 'w', title: 'Свадьба', date: '2021-12-22', yearly: true }] }),
      friend({ id: 'm', name: 'Миша', dates: [{ id: 'o', title: 'Переезд', date: '2027-04-01', yearly: false }] }),
    ]),
    new Date(Date.UTC(2026, 10, 8, 4, 0, 0)),
  );
  const events = ics.split('BEGIN:VEVENT').slice(1);
  const unfolded = ics.replace(/\r\n /g, '');

  test('календарь с событиями на весь день, повтором и стабильными UID', () => {
    assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:'));
    assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
    assert.equal(events.length, 5);
    assert.ok(ics.includes('UID:b-a@friends-notes\r\nDTSTAMP:20261108T040000Z\r\nDTSTART;VALUE=DATE:19951107\r\nDTEND;VALUE=DATE:19951108\r\nRRULE:FREQ=YEARLY\r\n'));
    assert.ok(ics.includes('DTSTART;VALUE=DATE:20000305\r\nDTEND;VALUE=DATE:20000306\r\nRRULE:FREQ=YEARLY\r\n'), 'без года — с базового года');
    assert.ok(ics.includes('DTSTART;VALUE=DATE:20000229\r\nDTEND;VALUE=DATE:20000301\r\nRRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1\r\n'), '29 февраля — последний день февраля');
    assert.ok(ics.includes('UID:d-o@friends-notes\r\nDTSTAMP:20261108T040000Z\r\nDTSTART;VALUE=DATE:20270401\r\nDTEND;VALUE=DATE:20270402\r\nSUMMARY:'), 'разовая дата — без повтора');
    assert.equal(new Set(events.map((e) => /UID:(.*)\r\n/.exec(e)?.[1])).size, events.length, 'UID не повторяются');
    assert.ok(events.every((e) => e.includes('TRANSP:TRANSPARENT\r\nEND:VEVENT\r\n')));
    assert.ok(!/\r(?!\n)|(?<!\r)\n/.test(ics), 'только CRLF');
  });

  test('DTEND через год и месяц: 31 декабря → 1 января', () => {
    const dec = buildIcs(data([friend({ birthday: '1990-12-31' })]), new Date(0));
    assert.ok(dec.includes('DTSTART;VALUE=DATE:19901231\r\nDTEND;VALUE=DATE:19910101\r\n'));
  });

  test('спецсимволы экранируются по RFC 5545: \\ ; , и перевод строки', () => {
    assert.equal(escapeText('a;b,c\\d\ne'), 'a\\;b\\,c\\\\d\\ne');
    assert.equal(escapeText('a\r\nb'), 'a\\nb');
    assert.ok(unfolded.includes('SUMMARY:🎂 Лера\\; «Лерочка»\\, друг\\\\\r\n'));
    assert.ok(unfolded.includes('DESCRIPTION:Дата рождения: 7 ноября 1995.\\nИз приложения «Друзья».\r\n'));
  });

  test('длинные строки переносятся по байтам, не разрывая буквы и эмодзи', () => {
    const enc = new TextEncoder();
    for (const line of ics.split('\r\n')) assert.ok(enc.encode(line).length <= 75, line);
    const long = fold(`DESCRIPTION:${'Ю'.repeat(80)}🎂${'я'.repeat(40)}`);
    assert.equal(long.replace(/\r\n /g, ''), `DESCRIPTION:${'Ю'.repeat(80)}🎂${'я'.repeat(40)}`);
    for (const line of long.split('\r\n')) assert.ok(enc.encode(line).length <= 75, line);
    assert.equal(fold('SHORT:ok'), 'SHORT:ok');
  });

  test('пустые данные — корректный пустой календарь', () => {
    assert.equal(buildIcs(data([]), new Date(0)).split('BEGIN:VEVENT').length, 1);
  });
});
