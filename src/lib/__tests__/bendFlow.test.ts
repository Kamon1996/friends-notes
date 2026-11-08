/// <reference types="node" />
// «Пол друзей» по списку: изгиб, оттяжка, полный круг и возврат — плавно, без скачков, и список встаёт как стоял.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { BEND, SPIN_START, bendPlace, flowBend, flowEnd, flowShift, rowPlace } from '../bendFlow';

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

describe('ход', () => {
  test('сначала стоит, потом оттягивается вниз', () => {
    assert.equal(flowShift(0, 0, 100), 0);
    assert.equal(flowShift(BEND.lead + BEND.bendIn, 0, 100), 0);
    near(flowShift(SPIN_START, 0, 100), -BEND.pullRows);
  });
  test('полный круг — и встаёт ровно как стоял', () => {
    for (const rows of [30, 100, 150]) {
      const end = flowEnd(0, rows);
      near(flowShift(end, 0, rows), rows);
      near(flowShift(end + 3, 0, rows), rows);
      near(flowBend(end, 0, rows), 0);
    }
  });
  test('около 4,5 секунды, если ответ готов сразу', () => {
    const end = flowEnd(0, 100);
    assert.ok(end > 4.2 && end < 5.2, `${end}`);
  });
  test('без скачков назад и рывков — после оттяжки', () => {
    for (const doneAt of [0, SPIN_START + 3, Infinity]) {
      let prev = flowShift(SPIN_START, doneAt, 100);
      const end = flowEnd(doneAt, 100);
      for (let t = SPIN_START; t <= end; t += 0.004) {
        const s = flowShift(t, doneAt, 100);
        assert.ok(s >= prev - 1e-9, `назад при t=${t.toFixed(3)}, doneAt=${doneAt}`);
        assert.ok(s - prev < 1, `скачок при t=${t.toFixed(3)}`);
        prev = s;
      }
    }
  });
  test('ответ пришёл во время кружения — путь до этого момента тот же', () => {
    for (let t = SPIN_START + 2; t < SPIN_START + 8; t += 0.41) near(flowShift(t, Infinity, 100), flowShift(t, t, 100));
  });
  test('изгиб: плавно туда и обратно', () => {
    assert.equal(flowBend(0, 0, 100), 0);
    near(flowBend(BEND.lead + BEND.bendIn, 0, 100), 1);
    near(flowBend(SPIN_START + 1, 0, 100), 1);
    const mid = flowBend(flowEnd(0, 100) - BEND.bendOut / 2, 0, 100);
    assert.ok(mid > 0.2 && mid < 0.8);
  });
});

describe('место строки', () => {
  test('по кругу, выше верха — не больше трёх строк', () => {
    assert.equal(rowPlace(0, 0, 100), 0);
    assert.equal(rowPlace(5, 2, 100), 3);
    assert.equal(rowPlace(0, 2, 100), -2);
    assert.equal(rowPlace(0, 4, 100), 96);
    assert.equal(rowPlace(10, 100, 100), 10);
  });
  test('ровный список — шаг строки, без наклона', () => {
    const p = bendPlace(6, 0);
    assert.equal(p.y, (6 - BEND.band) * BEND.row);
    assert.equal(p.angle, 0);
    assert.equal(p.scale, 1);
  });
  test('изогнут: рамка ровная, края уходят назад и наклоняются в разные стороны', () => {
    const mid = bendPlace(BEND.band, 1);
    near(mid.y, 0);
    near(mid.angle, 0);
    near(mid.scale, 1);
    const top = bendPlace(0, 1);
    const bottom = bendPlace(9, 1);
    assert.ok(top.y < 0 && bottom.y > 0);
    assert.ok(top.scale < 1 && bottom.scale < 1);
    assert.ok(top.angle > 10 && bottom.angle < -10, `${top.angle} / ${bottom.angle}`);
    assert.ok(Math.abs(top.angle) < 35);
  });
});
