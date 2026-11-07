/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { composeDate, partsErrors, splitDate } from '../birthday';
import { hasYear } from '../dates';

test('три поля → дата: с годом, без года, пустая, с ошибками', () => {
  assert.equal(composeDate({ day: '15', month: '03', year: '1990' }), '1990-03-15');
  const noYear = composeDate({ day: '15', month: '03', year: '' })!;
  assert.ok(noYear && !hasYear(noYear), 'пустой год — это «год неизвестен»');
  assert.equal(noYear.slice(5), '03-15');
  assert.ok(!hasYear(composeDate({ day: '5', month: '3', year: '19' })!), 'недобранный год тоже неизвестен');
  assert.equal(composeDate({ day: '', month: '', year: '' }), null);
  assert.equal(composeDate({ day: '15', month: '', year: '' }), null);
  assert.equal(composeDate({ day: '31', month: '02', year: '2000' }), null);
  assert.equal(composeDate({ day: '32', month: '01', year: '' }), null);
  assert.equal(composeDate({ day: '01', month: '13', year: '' }), null);
  assert.equal(composeDate({ day: '01', month: '01', year: '3000' }), null);
});

test('подсветка ошибок по полям', () => {
  assert.deepEqual(partsErrors({ day: '32', month: '01', year: '' }), { day: true, month: false, year: false });
  assert.deepEqual(partsErrors({ day: '31', month: '02', year: '' }), { day: true, month: false, year: false });
  assert.deepEqual(partsErrors({ day: '01', month: '01', year: '1899' }), { day: false, month: false, year: true });
  assert.deepEqual(partsErrors({ day: '1', month: '', year: '' }), { day: false, month: false, year: false });
});

test('дата → три поля и обратно', () => {
  assert.deepEqual(splitDate('1990-03-15'), { day: '15', month: '03', year: '1990' });
  assert.deepEqual(splitDate(composeDate({ day: '7', month: '1', year: '' })), { day: '07', month: '01', year: '' });
  assert.deepEqual(splitDate(null), { day: '', month: '', year: '' });
});
