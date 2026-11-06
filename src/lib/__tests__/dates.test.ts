/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  addInterval,
  ageOn,
  formatRepeat,
  nextAnniversary,
  nextOccurrenceAfter,
  plural,
  relativeDay,
  sameDayInYear,
} from '../dates';
import { completeReminder, planNotifications, upcomingItems, MAX_SCHEDULED } from '../events';
import { EMPTY_DATA, type AppData, type Friend, type Reminder } from '../types';

test('addInterval: месяцы не «съезжают» с 31-го числа', () => {
  assert.equal(addInterval('2026-01-31', 'month', 1), '2026-02-28');
  assert.equal(addInterval('2026-01-31', 'month', 2), '2026-03-31');
  assert.equal(addInterval('2026-11-15', 'month', 2), '2027-01-15');
  assert.equal(addInterval('2026-12-30', 'week', 1), '2027-01-06');
  assert.equal(addInterval('2024-02-29', 'year', 1), '2025-02-28');
});

test('годовщины и 29 февраля', () => {
  assert.equal(sameDayInYear('2000-02-29', 2027), '2027-02-28');
  assert.equal(nextAnniversary('1990-03-10', '2026-03-10'), '2026-03-10');
  assert.equal(nextAnniversary('1990-03-10', '2026-03-11'), '2027-03-10');
});

test('возраст', () => {
  assert.equal(ageOn('1990-03-10', '2026-03-09'), 35);
  assert.equal(ageOn('1990-03-10', '2026-03-10'), 36);
});

test('склонения и подписи', () => {
  assert.equal(plural(1, 'год', 'года', 'лет'), 'год');
  assert.equal(plural(3, 'год', 'года', 'лет'), 'года');
  assert.equal(plural(11, 'год', 'года', 'лет'), 'лет');
  assert.equal(plural(22, 'год', 'года', 'лет'), 'года');
  assert.equal(formatRepeat({ every: 1, unit: 'week' }), 'каждую неделю');
  assert.equal(formatRepeat({ every: 2, unit: 'month' }), 'каждые 2 месяца');
  assert.equal(formatRepeat({ every: 5, unit: 'day' }), 'каждые 5 дней');
  assert.equal(relativeDay('2026-11-07', '2026-11-05'), 'через 2 дня');
  assert.equal(relativeDay('2026-11-06', '2026-11-05'), 'завтра');
});

test('следующее срабатывание повторяющегося напоминания', () => {
  const after = new Date(2026, 2, 1, 12, 0); // 1 марта 12:00
  assert.equal(nextOccurrenceAfter('2026-01-01', '10:00', { every: 2, unit: 'month' }, after), '2026-05-01');
  assert.equal(nextOccurrenceAfter('2026-01-01', '13:00', { every: 2, unit: 'month' }, after), '2026-03-01');
});

const friend = (patch: Partial<Friend> = {}): Friend => ({
  id: 'f1',
  name: 'Аня',
  emoji: '🌸',
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

const reminder = (patch: Partial<Reminder> = {}): Reminder => ({
  id: 'r1',
  title: 'Купить цветы',
  note: '',
  friendId: 'f1',
  date: '2100-01-01',
  time: '10:00',
  repeat: null,
  advance: 0,
  done: false,
  createdAt: 0,
  ...patch,
});

test('«Сделано» переносит повторяющееся напоминание вперёд', () => {
  const now = new Date(2026, 10, 5, 12, 0);
  const r = reminder({ date: '2026-11-01', repeat: { every: 1, unit: 'week' } });
  assert.equal(completeReminder(r, now).date, '2026-11-08');
  assert.equal(completeReminder(r, now).done, false);
  const future = reminder({ date: '2026-11-10', repeat: { every: 2, unit: 'month' } });
  assert.equal(completeReminder(future, now).date, '2027-01-10');
  assert.equal(completeReminder(reminder(), now).done, true);
});

test('уведомления: день рождения, «за день», дедлайн с упреждением, лимит', () => {
  const now = new Date(2026, 10, 5, 12, 0);
  const data: AppData = {
    ...EMPTY_DATA,
    friends: [friend({ birthday: '1995-11-20' })],
    reminders: [reminder({ date: '2026-11-10', time: '18:00', advance: 1440, friendId: null, title: 'Дедлайн' })],
  };
  const plan = planNotifications(data, now);
  const fmt = (d: Date) => `${d.getMonth() + 1}-${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  const times = plan.map((n) => fmt(n.at));
  assert.deepEqual(times.slice(0, 4), ['11-9 18:00', '11-10 18:00', '11-19 10:00', '11-20 10:00']);
  assert.match(plan[3].title, /31 год/);
  assert.match(plan[2].body, /^Завтра день рождения · 31 год/);

  const many: AppData = {
    ...EMPTY_DATA,
    reminders: Array.from({ length: 10 }, (_, i) => reminder({ id: `r${i}`, date: '2026-11-06', repeat: { every: 1, unit: 'day' } })),
  };
  assert.equal(planNotifications(many, now).length, MAX_SCHEDULED);
});

test('лента «Скоро»', () => {
  const data: AppData = {
    ...EMPTY_DATA,
    friends: [friend({ birthday: '1995-11-20', dates: [{ id: 'd1', title: 'Знакомство', date: '2020-11-07', yearly: true }] })],
    reminders: [reminder({ date: '2026-11-06' }), reminder({ id: 'r2', date: '2026-11-06', done: true })],
  };
  const items = upcomingItems(data, 60, '2026-11-05');
  assert.deepEqual(items.map((i) => i.kind), ['reminder', 'date', 'birthday']);
  const date = items[1];
  assert.ok(date.kind === 'date' && date.years === 6);
});
