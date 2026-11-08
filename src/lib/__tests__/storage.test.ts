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
