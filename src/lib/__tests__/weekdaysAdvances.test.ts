/// <reference types="node" />
// Повтор по дням недели («тренировка по пн, ср и пт») и несколько «заранее» сразу («за день и за час»).
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { advancesOf, advancesText, cleanAdvances, storeAdvances } from '../advances';
import { calendarEvents } from '../calendar';
import { formatRepeat, nextOccurrenceAfter, occurrences, previousOccurrence, repeatDays, snapToRepeat, weekdayOf } from '../dates';
import { completeReminder, nextAfterCurrent, planNotifications, reminderFuse, rollReminder } from '../events';
import { whenSummary } from '../reminderForm';
import { normalizeData } from '../storage';
import { DEFAULT_SETTINGS, EMPTY_DATA, type AppData, type Reminder, type Repeat } from '../types';

const R = (patch: Partial<Reminder> = {}): Reminder => ({
  id: 'r', title: 'Тренировка', note: '', friendId: null, date: '2026-11-11', time: '19:00', repeat: null, advance: 0, done: false, createdAt: 0, ...patch,
});
const app = (patch: Partial<AppData>): AppData => ({ ...EMPTY_DATA, settings: DEFAULT_SETTINGS, ...patch });
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min);
const take = (start: string, repeat: Repeat, n: number) => {
  const out: string[] = [];
  for (const d of occurrences(start, repeat)) {
    out.push(d);
    if (out.length === n) break;
  }
  return out;
};
const stamp = (d: Date) => `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const MWF: Repeat = { every: 1, unit: 'week', days: [1, 3, 5] };

describe('повтор по дням недели', () => {
  test('дни недели: 1 — понедельник … 7 — воскресенье', () => {
    assert.deepEqual(['2026-11-09', '2026-11-11', '2026-11-15'].map(weekdayOf), [1, 3, 7]);
    assert.deepEqual(repeatDays({ every: 1, unit: 'week', days: [5, 1, 3, 3, 9, 0] }), [1, 3, 5]);
    assert.equal(repeatDays({ every: 1, unit: 'week' }), null);
    assert.equal(repeatDays({ every: 1, unit: 'week', days: [] }), null);
    // У месячного повтора дней недели не бывает.
    assert.equal(repeatDays({ every: 1, unit: 'month', days: [1] }), null);
  });

  test('пн, ср, пт: разы идут по выбранным дням, начиная с даты', () => {
    // 11 ноября 2026 — среда.
    assert.deepEqual(take('2026-11-11', MWF, 5), ['2026-11-11', '2026-11-13', '2026-11-16', '2026-11-18', '2026-11-20']);
    // Начало в четверг — понедельник и среда этой недели уже позади.
    assert.deepEqual(take('2026-11-12', MWF, 3), ['2026-11-13', '2026-11-16', '2026-11-18']);
    // Через год и через границу месяца счёт не сбивается.
    assert.deepEqual(take('2026-12-28', MWF, 4), ['2026-12-28', '2026-12-30', '2027-01-01', '2027-01-04']);
  });

  test('раз в две недели по вт и чт — через неделю пропуск', () => {
    assert.deepEqual(take('2026-11-10', { every: 2, unit: 'week', days: [2, 4] }, 4), ['2026-11-10', '2026-11-12', '2026-11-24', '2026-11-26']);
  });

  test('обычный недельный повтор — как раньше, от даты', () => {
    assert.deepEqual(take('2026-11-11', { every: 1, unit: 'week' }, 3), ['2026-11-11', '2026-11-18', '2026-11-25']);
  });

  test('подписи: «по пн, ср и пт», будни, выходные, один день', () => {
    assert.equal(formatRepeat(MWF), 'по пн, ср и пт');
    assert.equal(formatRepeat({ every: 1, unit: 'week', days: [1, 2, 3, 4, 5] }), 'по будням');
    assert.equal(formatRepeat({ every: 1, unit: 'week', days: [6, 7] }), 'по выходным');
    assert.equal(formatRepeat({ every: 1, unit: 'week', days: [7] }), 'по вс');
    assert.equal(formatRepeat({ every: 1, unit: 'week', days: [1, 2, 3, 4, 5, 6, 7] }), 'каждый день');
    assert.equal(formatRepeat({ every: 2, unit: 'week', days: [2, 4] }), 'раз в 2 недели по вт и чт');
    assert.equal(formatRepeat({ every: 1, unit: 'week' }), 'каждую неделю');
  });

  test('дата подстраивается под выбранные дни; прошлый раз — предыдущий выбранный день', () => {
    assert.equal(snapToRepeat('2026-11-12', MWF), '2026-11-13'); // четверг → пятница
    assert.equal(snapToRepeat('2026-11-13', MWF), '2026-11-13');
    assert.equal(snapToRepeat('2026-11-14', MWF), '2026-11-16'); // суббота → понедельник
    assert.equal(snapToRepeat('2026-11-12', { every: 1, unit: 'week' }), '2026-11-12');
    assert.equal(previousOccurrence('2026-11-16', MWF), '2026-11-13'); // понедельник ← пятница
    assert.equal(previousOccurrence('2026-11-13', MWF), '2026-11-11');
    assert.equal(previousOccurrence('2026-11-16', { every: 1, unit: 'week' }), '2026-11-09');
  });

  test('сделано в среду — следующий раз в пятницу; уведомления идут по дням', () => {
    const r = R({ repeat: MWF });
    const done = completeReminder(r, at(2026, 11, 11, 20));
    assert.equal(nextAfterCurrent(done), '2026-11-13');
    assert.equal(rollReminder(done, at(2026, 11, 12, 8)).date, '2026-11-13');
    assert.equal(nextOccurrenceAfter('2026-11-11', '19:00', MWF, at(2026, 11, 13, 19)), '2026-11-16');
    const plan = planNotifications(app({ reminders: [r] }), at(2026, 11, 11, 12));
    assert.deepEqual(plan.slice(0, 4).map((p) => stamp(p.at)), ['11/11 19:00', '11/13 19:00', '11/16 19:00', '11/18 19:00']);
    // Фитиль горит от прошлого раза (два дня), а не от недели назад.
    const fuse = reminderFuse(R({ date: '2026-11-13', repeat: MWF }), at(2026, 11, 12, 12))!;
    assert.ok(fuse > 0.6 && fuse < 0.9, String(fuse));
  });

  test('в календаре — на каждом выбранном дне', () => {
    const ev = calendarEvents({ friends: [], reminders: [R({ repeat: MWF, calendar: true })] }, '2026-11-09', '2026-11-22');
    assert.deepEqual(ev.filter((e) => e.kind === 'meeting').map((e) => e.date), ['2026-11-11', '2026-11-13', '2026-11-16', '2026-11-18', '2026-11-20']);
  });

  test('хранение: дни недели — только настоящие и только у недельного повтора', () => {
    const data = normalizeData({
      reminders: [
        { id: 'a', date: '2026-11-11', repeat: { every: 1, unit: 'week', days: [5, 1, 3, 3, 8, 'пн'] } },
        { id: 'b', date: '2026-11-11', repeat: { every: 1, unit: 'month', days: [1] } },
        { id: 'c', date: '2026-11-11', repeat: { every: 1, unit: 'week', days: [] } },
      ],
    });
    assert.deepEqual(data.reminders.map((r) => r.repeat), [{ every: 1, unit: 'week', days: [1, 3, 5] }, { every: 1, unit: 'month' }, { every: 1, unit: 'week' }]);
  });
});

describe('несколько «заранее» сразу', () => {
  test('старые дела читаются как раньше: одно «заранее», встреча — за день, повтор — ничего', () => {
    assert.deepEqual(advancesOf(R({ advance: 1440 })), [1440]);
    assert.deepEqual(advancesOf(R()), []);
    assert.deepEqual(advancesOf(R({ kind: 'at' })), [1440]);
    assert.deepEqual(advancesOf(R({ repeat: MWF, advance: 1440 })), []);
    // Список главнее; пустой список у встречи — «заранее не напоминать».
    assert.deepEqual(advancesOf(R({ advance: 60, advances: [1440, 60, 60, 7] })), [60, 1440]);
    assert.deepEqual(advancesOf(R({ kind: 'at', advances: [] })), []);
    // «Каждый день до срока» закрывает дни — остаются только часы.
    assert.deepEqual(advancesOf(R({ daily: true, advances: [60, 120, 1440] })), [60, 120]);
    assert.deepEqual(cleanAdvances([120, 'час', 60, 60, 30]), [60, 120]);
  });

  test('запись: простое — по-старому, сложное — списком', () => {
    assert.deepEqual(storeAdvances('due', [], false), { advance: 0 });
    assert.deepEqual(storeAdvances('due', [1440], false), { advance: 1440 });
    assert.deepEqual(storeAdvances('due', [1440, 60], false), { advance: 0, advances: [60, 1440] });
    assert.deepEqual(storeAdvances('due', [120], false), { advance: 0, advances: [120] });
    assert.deepEqual(storeAdvances('due', [60, 1440], true), { advance: 0, daily: true, advances: [60] });
    assert.deepEqual(storeAdvances('due', [], true), { advance: 0, daily: true });
    assert.deepEqual(storeAdvances('at', [1440], false), { advance: 0 });
    assert.deepEqual(storeAdvances('at', [], false), { advance: 0, advances: [] });
    assert.deepEqual(storeAdvances('at', [60, 1440], false), { advance: 0, advances: [60, 1440] });
    assert.deepEqual(storeAdvances('repeat', [], false), { advance: 0 });
    assert.deepEqual(storeAdvances('repeat', [60], true), { advance: 0, advances: [60] });
    // Что записали — то и прочитали.
    for (const [kind, list] of [['due', [60, 1440]], ['at', []], ['at', [1440]], ['repeat', [120]], ['due', [4320]]] as const) {
      const stored = storeAdvances(kind, list, false);
      const r = R({ ...stored, ...(kind === 'at' ? { kind: 'at' as const } : {}), repeat: kind === 'repeat' ? MWF : null });
      assert.deepEqual(advancesOf(r), [...list], `${kind} ${list}`);
    }
  });

  test('уведомления: за день и за час — два заранее и одно в срок', () => {
    const now = at(2026, 11, 10, 12);
    const plan = (r: Reminder) => planNotifications(app({ reminders: [r] }), now).map((p) => stamp(p.at));
    assert.deepEqual(plan(R({ date: '2026-11-13', time: '10:00', advances: [60, 1440] })), ['11/12 10:00', '11/13 09:00', '11/13 10:00']);
    assert.deepEqual(plan(R({ date: '2026-11-13', time: '10:00', advances: [120] })), ['11/13 08:00', '11/13 10:00']);
    // Встреча: по умолчанию за день; можно добавить «за час» или убрать «заранее» совсем.
    assert.deepEqual(plan(R({ kind: 'at', date: '2026-11-13', time: '15:00' })), ['11/12 15:00', '11/13 15:00']);
    assert.deepEqual(plan(R({ kind: 'at', date: '2026-11-13', time: '15:00', advances: [60, 1440] })), ['11/12 15:00', '11/13 14:00', '11/13 15:00']);
    assert.deepEqual(plan(R({ kind: 'at', date: '2026-11-13', time: '15:00', advances: [] })), ['11/13 15:00']);
    // Каждый день до срока и ещё за час в последний день.
    assert.deepEqual(plan(R({ date: '2026-11-12', time: '18:00', daily: true, advances: [60] })), ['11/10 18:00', '11/11 18:00', '11/12 17:00', '11/12 18:00']);
    // Повтор: «за 2 часа» перед каждым разом.
    assert.deepEqual(plan(R({ repeat: MWF, advances: [120] })).slice(0, 4), ['11/11 17:00', '11/11 19:00', '11/13 17:00', '11/13 19:00']);
    // Прошедшее «заранее» не приходит.
    assert.deepEqual(plan(R({ date: '2026-11-10', time: '12:30', advances: [60, 1440] })), ['11/10 12:30']);
  });

  test('текст у встречи «за день» — прежний, у остального — «Скоро: через…»', () => {
    const bodies = planNotifications(app({ reminders: [R({ kind: 'at', title: 'Врач', date: '2026-11-13', time: '15:00', advances: [120, 1440] })] }), at(2026, 11, 10, 12)).map((p) => p.body);
    assert.match(bodies[0], /^Завтра в 15:00/);
    assert.match(bodies[1], /^Скоро: через 2 часа/);
  });

  test('подписи', () => {
    assert.equal(advancesText([60]), 'за час');
    assert.equal(advancesText([60, 1440]), 'за день и за час');
    assert.equal(advancesText([60, 120, 10080]), 'за неделю, за 2 часа и за час');
    assert.equal(advancesText([]), '');
  });

  test('сводка под «Когда» перечисляет все уведомления', () => {
    const today = '2026-11-10';
    assert.equal(whenSummary(R({ date: '2026-11-13', time: '10:00' }), today), 'Напомню пт, 13 ноя в 10:00.');
    assert.equal(whenSummary(R({ date: '2026-11-11', time: '10:00', advance: 1440 }), today), 'Напомню сегодня и завтра в 10:00.');
    assert.equal(whenSummary(R({ date: '2026-11-11', time: '19:00', advance: 60 }), today), 'Напомню завтра в 18:00 и в 19:00.');
    assert.equal(whenSummary(R({ date: '2026-11-13', time: '10:00', advances: [60, 1440] }), today), 'Напомню чт, 12 ноя в 10:00, пт, 13 ноя в 9:00 и в 10:00.');
    assert.equal(whenSummary(R({ kind: 'at', date: '2026-11-13', time: '15:00' }), today), 'Напомню чт, 12 ноя и пт, 13 ноя в 15:00.');
    assert.equal(whenSummary(R({ kind: 'at', date: '2026-11-13', time: '15:00', advances: [] }), today), 'Напомню пт, 13 ноя в 15:00.');
    assert.equal(whenSummary(R({ repeat: MWF, advances: [120, 1440] }), today), 'По пн, ср и пт в 19:00, заранее — за день и за 2 часа. Ближайший раз — завтра.');
    assert.equal(whenSummary(R({ repeat: { every: 1, unit: 'week' } }), today), 'Каждую неделю в 19:00. Ближайший раз — завтра.');
    assert.equal(
      whenSummary(R({ date: '2026-11-20', time: '12:00', daily: true, advances: [60] }), today),
      'Напомню каждый день в 12:00 до пт, 20 ноя — пока не отметишь «Сделано». В день срока — ещё за час.',
    );
  });

  test('хранение: список «заранее» — только известные значения; пустой — тоже выбор', () => {
    const data = normalizeData({
      reminders: [
        { id: 'a', date: '2026-11-11', advances: [1440, 60, 17, 'час', 60] },
        { id: 'b', date: '2026-11-11', kind: 'at', advances: [] },
        { id: 'c', date: '2026-11-11', advance: 120 },
        { id: 'd', date: '2026-11-11', advances: 'за час' },
      ],
    });
    assert.deepEqual(data.reminders.map((r) => [r.advance, r.advances]), [[0, [60, 1440]], [0, []], [120, undefined], [0, undefined]]);
  });
});
