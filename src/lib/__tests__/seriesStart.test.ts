/// <reference types="node" />
// Повторяющееся дело не начинается в прошлом: «годовщина — 18 октября», заведённая в ноябре, встаёт на следующий год,
// а не висит «просрочено». Правило формы (`settleSeries`) и починка уже сохранённых дел (`rollReminder`).
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { firstOccurrenceFrom } from '../dates';
import { completeReminder, reminderOverdue, rollReminder } from '../events';
import { settleSeries, type SeriesDraft } from '../reminderForm';
import type { Reminder, Repeat } from '../types';

const TODAY = '2026-11-11'; // среда
const YEARLY: Repeat = { every: 1, unit: 'year' };
const MONTHLY: Repeat = { every: 1, unit: 'month' };
const WEEKLY: Repeat = { every: 1, unit: 'week' };
const MWF: Repeat = { every: 1, unit: 'week', days: [1, 3, 5] };
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);
const R = (patch: Partial<Reminder> = {}): Reminder => ({
  id: 'r', title: 'Годовщина знакомства', note: '', friendId: null, date: '2026-10-18', time: '10:00', repeat: YEARLY, advance: 0, done: false, createdAt: 0, ...patch,
});

describe('первый раз серии не раньше дня', () => {
  test('год, неделя, месяц с 31-м, дни недели; сегодня считается; будущее начало — оно само', () => {
    assert.equal(firstOccurrenceFrom('2026-10-18', YEARLY, TODAY), '2027-10-18');
    assert.equal(firstOccurrenceFrom('2026-10-18', WEEKLY, TODAY), '2026-11-15');
    assert.equal(firstOccurrenceFrom('2026-08-31', MONTHLY, TODAY), '2026-11-30');
    assert.equal(firstOccurrenceFrom('2026-10-19', MWF, TODAY), '2026-11-11');
    assert.equal(firstOccurrenceFrom('2025-11-11', YEARLY, TODAY), TODAY);
    assert.equal(firstOccurrenceFrom('2026-12-25', YEARLY, TODAY), '2026-12-25');
  });
});

describe('форма: куда встаёт серия', () => {
  const fresh: SeriesDraft = { date: '2026-11-12', repeat: null, from: null };

  test('повтор уже выбран, день — прошедший: ближайший раз — через год, выбранный день — начало серии', () => {
    const got = settleSeries({ ...fresh, repeat: YEARLY }, { date: '2026-10-18', repeat: YEARLY }, TODAY);
    assert.deepEqual(got, { date: '2027-10-18', repeat: YEARLY, from: '2026-10-18' });
  });

  test('сначала день, потом повтор: разовое стоит в прошлом, серия — от выбранного дня, какой бы повтор ни выбрали', () => {
    const once = settleSeries(fresh, { date: '2026-10-18', repeat: null }, TODAY);
    assert.deepEqual(once, { date: '2026-10-18', repeat: null, from: null }, 'разовое дело можно завести и на прошедший день');
    const weekly = settleSeries(once, { date: once.date, repeat: WEEKLY }, TODAY);
    assert.deepEqual(weekly, { date: '2026-11-15', repeat: WEEKLY, from: '2026-10-18' });
    const yearly = settleSeries(weekly, { date: weekly.date, repeat: YEARLY }, TODAY);
    assert.deepEqual(yearly, { date: '2027-10-18', repeat: YEARLY, from: '2026-10-18' }, 'годовщина — 18 октября, а не 15 ноября');
    const monthly = settleSeries(yearly, { date: yearly.date, repeat: MONTHLY }, TODAY);
    assert.deepEqual(monthly, { date: '2026-11-18', repeat: MONTHLY, from: '2026-10-18' });
  });

  test('передумали повторять — дело возвращается на выбранный день; вернули повтор — снова на ближайший раз', () => {
    const yearly: SeriesDraft = { date: '2027-10-18', repeat: YEARLY, from: '2026-10-18' };
    const once = settleSeries(yearly, { date: yearly.date, repeat: null }, TODAY);
    assert.deepEqual(once, { date: '2026-10-18', repeat: null, from: '2026-10-18' });
    assert.deepEqual(settleSeries(once, { date: once.date, repeat: YEARLY }, TODAY), yearly);
  });

  test('будущий день и сегодня — как выбрали; начало серии забыто', () => {
    const yearly: SeriesDraft = { date: '2027-10-18', repeat: YEARLY, from: '2026-10-18' };
    assert.deepEqual(settleSeries(yearly, { date: '2026-12-25', repeat: YEARLY }, TODAY), { date: '2026-12-25', repeat: YEARLY, from: null });
    assert.deepEqual(settleSeries(yearly, { date: TODAY, repeat: YEARLY }, TODAY), { date: TODAY, repeat: YEARLY, from: null });
  });

  test('повтор по дням: прошедший день — ближайший из выбранных дней не раньше сегодня', () => {
    const got = settleSeries({ ...fresh, repeat: MWF }, { date: '2026-10-19', repeat: MWF }, TODAY);
    assert.deepEqual(got, { date: '2026-11-11', repeat: MWF, from: '2026-10-19' });
  });

  test('ничего из даты и повтора не меняли — начало серии остаётся', () => {
    const yearly: SeriesDraft = { date: '2027-10-18', repeat: YEARLY, from: '2026-10-18' };
    assert.deepEqual(settleSeries(yearly, { date: yearly.date, repeat: { every: 1, unit: 'year' } }, TODAY), yearly);
  });

  test('готовое просроченное дело: поменяли только повтор — срок правда пропущен, дату не трогаем; выбрали день — ставим', () => {
    const overdue: SeriesDraft = { date: '2026-11-01', repeat: WEEKLY, from: null };
    assert.deepEqual(settleSeries(overdue, { date: overdue.date, repeat: MONTHLY }, TODAY, true), { date: '2026-11-01', repeat: MONTHLY, from: null });
    assert.deepEqual(settleSeries(overdue, { date: overdue.date, repeat: MONTHLY }, TODAY, false), { date: '2026-12-01', repeat: MONTHLY, from: '2026-11-01' });
    assert.deepEqual(settleSeries(overdue, { date: '2026-10-18', repeat: WEEKLY }, TODAY, true), { date: '2026-11-15', repeat: WEEKLY, from: '2026-10-18' });
  });
});

describe('уже сохранённые дела', () => {
  const now = at(2026, 11, 11);

  test('завели с прошедшего дня (старая форма) — встаёт на ближайший раз, начало серии помним', () => {
    const stuck = R({ createdAt: now.getTime() });
    assert.equal(reminderOverdue(stuck, now), true, 'так это выглядело: «просрочено» сразу после создания');
    const healed = rollReminder(stuck, now);
    assert.deepEqual([healed.date, healed.anchor, healed.done], ['2027-10-18', '2026-10-18', false]);
    assert.equal(reminderOverdue(healed, now), false);
    assert.equal(rollReminder(healed, now), healed, 'второй раз ничего не меняется');
  });

  test('срок прошёл после создания — дело правда просрочено, не трогаем', () => {
    const missed = R({ repeat: WEEKLY, createdAt: at(2026, 10, 1).getTime() });
    assert.equal(rollReminder(missed, now), missed);
    const legacy = R({ createdAt: 0 });
    assert.equal(rollReminder(legacy, now), legacy, 'старые записи без даты создания не трогаем');
  });

  test('вчерашнее несделанное дело не путаем с таким: запас — два дня (часовые пояса)', () => {
    const yesterday = R({ date: '2026-11-10', repeat: { every: 1, unit: 'day' }, createdAt: now.getTime() });
    assert.equal(rollReminder(yesterday, at(2026, 11, 12)), yesterday);
  });

  test('29 февраля: ближайший раз — 28-го, а в високосный год серия возвращается на 29-е', () => {
    const leap = R({ date: '2024-02-29', createdAt: at(2026, 3, 10).getTime() });
    const healed = rollReminder(leap, at(2026, 3, 10));
    assert.deepEqual([healed.date, healed.anchor], ['2027-02-28', '2024-02-29']);
    const next = rollReminder(completeReminder(healed, at(2027, 2, 28)), at(2027, 3, 1));
    assert.equal(next.date, '2028-02-29');
  });

  test('разовое дело в прошлом остаётся просроченным', () => {
    const once = R({ repeat: null, createdAt: now.getTime() });
    assert.equal(rollReminder(once, now), once);
    assert.equal(reminderOverdue(once, now), true);
  });
});
