/// <reference types="node" />
// «Умные» подсказки в форме дела: время, «заранее» и свои шаблоны — по тому, как человек уже заводил дела.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { HALF_LIFE_DAYS, kindOf, timeSuggestions, titleKey, titleTemplates, usualAdvance } from '../habits';
import type { Friend, Reminder } from '../types';

const NOW = new Date(2026, 10, 10, 12).getTime();
const DAY = 86_400_000;
let seq = 0;
/** Дело, заведённое `ago` дней назад. */
const R = (patch: Partial<Reminder> & { ago?: number } = {}): Reminder => {
  const { ago = 1, ...rest } = patch;
  return { id: `r${++seq}`, title: 'Дело', note: '', friendId: null, date: '2026-11-12', time: '10:00', repeat: null, advance: 0, done: false, createdAt: NOW - ago * DAY, ...rest };
};
const F = (id: string, name: string): Friend => ({ id, name, emoji: '', birthday: null, phone: '', food: '', flowers: '', gifts: '', notes: '', dates: [], createdAt: 1 });
const mama = F('m', 'Мама');
const igor = F('i', 'Игорь Ветров');
const friends = [mama, igor];
const times = (list: Reminder[], kind: 'due' | 'at' | 'repeat' = 'due', title?: string) => timeSuggestions(list, friends, { kind, title }, NOW);

test('вид дела и ключ названия', () => {
  assert.equal(kindOf(R()), 'due');
  assert.equal(kindOf(R({ kind: 'at' })), 'at');
  assert.equal(kindOf(R({ repeat: { every: 1, unit: 'week' } })), 'repeat');
  assert.equal(titleKey('  Оплатить   Интернет! '), 'оплатить интернет');
  assert.equal(titleKey('Позвонить — Игорь Ветров', 'Игорь Ветров'), 'позвонить');
  assert.equal(titleKey('Ёлка'), 'елка');
});

describe('время', () => {
  test('новому человеку — стандартный набор по порядку часов, привычки нет', () => {
    assert.deepEqual(times([]), { chips: ['09:00', '10:00', '12:00', '15:00', '19:00'], own: [], usual: null });
  });

  test('один раз — ещё не привычка; со второго время появляется в ленте', () => {
    assert.deepEqual(times([R({ time: '21:30' })]).own, []);
    const two = times([R({ time: '21:30' }), R({ time: '21:30', ago: 3 })]);
    assert.deepEqual(two.own, ['21:30']);
    assert.equal(two.usual, '21:30');
    assert.deepEqual(two.chips, ['09:00', '10:00', '12:00', '15:00', '19:00', '21:30']);
  });

  test('порядок — всегда по часам; «своих» не больше трёх, всего не больше шести', () => {
    const list = ['07:15', '07:15', '08:30', '08:30', '21:30', '21:30', '23:00', '23:00', '23:00'].map((time, i) => R({ time, ago: i + 1 }));
    const s = times(list);
    assert.equal(s.own.length, 3);
    assert.equal(s.chips.length, 6);
    assert.deepEqual(s.chips, [...s.chips].sort());
    assert.ok(s.own.every((t) => s.chips.includes(t)));
    // Стандартные уступают место по убыванию полезности: 10:00 и 19:00 остаются дольше всех.
    assert.ok(s.chips.includes('10:00') && s.chips.includes('19:00') && !s.chips.includes('15:00'));
  });

  test('свежее весит больше старого: давняя привычка уступает новой', () => {
    const old = [0, 1, 2, 3].map((i) => R({ time: '08:00', ago: 300 + i }));
    const fresh = [0, 1].map((i) => R({ time: '19:30', ago: 2 + i }));
    assert.equal(times([...old, ...fresh]).usual, '19:30');
    // Через полгода без дел привычка перестаёт подсказываться совсем.
    assert.deepEqual(times(old).own, []);
    assert.ok(HALF_LIFE_DAYS > 14 && HALF_LIFE_DAYS < 120);
  });

  test('дела того же вида важнее: у встреч своё время, у дел «до срока» — своё', () => {
    const list = [R({ time: '09:00', ago: 1 }), R({ time: '09:00', ago: 2 }), R({ time: '18:30', kind: 'at', ago: 1 }), R({ time: '18:30', kind: 'at', ago: 2 })];
    assert.equal(times(list, 'due').usual, '09:00');
    assert.equal(times(list, 'at').usual, '18:30');
  });

  test('дела с таким же названием — самый сильный сигнал', () => {
    const list = [
      ...[1, 2, 3, 4, 5].map((ago) => R({ time: '10:00', ago })),
      R({ title: 'Позвонить маме', time: '19:00', ago: 20 }),
      R({ title: 'позвонить маме.', time: '19:00', ago: 40 }),
    ];
    assert.equal(times(list).usual, '10:00');
    assert.equal(times(list, 'due', 'Позвонить маме').usual, '19:00');
  });

  test('повторяющееся дело заведено давно, но живёт — привычка не устарела', () => {
    const list = [R({ time: '07:00', repeat: { every: 1, unit: 'day' }, ago: 400 }), R({ time: '07:00', repeat: { every: 1, unit: 'week' }, ago: 500 })];
    assert.equal(times(list, 'repeat').usual, '07:00');
  });
});

describe('заранее', () => {
  const adv = (list: Reminder[], title?: string) => usualAdvance(list, friends, { kind: 'due', title }, NOW);

  test('привычка — когда больше половины дел и не меньше двух', () => {
    assert.equal(adv([]), null);
    assert.equal(adv([R({ advance: 1440 })]), null);
    assert.deepEqual(adv([R({ advance: 1440 }), R({ advance: 1440, ago: 2 }), R({ advance: 0, ago: 3 })]), { advances: [1440], daily: false });
    // Пополам — привычки нет.
    assert.equal(adv([R({ advance: 1440 }), R({ advance: 1440 }), R({ advance: 60 }), R({ advance: 60 })]), null);
  });

  test('«каждый день до срока» — тоже вариант; у встреч и повторов «заранее» нет', () => {
    assert.deepEqual(adv([R({ daily: true }), R({ daily: true, ago: 2 })]), { advances: [], daily: true });
    assert.equal(usualAdvance([R({ advance: 1440 }), R({ advance: 1440 })], friends, { kind: 'at' }, NOW), null);
  });

  test('чаще всего «нет» — так и оставляем', () => {
    assert.deepEqual(adv([R(), R({ ago: 2 }), R({ advance: 60, ago: 3 })]), { advances: [], daily: false });
  });

  test('несколько «заранее» сразу — тоже привычка; у встреч и повторов она своя', () => {
    const both = [R({ advances: [60, 1440] }), R({ advances: [1440, 60], ago: 2 }), R({ advance: 60, ago: 3 })];
    assert.deepEqual(adv(both), { advances: [60, 1440], daily: false });
    // Встречи по умолчанию напоминают за день; человек привык ещё и за час.
    const visits = [R({ kind: 'at', advances: [60, 1440] }), R({ kind: 'at', advances: [60, 1440], ago: 2 }), R({ kind: 'at', ago: 9 })];
    assert.deepEqual(usualAdvance(visits, friends, { kind: 'at' }, NOW), { advances: [60, 1440], daily: false });
    const gym = [R({ repeat: { every: 1, unit: 'week' }, advances: [120] }), R({ repeat: { every: 1, unit: 'week', days: [1, 3, 5] }, advances: [120], ago: 2 })];
    assert.deepEqual(usualAdvance(gym, friends, { kind: 'repeat' }, NOW), { advances: [120], daily: false });
  });
});

describe('свои шаблоны', () => {
  const tpl = (list: Reminder[], friend?: Friend) => titleTemplates(list, friends, friend, NOW);

  test('без истории — только стандартные: личные или для друга', () => {
    assert.deepEqual(tpl([]).map((t) => [t.label, t.own]), [['Оплатить счета', false], ['Записаться к врачу', false], ['Сдать проект', false]]);
    const forIgor = tpl([], igor);
    assert.equal(forIgor[0].title, 'Написать — Игорь Ветров');
    assert.ok(forIgor.every((t) => !t.own));
  });

  test('название повторилось — стало шаблоном с привычным временем и «заранее»', () => {
    const list = [
      R({ title: 'Оплатить интернет', time: '10:00', advance: 1440, ago: 5 }),
      R({ title: 'оплатить интернет', time: '10:00', advance: 1440, ago: 35 }),
      R({ title: 'Разовое', time: '08:00' }),
    ];
    const [first, ...rest] = tpl(list);
    assert.deepEqual(first, { key: 'оплатить интернет', label: 'Оплатить интернет', title: 'Оплатить интернет', own: true, time: '10:00', kind: 'due', repeat: null, advances: [1440], daily: false, friendId: null });
    assert.ok(rest.every((t) => !t.own), 'разовое название шаблоном не становится');
  });

  test('дело всегда для одного человека — шаблон подставит и его', () => {
    const list = [R({ title: 'Позвонить маме', friendId: 'm', time: '19:00', advance: 60, ago: 3 }), R({ title: 'Позвонить маме', friendId: 'm', time: '19:00', advance: 60, ago: 10 })];
    const [t] = tpl(list);
    assert.deepEqual([t.label, t.title, t.friendId, t.time, t.advances], ['Позвонить маме', 'Позвонить маме', 'm', '19:00', [60]]);
    // Для другого друга — то же действие с его именем.
    const [forIgor] = tpl(list, igor);
    assert.deepEqual([forIgor.label, forIgor.title, forIgor.friendId, forIgor.own], ['Позвонить', 'Позвонить — Игорь Ветров', 'i', true]);
  });

  test('одно действие для разных друзей — общий шаблон без человека', () => {
    const list = [R({ title: 'Позвонить — Игорь Ветров', friendId: 'i', time: '20:00' }), R({ title: 'Позвонить — Мама', friendId: 'm', time: '20:00', ago: 4 })];
    const [t] = tpl(list);
    assert.deepEqual([t.label, t.title, t.friendId, t.time], ['Позвонить', 'Позвонить', null, '20:00']);
    // Стандартный «Позвонить» в списке для друга не дублируется.
    const labels = tpl(list, mama).map((x) => x.label);
    assert.equal(labels.filter((l) => l === 'Позвонить').length, 1);
    assert.equal(tpl(list, mama)[0].title, 'Позвонить — Мама');
  });

  test('личные дела другу не подсказываем; своих шаблонов не больше трёх; повтор запоминается', () => {
    const personal = [R({ title: 'Оплатить интернет' }), R({ title: 'Оплатить интернет', ago: 2 })];
    assert.ok(tpl(personal, igor).every((t) => !t.own));
    const many = ['А', 'Б', 'В', 'Г'].flatMap((title, i) => [R({ title, ago: i + 1 }), R({ title, ago: i + 2 })]);
    assert.equal(tpl(many).filter((t) => t.own).length, 3);
    const gym = [R({ title: 'Тренировка', time: '19:00', repeat: { every: 1, unit: 'week' }, ago: 30 }), R({ title: 'Тренировка', time: '19:00', repeat: { every: 2, unit: 'week' }, ago: 3 })];
    assert.deepEqual([tpl(gym)[0].kind, tpl(gym)[0].repeat], ['repeat', { every: 2, unit: 'week' }]);
  });
});
