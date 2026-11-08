/// <reference types="node" />
// Ход колеса ИИ-задач: плавно, без рывков, остановка там, откуда начали, ожидание ответа на полной скорости;
// ответ проявляется, когда строка проезжает рамку.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { WHEEL, revealAt, wheelAt as wheelAtFull, wheelEnd as wheelEndFull } from '../wheel';

const wheelAt = (t: number, doneAt: number, rows: number) => wheelAtFull(t, doneAt, rows, WHEEL.spin, WHEEL.delay, WHEEL.maxCruise);
const wheelEnd = (doneAt: number, rows: number) => wheelEndFull(doneAt, rows, WHEEL.spin, WHEEL.delay, WHEEL.maxCruise);

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);
const half = WHEEL.spin / 2;
const tA = WHEEL.delay + half;

describe('ход колеса', () => {
  const rows = 100;
  test('до старта стоит на первом', () => {
    assert.equal(wheelAt(0, 0, rows), 0);
    assert.equal(wheelAt(WHEEL.delay, 0, rows), 0);
  });
  test('ответ готов сразу — полный оборот за spin и остановка на первом друге', () => {
    near(wheelAt(tA, 0, rows), rows / 2);
    near(wheelAt(wheelEnd(0, rows), 0, rows), rows);
    near(wheelAt(wheelEnd(0, rows) + 5, 0, rows), rows);
    near(wheelEnd(0, rows), WHEEL.delay + WHEEL.spin);
  });
  test('вся анимация — около 3,5 секунды', () => {
    const total = wheelEnd(0, rows);
    assert.ok(total >= 3.4 && total <= 4, `${total} с`);
  });
  test('медленно → очень быстро → медленно', () => {
    const speed = (t: number) => (wheelAt(t + 0.01, 0, rows) - wheelAt(t, 0, rows)) / 0.01;
    const start = speed(WHEEL.delay + 0.1);
    const mid = speed(tA);
    const end = speed(wheelEnd(0, rows) - 0.1);
    assert.ok(mid > start * 20, `середина ${mid} против старта ${start}`);
    assert.ok(mid > end * 20, `середина ${mid} против конца ${end}`);
  });
  test('без рывков: позиция непрерывна и только растёт', () => {
    for (const doneAt of [0, tA + 0.5, tA + 7, Infinity]) {
      let prev = 0;
      const end = wheelEnd(doneAt, rows);
      for (let t = 0; t <= end + 0.5; t += 0.004) {
        const s = wheelAt(t, doneAt, rows);
        assert.ok(s >= prev - 1e-9, `назад при t=${t}, doneAt=${doneAt}`);
        assert.ok(s - prev < 1, `скачок ${s - prev} при t=${t}, doneAt=${doneAt}`);
        prev = s;
      }
    }
  });
  test('скорость на стыке разгона и торможения одна и та же', () => {
    const before = (wheelAt(tA, 0, rows) - wheelAt(tA - 0.001, 0, rows)) / 0.001;
    const after = (wheelAt(tA + 0.001, 0, rows) - wheelAt(tA, 0, rows)) / 0.001;
    assert.ok(Math.abs(before - after) / before < 0.01, `${before} против ${after}`);
  });
  test('ответа ещё нет — крутится на полной скорости, потом тормозит и встаёт на первом', () => {
    const doneAt = tA + 2.3;
    const v = (3 * (rows / 2)) / half;
    near(wheelAt(tA + 1, doneAt, rows), rows / 2 + v);
    const end = wheelEnd(doneAt, rows);
    assert.ok(end > doneAt + half - 1e-9);
    const final = wheelAt(end, doneAt, rows);
    near(final % rows, 0);
    assert.ok(final > rows);
  });
  test('ответ пришёл во время кружения — путь до этого момента не меняется', () => {
    for (let t = tA; t < tA + 6; t += 0.37) {
      near(wheelAt(t, Infinity, rows), wheelAt(t, t, rows));
    }
  });
  test('ответа так и нет — после maxCruise всё равно останавливается', () => {
    const end = wheelEnd(Infinity, rows);
    assert.ok(Number.isFinite(end));
    assert.ok(end <= tA + WHEEL.maxCruise + 2 * half + 1);
    near(wheelAt(end, Infinity, rows) % rows, 0);
  });
  test('мало строк — тот же ритм', () => {
    near(wheelAt(wheelEnd(0, 30), 0, 30), 30);
    near(wheelEnd(0, 30), wheelEnd(0, 100));
  });
});

describe('проявление ответа', () => {
  test('ответ был до старта — проявляется на первом проезде', () => {
    assert.equal(revealAt(0, 100, 0), 0);
    assert.equal(revealAt(37, 100, 0), 37);
  });
  test('ответ пришёл, когда строка ещё не доехала, — на этом же проезде', () => assert.equal(revealAt(37, 100, 20.5), 37));
  test('ответ пришёл, когда строка уже проехала, — на следующем круге', () => {
    assert.equal(revealAt(37, 100, 37.2), 137);
    assert.equal(revealAt(37, 100, 160), 237);
  });
});
