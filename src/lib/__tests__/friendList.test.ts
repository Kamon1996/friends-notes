/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildFriendList, favoritesFirst, byName, letterOf } from '../friendList';
import type { Friend } from '../types';

const F = (id: string, name: string, extra: Partial<Friend> = {}): Friend => ({
  id, name, emoji: '', birthday: null, phone: '', food: '', flowers: '', gifts: '', notes: '', dates: [], createdAt: 1, ...extra,
});
const today = '2026-11-06';
const friends = [
  F('a', 'Аня', { birthday: '1995-11-06' }),
  F('b', 'Борис', { birthday: '1990-11-20', favorite: true }),
  F('c', 'Вика', { birthday: '1992-11-08' }),
  F('d', 'Мама', { favorite: true, flowers: 'Тюльпаны' }),
  F('e', '+375 29 1', {}),
];
const shape = (items: ReturnType<typeof buildFriendList>) => items.map((i) => (i.type === 'label' ? `[${i.title}${i.star ? '★' : ''}]` : `${i.friend.name}${i.first ? '<' : ''}${i.last ? '>' : ''}`));

test('по имени: избранные сверху со звездой, остальные по буквам, номера в «#»', () => {
  assert.deepEqual(shape(buildFriendList(friends, '', 'name', today)), [
    '[Избранные★]', 'Борис<', 'Мама>',
    '[#]', '+375 29 1<>',
    '[А]', 'Аня<>',
    '[В]', 'Вика<>',
  ]);
});

test('по дате: избранные сверху, затем «Остальные» по ближайшему дню рождения', () => {
  assert.deepEqual(shape(buildFriendList(friends, '', 'date', today)), [
    '[Избранные★]', 'Борис<', 'Мама>',
    '[Остальные]', 'Аня<', 'Вика', '+375 29 1>',
  ]);
});

test('без избранных подписи «Остальные» нет, список не меняется', () => {
  const plain = friends.map((f) => ({ ...f, favorite: false }));
  const items = buildFriendList(plain, '', 'date', today);
  assert.equal(items[0].type, 'friend');
  assert.deepEqual(shape(items), ['Аня<', 'Вика', 'Борис', '+375 29 1', 'Мама>']);
});

test('поиск только по имени и сохраняет группы', () => {
  assert.deepEqual(buildFriendList(friends, 'тюльп', 'name', today), [], 'цветы и еда не ищутся');
  assert.deepEqual(shape(buildFriendList(friends, 'мам', 'name', today)), ['[Избранные★]', 'Мама<>']);
  assert.deepEqual(shape(buildFriendList(friends, 'вик', 'name', today)), ['[В]', 'Вика<>']);
  assert.deepEqual(buildFriendList(friends, 'нет такого', 'name', today), []);
});

test('favoritesFirst и letterOf', () => {
  const sorted = [...friends].sort(favoritesFirst(byName)).map((f) => f.name);
  assert.deepEqual(sorted, ['Борис', 'Мама', '+375 29 1', 'Аня', 'Вика']);
  assert.equal(letterOf(F('x', '  ёжик')), 'Ё');
  assert.equal(letterOf(F('x', '🎉 Праздник')), '#');
  assert.equal(letterOf(F('x', '')), '#');
});
