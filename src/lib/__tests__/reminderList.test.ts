/// <reference types="node" />
// Вкладка «Напоминания»: разделы по сроку, порядок «срок, потом важность», фильтры «Быстрые» и «Важные», сделанное.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { byDeadline, formatMinutes, fuseColor, mix, reminderSections } from '../reminderList';
import type { Reminder } from '../types';

const R = (id: string, date: string, patch: Partial<Reminder> = {}): Reminder => ({
  id,
  title: id,
  note: '',
  friendId: null,
  date,
  time: '10:00',
  repeat: null,
  advance: 0,
  done: false,
  createdAt: 0,
  ...patch,
});
// Сегодня — среда, 10 марта 2027.
const now = new Date(2027, 2, 10, 12, 0);
const shape = (reminders: Reminder[], filter: Parameters<typeof reminderSections>[1] = 'all') =>
  reminderSections(reminders, filter, now).map((s) => `${s.title}: ${s.rows.map((r) => r.id).join(' ')}`);

describe('разделы', () => {
  test('сегодня (с просроченными сверху), неделя, месяц, позже; пустых разделов нет', () => {
    const list = [R('later', '2027-05-01'), R('month', '2027-03-30'), R('week', '2027-03-17'), R('today', '2027-03-10'), R('overdue', '2027-03-08')];
    assert.deepEqual(shape(list), ['Сегодня: overdue today', 'На неделе: week', 'В течение месяца: month', 'Позже: later']);
    assert.deepEqual(shape([R('week', '2027-03-12')]), ['На неделе: week']);
  });

  test('по сроку; срок одинаковый — сначала важное, без важности — в конце', () => {
    const list = [R('none', '2027-03-12'), R('low', '2027-03-12', { priority: 1 }), R('top', '2027-03-12', { priority: 3 }), R('early', '2027-03-11')];
    assert.deepEqual(shape(list), ['На неделе: early top low none']);
    assert.ok(byDeadline(R('a', '2027-03-12', { time: '09:00' }), R('b', '2027-03-12', { time: '18:00' })) < 0, 'дальше — по времени');
  });

  test('сделанное сегодня — внизу, чтобы вернуть тем же свайпом; сделанное раньше — только в «Сделанных», новое сверху', () => {
    const list = [
      R('a', '2027-03-10'),
      R('doneToday', '2027-03-12', { done: true, doneAt: new Date(2027, 2, 10, 9).getTime() }),
      R('doneOld', '2027-03-01', { done: true, doneAt: new Date(2027, 2, 2).getTime() }),
      R('doneLegacy', '2027-02-01', { done: true }),
    ];
    assert.deepEqual(shape(list), ['Сегодня: a', 'Сделано сегодня: doneToday']);
    assert.deepEqual(shape(list, 'done'), ['Сделанные: doneToday doneOld doneLegacy']);
  });
});

describe('фильтры', () => {
  const list = [
    R('q5', '2027-03-11', { minutes: 5 }),
    R('q30', '2027-03-11', { minutes: 30, priority: 3 }),
    R('long', '2027-03-11', { minutes: 60, priority: 3 }),
    R('unknown', '2027-03-11', { priority: 2 }),
    R('mom', '2027-03-11', { friendId: 'm' }),
  ];
  test('«Быстрые» — до 30 минут включительно; без времени — не быстрые', () => assert.deepEqual(shape(list, 'quick'), ['На неделе: q30 q5']));
  test('«Важные» — только «Важно»', () => assert.deepEqual(shape(list, 'important'), ['На неделе: long q30']));
  test('для себя и для друзей', () => {
    assert.deepEqual(shape(list, 'friends'), ['На неделе: mom']);
    assert.equal(shape(list, 'personal')[0].includes('mom'), false);
  });
});

describe('мелочи', () => {
  test('время: минуты, часы, полдня', () => assert.deepEqual([5, 30, 60, 90, 120, 240].map(formatMinutes), ['5 мин', '30 мин', '1 ч', '1 ч 30 мин', '2 ч', 'полдня']));
  test('цвет фитиля: зелёный, потом через янтарный в красный', () => {
    const c = { success: '#00ff00', warn: '#ffaa00', danger: '#ff0000' };
    assert.equal(fuseColor(0.9, c), '#00ff00');
    assert.equal(fuseColor(0.25, c), '#ffaa00');
    assert.equal(fuseColor(0, c), '#ff0000');
    assert.equal(mix('#000000', '#ffffff', 0.5), '#808080');
  });
});
