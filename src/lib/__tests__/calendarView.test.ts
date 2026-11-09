/// <reference types="node" />
// Вкладка «Календарь»: что попадает в месяц — дни рождения, годовщины и важные даты друзей, встречи; дела «до срока» — нет.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { calendarEvents, monthGrid, monthRange, nextEvents } from '../calendar';
import type { Friend, Reminder } from '../types';

const F = (id: string, patch: Partial<Friend> = {}): Friend =>
  ({ id, name: id, emoji: '', birthday: null, phone: '', food: '', flowers: '', gifts: '', notes: '', dates: [], createdAt: 0, ...patch }) as Friend;
const R = (id: string, patch: Partial<Reminder> = {}): Reminder => ({
  id,
  title: id,
  note: '',
  friendId: null,
  date: '2026-11-20',
  time: '10:00',
  repeat: null,
  advance: 0,
  done: false,
  createdAt: 0,
  ...patch,
});
const shape = (events: ReturnType<typeof calendarEvents>) =>
  events.map((e) => `${e.date} ${e.kind === 'meeting' ? e.reminder.title : e.friend.name}${e.kind === 'birthday' ? ` ${e.age ?? '-'}` : e.kind === 'date' ? ` ${e.title} ${e.years ?? '-'}` : ''}`);

describe('сетка месяца', () => {
  test('шесть недель с понедельника; ноябрь 2026 начинается в воскресенье', () => {
    const g = monthGrid(2026, 10);
    assert.equal(g.length, 42);
    assert.deepEqual([g[0], g[6], g[41]], ['2026-10-26', '2026-11-01', '2026-12-06']);
    assert.deepEqual(monthRange(2026, 1), ['2026-02-01', '2026-02-28']);
  });
});

describe('события месяца', () => {
  const data = {
    friends: [
      F('Аня', { birthday: '1995-11-10', dates: [{ id: 'met', title: 'Познакомились', date: '2018-11-22', yearly: true }] }),
      F('Игорь', { birthday: '1904-11-03' }), // без года
      F('Мама', { birthday: '1966-12-01', dates: [{ id: 'trip', title: 'Поездка', date: '2026-11-15', yearly: false }] }),
    ],
    reminders: [
      R('Стоматолог', { kind: 'at', date: '2026-11-12', time: '15:00' }),
      R('Ужин', { kind: 'at', date: '2026-11-12', time: '09:00', friendId: 'Мама' }),
      R('Билеты', { date: '2026-11-11' }), // до срока — не событие
      R('Таблетки', { date: '2026-11-10', repeat: { every: 1, unit: 'day' } }), // повтор — не событие
    ],
  };
  test('дни рождения с возрастом (без года — без), годовщины, разовые даты, встречи по времени; дел «до срока» нет', () => {
    assert.deepEqual(shape(calendarEvents(data, '2026-11-01', '2026-11-30')), [
      '2026-11-03 Игорь -',
      '2026-11-10 Аня 31',
      '2026-11-12 Ужин',
      '2026-11-12 Стоматолог',
      '2026-11-15 Мама Поездка -',
      '2026-11-22 Аня Познакомились 8',
    ]);
  });
  test('через Новый год — по разу в каждом году; до самой даты ничего нет', () => {
    const ev = calendarEvents({ friends: [F('Дед', { birthday: '2026-12-31' })], reminders: [] }, '2025-12-01', '2027-01-31');
    assert.deepEqual(shape(ev), ['2026-12-31 Дед -']);
    assert.deepEqual(shape(calendarEvents({ friends: [F('Ди', { birthday: '1990-01-05' })], reminders: [] }, '2025-12-20', '2026-01-10')), ['2026-01-05 Ди 36']);
  });
  test('29 февраля в невисокосный год — 28-го', () => {
    assert.deepEqual(shape(calendarEvents({ friends: [F('Лео', { birthday: '2000-02-29' })], reminders: [] }, '2027-02-01', '2027-02-28')), ['2027-02-28 Лео 27']);
  });
  test('дальше — ближайшие после выбранного дня, не включая его', () => {
    assert.deepEqual(shape(nextEvents(data, '2026-11-12', 2)), ['2026-11-15 Мама Поездка -', '2026-11-22 Аня Познакомились 8']);
  });
});

test('«дальше» — не дальше двух месяцев', () => {
  const data = { friends: [F('Аня', { birthday: '1995-11-09' }), F('Дима', { birthday: '1993-12-03' })], reminders: [] };
  assert.deepEqual(shape(nextEvents(data, '2026-11-09')), ['2026-12-03 Дима 33']);
});
