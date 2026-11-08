/// <reference types="node" />
// «Пол друзей» по списку: оттяжка, ровно один круг через рамку и возврат — плавно, без скачков, и список встаёт как стоял.
// Расстояния — px: круг — весь список с подзаголовками групп.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { buildFriendList } from '../friendList';
import { RUN, SPIN_START, flowEnd, flowFocus, flowShift, runGeometry, runItems, wrapPlace } from '../runFlow';
import type { Friend } from '../types';

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);
const LAP = 4200;
const PULL = 26;

describe('ход', () => {
  test('сначала стоит, потом оттягивается вниз', () => {
    assert.equal(flowShift(0, LAP, PULL), 0);
    assert.equal(flowShift(RUN.lead + RUN.focusIn, LAP, PULL), 0);
    near(flowShift(SPIN_START, LAP, PULL), -PULL);
  });
  test('ровно один круг — и встаёт как стоял, сколько бы ни ждали ответа', () => {
    for (const lap of [900, LAP, 12000]) {
      const end = flowEnd(lap);
      near(flowShift(end, lap, PULL), lap);
      near(flowShift(end + 3, lap, PULL), lap);
      near(flowShift(end + 30, lap, PULL), lap, 1e-6);
      near(flowFocus(end, lap), 0);
    }
  });
  test('длина круга не меняет ритм: короткий и длинный список идут одно и то же время', () => near(flowEnd(900), flowEnd(12000)));
  test('около 4,5 секунды — всегда', () => {
    const end = flowEnd(LAP);
    assert.ok(end > 4 && end < 5.2, `${end}`);
  });
  test('без скачков назад и рывков — после оттяжки', () => {
    let prev = flowShift(SPIN_START, LAP, PULL);
    const end = flowEnd(LAP);
    for (let t = SPIN_START; t <= end; t += 0.004) {
      const s = flowShift(t, LAP, PULL);
      assert.ok(s >= prev - 1e-9, `назад при t=${t.toFixed(3)}`);
      assert.ok(s - prev < 65, `скачок ${s - prev} при t=${t.toFixed(3)}`);
      prev = s;
    }
  });
  test('рамка и затемнение: плавно проявляются до оттяжки и гаснут в конце', () => {
    assert.equal(flowFocus(0, LAP), 0);
    near(flowFocus(RUN.lead + RUN.focusIn, LAP), 1);
    near(flowFocus(SPIN_START + 1, LAP), 1);
    const mid = flowFocus(flowEnd(LAP) - RUN.focusOut / 2, LAP);
    assert.ok(mid > 0.2 && mid < 0.8);
  });
});

describe('место в списке', () => {
  test('по кругу; выше верха — не дальше заданного', () => {
    assert.equal(wrapPlace(0, 0, 1000, 200), 0);
    assert.equal(wrapPlace(500, 130, 1000, 200), 370);
    assert.equal(wrapPlace(0, 130, 1000, 200), -130);
    assert.equal(wrapPlace(0, 260, 1000, 200), 740);
    assert.equal(wrapPlace(650, 1000, 1000, 200), 650);
  });
  test('стоит на месте — как в обычном списке, даже последние строки круга не прыгают наверх', () => {
    for (const y of [0, 34, 99, 799]) assert.equal(wrapPlace(y, 0, 1000, 200), y);
  });
});

describe('список для хода', () => {
  const friend = (name: string, favorite = false): Friend => ({ id: name, name, favorite }) as Friend;
  const list = (names: string[], fav: string[] = []) => buildFriendList([...names.map((n) => friend(n)), ...fav.map((n) => friend(n, true))], '', 'name', '2026-11-08');
  const shape = (items: ReturnType<typeof runItems>) => items.map((it) => (it.kind === 'label' ? `[${it.title}]` : it.friend.name)).join(' ');

  test('как в «Друзьях»: избранные, потом буквы — с подзаголовками и рамками групп, без повторов', () => {
    const items = runItems(list(['Андрей', 'Аня', 'Борис'], ['Мама']), 150);
    assert.equal(shape(items), '[Избранные] Мама [А] Андрей Аня [Б] Борис');
    assert.deepEqual(
      items.flatMap((r) => (r.kind === 'row' ? [[r.first, r.last, r.slot]] : [])),
      [
        [true, true, 0],
        [true, false, 1],
        [false, true, 2],
        [true, true, 3],
      ],
    );
  });
  test('очень много — первые max, последняя группа закрыта, пустого подзаголовка в конце нет', () => {
    const names = Array.from({ length: 40 }, (_, i) => `${i < 20 ? 'А' : 'Б'}${String(i).padStart(2, '0')}`);
    const items = runItems(list(names), 20);
    assert.equal(items.filter((it) => it.kind === 'row').length, 20);
    const tail = items[items.length - 1];
    assert.ok(tail.kind === 'row' && tail.last);
    assert.ok(!shape(items).includes('[Б]'));
  });
  test('никого — пусто', () => assert.deepEqual(runItems([], 150), []));
});

describe('геометрия', () => {
  const L = { kind: 'label' as const };
  const R = (last = false) => ({ kind: 'row' as const, last });
  test('подзаголовки и строки подряд; последняя строка группы на пиксель выше (рамка снизу)', () => {
    const g = runGeometry([L, R(), R(true), L, R(true)], 34, 65, 400);
    assert.deepEqual(g.y, [0, 34, 99, 165, 199]);
    assert.deepEqual(g.h, [34, 65, 66, 34, 66]);
  });
  test('рамка — на друге у середины видимого списка; друзей меньше — на последнем', () => {
    const items = [L, R(), R(), R(), R(true), L, R(), R(), R(true)];
    // экран 400: середина 200 → третий друг (34 + 65·2 … 34 + 65·3 = 164…229)
    const g = runGeometry(items, 34, 65, 400);
    assert.equal(g.bandTop, g.y[3]);
    assert.equal(g.mid, g.y[3] + 65 / 2);
    // экран 700: середина 350 → пятый друг (середина 361), после второго подзаголовка
    assert.equal(runGeometry(items, 34, 65, 700).bandTop, g.y[6]);
    const few = runGeometry([L, R(), R(true)], 34, 65, 400);
    assert.equal(few.bandTop, few.y[2]);
  });
  test('круг — весь список, но не меньше экрана: короткий список уходит целиком и возвращается снизу', () => {
    const long = Array.from({ length: 40 }, (_, i) => R(i === 39));
    assert.equal(runGeometry(long, 34, 65, 700).lap, 40 * 65 + 1);
    assert.equal(runGeometry([L, R(true)], 34, 65, 700).lap, 700 + 2 * 65);
  });
});
