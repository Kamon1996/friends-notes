/// <reference types="node" />
// «Ниточка» в нижней панели: волна — только между вкладками перехода и от той, с которой ушли.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ROPE_GAP_MS, ropeWaves } from '../tabRope';

const shape = (w: ReturnType<typeof ropeWaves>) =>
  Object.entries(w)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([s, v]) => `${s}:${v.dir > 0 ? '→' : '←'}${v.delay}#${v.id}`);

test('1 → 2 — только первый отрезок, слева направо', () => {
  assert.deepEqual(shape(ropeWaves({}, 0, 1)), ['0:→0#1']);
});

test('3 → 2 — только второй отрезок, справа налево', () => {
  assert.deepEqual(shape(ropeWaves({}, 2, 1)), ['1:←0#1']);
});

test('1 → 3 — сначала 1–2, потом 2–3 с задержкой; 3 → 1 — наоборот, начиная с 2–3', () => {
  assert.deepEqual(shape(ropeWaves({}, 0, 2)), ['0:→0#1', `1:→${ROPE_GAP_MS}#1`]);
  assert.deepEqual(shape(ropeWaves({}, 2, 0)), [`0:←${ROPE_GAP_MS}#1`, '1:←0#1']);
});

test('повторная волна по тому же отрезку — новый id; остальные отрезки не трогаем; на месте — ничего', () => {
  const a = ropeWaves({}, 0, 1);
  const b = ropeWaves(a, 1, 0);
  assert.deepEqual(shape(b), ['0:←0#2']);
  const c = ropeWaves(b, 1, 2);
  assert.deepEqual(shape(c), ['0:←0#2', '1:→0#1']);
  assert.deepEqual(ropeWaves(c, 1, 1), c);
});
