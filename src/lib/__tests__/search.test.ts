/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { matchesName, prepareQuery, searchKey, swapLayout } from '../search';

const finds = (name: string, query: string) => matchesName(name, prepareQuery(query)!);

test('транслитерация: латиница и кириллица сходятся к одному скелету', () => {
  const same = (...names: string[]) => {
    const keys = new Set(names.map(searchKey));
    assert.equal(keys.size, 1, `${names.join(' / ')} → ${[...keys].join(' | ')}`);
  };
  same('ninel', 'Нинель');
  same('Yulia', 'Julia', 'Iuliia', 'Юлия');
  same('Alexey', 'Alexei', 'Алексей');
  same('Dmitry', 'Dmitrii', 'Дмитрий');
  same('Sergey', 'Sergei', 'Сергей');
  same('Katya', 'Katia', 'Катя');
  same('Zhenya', 'Женя');
  same('Mikhail', 'Михаил');
  same('Fedor', 'Fyodor', 'Фёдор');
  same('Ksenia', 'Xenia', 'Ксения');
  same('Tanya Bertosh', 'Таня Бертош');
  same('Natasha', 'Наташа');
  same('Anya', 'Ania', 'Аня');
  same('Tsvetkov', 'Цветков');
  same('Shura', 'Шура');
});

test('поиск по началу слов, регистр и ё не важны', () => {
  assert.ok(finds('Нинель Петрова', 'ninel'));
  assert.ok(finds('Ninel', 'нин'));
  assert.ok(finds('Аня Смирнова', 'smirnova'));
  assert.ok(finds('Аня Смирнова', 'Смир'));
  assert.ok(finds('Аня Смирнова', 'аня смир'));
  assert.ok(finds('Фёдор', 'федор'));
  assert.ok(finds('Nicole', 'Николь'));
  assert.ok(!finds('Аня Смирнова', 'игорь'));
  assert.ok(!finds('Иван', 'ана'), 'середина слова не считается');
});

test('запрос в другой раскладке', () => {
  assert.equal(swapLayout('ybytk'), 'нинел');
  assert.equal(swapLayout('Ефтнф'), 'tanya');
  assert.ok(finds('Нинель', 'ybytk'));
  assert.ok(finds('Tanya', 'ефтнф'));
  assert.ok(finds('Аня Смирнова', 'fyz'));
});

test('пустой запрос и цифры', () => {
  assert.equal(prepareQuery('   '), null);
  assert.ok(finds('Офис 1500', '1500'));
});
