/// <reference types="node" />
// Чтение сохранённых данных: старые версии, обрывки, чужие типы — без падений и без потери понятного.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { normalizeData, parseStored } from '../storage';
import { DEFAULT_SETTINGS } from '../types';

test('данные старой версии без новых полей дополняются значениями по умолчанию', () => {
  const data = normalizeData({
    version: 1,
    settings: { eventTime: '09:00', theme: 'dark' },
    friends: [{ id: 'f', name: 'Старый Друг', birthday: '1980-06-12' }],
    reminders: [{ id: 'r', title: 'Позвонить', date: '2026-06-12' }],
  });
  assert.equal(data.settings.eventTime, '09:00');
  assert.equal(data.settings.crashReports, DEFAULT_SETTINGS.crashReports);
  const [f] = data.friends;
  assert.deepEqual([f.dates, f.phone, f.notes, f.socials], [[], '', '', undefined]);
  const [r] = data.reminders;
  assert.deepEqual([r.time, r.repeat, r.friendId, r.done, r.advance], ['10:00', null, null, false, 0]);
});

test('непонятные записи пропускаются, а не роняют приложение', () => {
  const data = normalizeData({ friends: [null, 5, { id: 'x' }, { id: 'ok', name: 'Аня', dates: [{ id: 'd', date: '2020-01-01' }, 'мусор'] }], reminders: 'не массив' });
  assert.deepEqual(data.friends.map((f) => f.name), ['Аня']);
  assert.deepEqual(data.friends[0].dates, [{ id: 'd', date: '2020-01-01', title: '', yearly: true }]);
  assert.deepEqual(data.reminders, []);
  assert.deepEqual(normalizeData(null).friends, []);
  assert.deepEqual(normalizeData([1, 2]).settings, DEFAULT_SETTINGS);
});

test('пустое хранилище — нет данных; испорченная строка — признак «отложить в копию»', () => {
  assert.deepEqual(parseStored(null), { data: null, broken: false });
  assert.deepEqual(parseStored('{"friends":[{"id":"a"'), { data: null, broken: true });
  assert.equal(parseStored('{"friends":[]}').data?.friends.length, 0);
});

test('разбор заметок ИИ: отпечаток и «разобрать в фоне» переживают перезапуск, мусор отбрасывается', () => {
  const data = normalizeData({
    version: 1,
    friends: [
      { id: 'a', name: 'А', notes: 'О себе: inst: anya', notesQueue: true },
      { id: 'b', name: 'Б', notes: 'x', notesSeen: '1-abc' },
      { id: 'c', name: 'В', notesSeen: 42, notesQueue: 'yes' },
    ],
  });
  assert.deepEqual(
    data.friends.map((f) => [f.notesSeen, f.notesQueue]),
    [
      [undefined, true],
      ['1-abc', undefined],
      [undefined, undefined],
    ],
  );
  assert.equal('notesQueue' in data.friends[2], false);
});

test('«каждый день до срока»: остаётся только явное true у разового, у повторяющегося и мусора — пропадает', () => {
  const data = normalizeData({
    reminders: [
      { id: 'a', title: 'Билеты', date: '2026-11-20', daily: true },
      { id: 'b', title: 'Таблетки', date: '2026-11-20', daily: true, repeat: { every: 1, unit: 'day' } },
      { id: 'c', title: 'Счета', date: '2026-11-20', daily: 'да' },
      { id: 'd', title: 'Врач', date: '2026-11-20' },
    ],
  });
  assert.deepEqual(
    data.reminders.map((r) => [r.id, 'daily' in r ? r.daily : '—']),
    [
      ['a', true],
      ['b', '—'],
      ['c', '—'],
      ['d', '—'],
    ],
  );
});

test('дело: «на дату и время», важность, время на дело и момент «сделано» — только понятные значения', () => {
  const data = normalizeData({
    reminders: [
      { id: 'a', title: 'Стоматолог', date: '2026-11-20', kind: 'at', priority: 3, minutes: 60, done: true, doneAt: 1700000000000 },
      { id: 'b', title: 'Таблетки', date: '2026-11-20', kind: 'at', repeat: { every: 1, unit: 'day' }, priority: 7, minutes: -5, doneAt: 5 },
      { id: 'c', title: 'Счета', date: '2026-11-20', kind: 'встреча', priority: '3', minutes: 2.5 },
    ],
  });
  const pick = (r: (typeof data.reminders)[number]) => [r.kind ?? '—', r.priority ?? '—', r.minutes ?? '—', r.doneAt ?? '—'];
  assert.deepEqual(data.reminders.map(pick), [
    ['at', 3, 60, 1700000000000],
    ['—', '—', '—', '—'],
    ['—', '—', '—', '—'],
  ]);
});
