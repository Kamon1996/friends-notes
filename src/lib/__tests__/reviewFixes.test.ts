/// <reference types="node" />
// Ошибки, найденные проверкой кода в 1.43.x: по тесту на каждую, чтобы не вернулись.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { sanitizeSettings } from '../backup';
import { composeDate, dateIssue, partsErrors } from '../birthday';
import { calendarEvents, monthCounts } from '../calendar';
import { calendarLine, withoutName } from '../calendarAi';
import { doneThrough, nextAfterCurrent, planNotifications, rollReminder } from '../events';
import { buildFriendList } from '../friendList';
import { filterByName, prepareQuery } from '../search';
import { isStoredDate, normalizeData } from '../storage';
import { DEFAULT_SETTINGS, EMPTY_DATA, type AppData, type Friend, type Reminder } from '../types';

const F = (id: string, name: string, extra: Partial<Friend> = {}): Friend => ({
  id, name, emoji: '', birthday: null, phone: '', food: '', flowers: '', gifts: '', notes: '', dates: [], createdAt: 1, ...extra,
});
const R = (patch: Partial<Reminder> = {}): Reminder => ({
  id: 'r', title: 'Зарядка', note: '', friendId: null, date: '2026-11-08', time: '09:00', repeat: null, advance: 0, done: false, createdAt: 0, ...patch,
});
const app = (patch: Partial<AppData>): AppData => ({ ...EMPTY_DATA, settings: DEFAULT_SETTINGS, ...patch });
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min);

describe('сохранённые данные с мусором не подвешивают приложение', () => {
  test('дата — только настоящая ГГГГ-ММ-ДД', () => {
    for (const ok of ['2026-11-10', '1904-02-29', '2028-02-29']) assert.ok(isStoredDate(ok), ok);
    for (const bad of ['', '10.11.2026', '2026-02-30', '2027-02-29', '2026-13-01', '2026-1-1', 20261110, null]) assert.ok(!isStoredDate(bad), String(bad));
  });

  test('дело без настоящей даты пропускаем; непонятный повтор и «заранее» сбрасываем', () => {
    const data = normalizeData({
      reminders: [
        { id: 'a', title: 'Без даты', date: '' },
        { id: 'b', title: 'Дата по-русски', date: '10.11.2026', repeat: { every: 1, unit: 'day' }, done: true },
        { id: 'c', title: 'Каждый час', date: '2026-11-10', repeat: { every: 1, unit: 'hour' }, calendar: true },
        { id: 'd', title: 'Раз в десять миллионов лет', date: '2026-11-10', repeat: { every: 1e7, unit: 'year' } },
        { id: 'e', title: 'Каждые полдня', date: '2026-11-10', repeat: { every: 0.5, unit: 'day' } },
        { id: 'f', title: 'Обычное', date: '2026-11-10', repeat: { every: 2, unit: 'week' }, advance: 1440 },
        { id: 'g', title: 'За 17 минут', date: '2026-11-10', advance: 17 },
      ],
    });
    assert.deepEqual(data.reminders.map((r) => r.id), ['c', 'd', 'e', 'f', 'g']);
    assert.deepEqual(data.reminders.map((r) => r.repeat), [null, null, null, { every: 2, unit: 'week' }, null]);
    assert.deepEqual(data.reminders.map((r) => r.advance), [0, 0, 0, 1440, 0]);
    // Раньше на таких записях расчёты не заканчивались никогда. Теперь всё считается.
    const now = at(2026, 11, 10);
    assert.ok(Array.isArray(planNotifications(data, now)));
    assert.ok(Array.isArray(calendarEvents(data, '2026-11-01', '2026-11-30')));
    data.reminders.forEach((r) => rollReminder({ ...r, done: true }, now));
  });

  test('день рождения и важная дата с мусором вместо даты не ломают друга', () => {
    const [f] = normalizeData({
      friends: [{ id: 'f', name: 'Аня', birthday: '31.12', dates: [{ id: 'd1', title: 'Свадьба', date: 'скоро' }, { id: 'd2', title: 'Знакомство', date: '2018-06-22' }] }],
    }).friends;
    assert.equal(f.birthday, null);
    assert.deepEqual(f.dates.map((d) => d.id), ['d2']);
  });
});

test('копия: настройки календаря и праздников переживают восстановление', () => {
  const s = sanitizeSettings({ smartCalendar: false, holidayCountries: ['RU', 'KZ', 'XX', 7], calendarLegend: false, calendarDayView: 'inline' });
  assert.equal(s.smartCalendar, false);
  assert.deepEqual(s.holidayCountries, ['RU', 'KZ']);
  assert.equal(s.calendarLegend, false);
  assert.equal(s.calendarDayView, 'inline');
  // Пустой список — тоже выбор: «праздники не показывать».
  assert.deepEqual(sanitizeSettings({ holidayCountries: [] }).holidayCountries, []);
  // Чужие значения не проходят.
  const bad = sanitizeSettings({ smartCalendar: 'нет', holidayCountries: 'RU', calendarLegend: 1, calendarDayView: 'popup' });
  assert.deepEqual(bad, DEFAULT_SETTINGS);
});

describe('важные даты: год впереди, год у разовой, 29 февраля', () => {
  const next = String(new Date().getFullYear() + 1);
  test('день рождения в будущем — ошибка, важная дата — нет', () => {
    const p = { day: '12', month: '06', year: next };
    assert.ok(partsErrors(p).year);
    assert.equal(composeDate(p), null);
    assert.ok(!partsErrors(p, { future: true }).year);
    assert.equal(composeDate(p, { future: true }), `${next}-06-12`);
    assert.equal(dateIssue(p, true, { future: true }), null);
    // И у важной даты есть предел: «3026» — опечатка.
    assert.ok(partsErrors({ day: '12', month: '06', year: '3026' }, { future: true }).year);
  });

  test('разовой дате нужен год: без него она никогда не наступит', () => {
    const p = { day: '12', month: '06', year: '' };
    assert.equal(dateIssue(p, true, { future: true }), null);
    assert.match(dateIssue(p, true, { future: true, yearRequired: true })!.message, /укажи год/);
    assert.equal(dateIssue({ ...p, year: next }, true, { future: true, yearRequired: true }), null);
  });

  test('29 февраля: без года и в високосный год — можно, в обычный — такой даты нет', () => {
    assert.ok(!partsErrors({ day: '29', month: '02', year: '' }).day);
    assert.ok(!partsErrors({ day: '29', month: '02', year: '2024' }).day);
    assert.ok(partsErrors({ day: '29', month: '02', year: '2001' }).day);
    assert.equal(composeDate({ day: '29', month: '02', year: '2001' }), null);
    assert.equal(composeDate({ day: '29', month: '02', year: '2024' }), '2024-02-29');
  });

  test('ежегодная дата с годом впереди не напоминает раньше самой даты', () => {
    const friend = F('f', 'Аня', { dates: [{ id: 'd', title: 'Свадьба', date: '2027-06-12', yearly: true }] });
    const plan = planNotifications(app({ friends: [friend] }), at(2026, 5, 1));
    assert.deepEqual([...new Set(plan.map((p) => p.at.getFullYear()))], [2027]);
  });
});

describe('повторяющееся дело, отмеченное позже срока', () => {
  // Каждый день в 9:00, срок был 8 ноября, отметили 10 ноября в 8 утра.
  const done = R({ repeat: { every: 1, unit: 'day' }, done: true, doneAt: at(2026, 11, 10, 8).getTime() });
  const now = at(2026, 11, 10, 8, 30);

  test('сегодняшнее уведомление не приходит: дело уже сделано', () => {
    assert.equal(doneThrough(done), '2026-11-10');
    const plan = planNotifications(app({ reminders: [done] }), now);
    assert.equal(plan[0].at.getTime(), at(2026, 11, 11, 9).getTime());
  });

  test('«снова» в строке совпадает с тем, куда дело перенесётся завтра', () => {
    assert.equal(nextAfterCurrent(done), '2026-11-11');
    assert.equal(rollReminder(done, at(2026, 11, 11, 7)).date, '2026-11-11');
  });

  test('отметили в срок — всё как раньше: следующий раз после текущего', () => {
    const onTime = R({ date: '2026-11-10', repeat: { every: 1, unit: 'week' }, done: true, doneAt: at(2026, 11, 10, 8).getTime() });
    assert.equal(doneThrough(onTime), '2026-11-10');
    assert.equal(nextAfterCurrent(onTime), '2026-11-17');
    assert.equal(doneThrough(R({ repeat: { every: 1, unit: 'day' } })), null);
    assert.equal(doneThrough(R({ done: true })), null);
  });
});

describe('поиск по имени', () => {
  const people = ['Толя', 'Никита', 'Николай', 'Аня', 'Рита', 'Римма', 'Костя'];
  const find = (q: string) => filterByName(people, prepareQuery(q)!, (x) => x);

  test('набрано по-русски — другая раскладка не подмешивает лишних', () => {
    assert.deepEqual(find('тол'), ['Толя']);
    // «ко» есть и внутри «Николай» — это честное совпадение; а вот Рита и Римма попадали сюда только из-за раскладки.
    assert.deepEqual(find('ко'), ['Николай', 'Костя']);
    assert.deepEqual(find('ни'), ['Никита', 'Николай']);
  });

  test('как набрано не нашлось — пробуем другую раскладку', () => {
    assert.deepEqual(find('fyz'), ['Аня']);
    assert.deepEqual(find('njkz'), ['Толя']);
  });

  test('`also` — что ещё считать совпадением (телефон по цифрам)', () => {
    const q = prepareQuery('999')!;
    assert.deepEqual(filterByName(people, q, (x) => x, (x) => x === 'Рита'), ['Рита']);
  });
});

test('список друзей: «Ё» не разрывает группу «Е» — ключи строк не повторяются', () => {
  const list = buildFriendList(['Евгений', 'Егор', 'Ёжик', 'Екатерина', 'Жанна'].map((n, i) => F(String(i), n)), '', 'name', '2026-11-10');
  const keys = list.map((i) => i.key);
  assert.equal(new Set(keys).size, keys.length, keys.join(' '));
  assert.deepEqual(list.filter((i) => i.type === 'label').map((i) => (i.type === 'label' ? i.title : '')), ['Е', 'Ж']);
});

test('обозначения под календарём: тёзки в разные дни — разные праздники', () => {
  const settings = { ...DEFAULT_SETTINGS, holidayCountries: ['UZ', 'TJ', 'AM'] };
  const ev = calendarEvents({ friends: [], reminders: [], settings }, '2027-09-01', '2027-09-30');
  const names = ev.filter((e) => e.kind === 'holiday').map((e) => (e.kind === 'holiday' ? `${e.date} ${e.name}` : ''));
  const independence = names.filter((n) => n.endsWith('День независимости'));
  assert.equal(independence.length, 3, names.join('; '));
  assert.equal(monthCounts(ev, '2027-09-01', '2027-09-30').holiday, new Set(names.map((n) => n.slice(11))).size + 2);
});

test('строка для магии: имя друга убирается целым словом и в любом падеже', () => {
  assert.equal(withoutName('Встреча с Олегом в кафе', 'Олег'), 'Встреча в кафе');
  assert.equal(withoutName('Позвонить — Игорь Ветров', 'Игорь Ветров'), 'Позвонить');
  assert.equal(withoutName('Поздравить Аню с днём рождения', 'Аня Смирнова'), 'Поздравить с днём рождения');
  assert.equal(withoutName('Забрать торт для Насти', 'Настя'), 'Забрать торт');
  assert.equal(withoutName('Аня: вернуть книгу', 'Аня'), 'вернуть книгу');
  // Слово, которое только начинается так же, остаётся.
  assert.equal(withoutName('Январские планы', 'Ян'), 'Январские планы');
  // Название из одного имени не превращается в пустую строку.
  assert.equal(calendarLine({ title: 'Ян', time: '10:00', repeat: null }, 'Ян'), 'Ян · 10:00');
});
