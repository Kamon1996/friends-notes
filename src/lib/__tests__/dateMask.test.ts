/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatRuDate, maskDate, maskTime, parseRuDate, parseTimeText } from '../dateMask';

test('маска даты подставляет точки', () => {
  assert.equal(maskDate('1'), '1');
  assert.equal(maskDate('12'), '12');
  assert.equal(maskDate('123'), '12.3');
  assert.equal(maskDate('31122026'), '31.12.2026');
  assert.equal(maskDate('31.12.20261'), '31.12.2026');
  assert.equal(maskDate('3112', false), '31.12');
  assert.equal(maskDate('311220', false), '31.12');
});

test('разбор даты', () => {
  assert.equal(parseRuDate('31.12.2026'), '2026-12-31');
  assert.equal(parseRuDate('29.02.2024'), '2024-02-29');
  assert.equal(parseRuDate('29.02.2026'), null);
  assert.equal(parseRuDate('31.04.2026'), null);
  assert.equal(parseRuDate('00.01.2026'), null);
  assert.equal(parseRuDate('01.13.2026'), null);
  assert.equal(parseRuDate('01.01.20'), null);
  assert.equal(parseRuDate('29.02', false), '1904-02-29');
  assert.equal(formatRuDate('2026-12-31'), '31.12.2026');
  assert.equal(formatRuDate('1904-02-29', false), '29.02');
  assert.equal(formatRuDate(null), '');
});

test('маска и разбор времени', () => {
  assert.equal(maskTime('1830'), '18:30');
  assert.equal(maskTime('18:3'), '18:3');
  assert.equal(maskTime('183099'), '18:30');
  assert.equal(parseTimeText('18:30'), '18:30');
  assert.equal(parseTimeText('9:05'), '09:05');
  assert.equal(parseTimeText('24:00'), null);
  assert.equal(parseTimeText('12:60'), null);
  assert.equal(parseTimeText('12:3'), null);
});
