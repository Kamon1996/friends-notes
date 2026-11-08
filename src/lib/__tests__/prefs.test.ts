/// <reference types="node" />
// Блоки «что любит» в карточке друга: какие есть и как чистится текст из шторки перед сохранением.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PREF_FIELDS, cleanPref } from '../prefs';

test('четыре блока в порядке карточки; подсказка про список — только у подарков', () => {
  assert.deepEqual(PREF_FIELDS.map((p) => [p.field, p.label]), [
    ['food', 'Еда'],
    ['flowers', 'Цветы'],
    ['gifts', 'Подарки'],
    ['notes', 'Заметки'],
  ]);
  assert.deepEqual(PREF_FIELDS.filter((p) => p.hint).map((p) => p.field), ['gifts']);
});

test('пробелы в концах строк, пустые строки в начале и в конце убираются, переносы внутри остаются', () => {
  assert.equal(cleanPref('Керамика  \nНастолки\t\n\n'), 'Керамика\nНастолки');
  assert.equal(cleanPref('\n  \nКерамика'), 'Керамика');
  assert.equal(cleanPref('Книги\n\nКофе'), 'Книги\n\nКофе');
  assert.equal(cleanPref('  отступ в начале строки сохраняется'), '  отступ в начале строки сохраняется');
  assert.equal(cleanPref('   \n\t\n'), '', 'одни пробелы — пустой блок');
  assert.equal(cleanPref(''), '');
});
