/// <reference types="node" />
// «Пол друзей» по списку: изгиб, оттяжка, полный круг и возврат — плавно, без скачков, и список встаёт как стоял.
// Расстояния — px: круг — весь список с подзаголовками групп.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { BEND, SPIN_START, bendPlace, flowBend, flowEnd, flowShift, runItems, wrapPlace } from '../bendFlow';
import { buildFriendList } from '../friendList';
import type { Friend } from '../types';

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);
const LAP = 4200;
const PULL = 26;
const bent = (d: number) => bendPlace(d, 1, BEND.radius, 900);

describe('ход', () => {
  test('сначала стоит, потом оттягивается вниз', () => {
    assert.equal(flowShift(0, 0, LAP, PULL), 0);
    assert.equal(flowShift(BEND.lead + BEND.bendIn, 0, LAP, PULL), 0);
    near(flowShift(SPIN_START, 0, LAP, PULL), -PULL);
  });
  test('полный круг — и встаёт ровно как стоял', () => {
    for (const lap of [900, LAP, 12000]) {
      const end = flowEnd(0, lap);
      near(flowShift(end, 0, lap, PULL), lap);
      near(flowShift(end + 3, 0, lap, PULL), lap);
      near(flowBend(end, 0, lap), 0);
    }
  });
  test('длина круга не меняет ритм: короткий и длинный список идут одно и то же время', () => near(flowEnd(0, 900), flowEnd(0, 12000)));
  test('около 4,5 секунды, если ответ готов сразу', () => {
    const end = flowEnd(0, LAP);
    assert.ok(end > 4.2 && end < 5.4, `${end}`);
  });
  test('без скачков назад и рывков — после оттяжки', () => {
    for (const doneAt of [0, SPIN_START + 3, Infinity]) {
      let prev = flowShift(SPIN_START, doneAt, LAP, PULL);
      const end = flowEnd(doneAt, LAP);
      for (let t = SPIN_START; t <= end; t += 0.004) {
        const s = flowShift(t, doneAt, LAP, PULL);
        assert.ok(s >= prev - 1e-9, `назад при t=${t.toFixed(3)}, doneAt=${doneAt}`);
        assert.ok(s - prev < 65, `скачок ${s - prev} при t=${t.toFixed(3)}`);
        prev = s;
      }
    }
  });
  test('ответ пришёл во время кружения — путь до этого момента тот же', () => {
    for (let t = SPIN_START + 2; t < SPIN_START + 8; t += 0.41) near(flowShift(t, Infinity, LAP, PULL), flowShift(t, t, LAP, PULL));
  });
  test('изгиб: плавно туда и обратно', () => {
    assert.equal(flowBend(0, 0, LAP), 0);
    near(flowBend(BEND.lead + BEND.bendIn, 0, LAP), 1);
    near(flowBend(SPIN_START + 1, 0, LAP), 1);
    const mid = flowBend(flowEnd(0, LAP) - BEND.bendOut / 2, 0, LAP);
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
  test('ровный список — без наклона и масштаба', () => {
    const p = bendPlace(130, 0, BEND.radius, 900);
    assert.equal(p.y, 130);
    assert.equal(p.angle, 0);
    assert.equal(p.scale, 1);
  });
  test('изогнут: рамка ровная, края уходят назад и наклоняются в разные стороны', () => {
    const mid = bent(0);
    near(mid.y, 0);
    near(mid.angle, 0);
    near(mid.scale, 1);
    const top = bent(-4 * 65);
    const bottom = bent(5 * 65);
    assert.ok(top.y < 0 && bottom.y > 0);
    assert.ok(top.scale < 1 && bottom.scale < 1);
    assert.ok(top.angle > 10 && bottom.angle < -10, `${top.angle} / ${bottom.angle}`);
    assert.ok(Math.abs(top.angle) < 35);
  });
  test('изгиб сохраняет порядок: кто ниже в списке, тот ниже и на изгибе', () => {
    let prev = -Infinity;
    for (let d = -400; d <= 600; d += 17) {
      const y = bent(d).y;
      assert.ok(y > prev, `при d=${d}`);
      prev = y;
    }
  });
});

describe('список для хода', () => {
  const friend = (name: string, favorite = false): Friend => ({ id: name, name, favorite }) as Friend;
  const list = (names: string[], fav: string[] = []) => buildFriendList([...names.map((n) => friend(n)), ...fav.map((n) => friend(n, true))], '', 'name', '2026-11-08');
  const shape = (items: ReturnType<typeof runItems>) => items.map((it) => (it.kind === 'label' ? `[${it.title}]` : it.friend.name)).join(' ');

  test('как в «Друзьях»: избранные, потом буквы — с подзаголовками и рамками групп', () => {
    const items = runItems(list(['Андрей', 'Аня', 'Борис'], ['Мама']), 1, 150);
    assert.equal(shape(items), '[Избранные] Мама [А] Андрей Аня [Б] Борис');
    const rows = items.filter((it) => it.kind === 'row');
    assert.deepEqual(
      rows.map((r) => r.kind === 'row' && [r.first, r.last]),
      [
        [true, true],
        [true, false],
        [false, true],
        [true, true],
      ],
    );
    assert.ok(items.every((it) => it.real));
  });
  test('друзей мало — список повторяется целиком, повторы не «настоящие» и с теми же номерами', () => {
    const items = runItems(list(['Андрей', 'Аня', 'Борис']), 7, 150);
    assert.equal(items.filter((it) => it.kind === 'row').length, 9);
    assert.equal(shape(items), '[А] Андрей Аня [Б] Борис [А] Андрей Аня [Б] Борис [А] Андрей Аня [Б] Борис');
    assert.equal(items.filter((it) => it.real).length, 5);
    const slots = items.flatMap((it) => (it.kind === 'row' ? [it.slot] : []));
    assert.deepEqual(slots, [0, 1, 2, 0, 1, 2, 0, 1, 2]);
    assert.equal(new Set(items.map((it) => it.key)).size, items.length);
  });
  test('очень много — первые max, последняя группа закрыта, пустого подзаголовка в конце нет', () => {
    const names = Array.from({ length: 40 }, (_, i) => `${i < 20 ? 'А' : 'Б'}${String(i).padStart(2, '0')}`);
    const items = runItems(list(names), 1, 20);
    assert.equal(items.filter((it) => it.kind === 'row').length, 20);
    const tail = items[items.length - 1];
    assert.ok(tail.kind === 'row' && tail.last);
    assert.ok(!shape(items).includes('[Б]'));
  });
  test('никого — пусто', () => assert.deepEqual(runItems([], 30, 150), []));
});
