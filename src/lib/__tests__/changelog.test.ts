/// <reference types="node" />
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { CHANGELOG, compareVersions, unseenReleases, type Release } from '../changelog';

test('сравнение версий', () => {
  assert.ok(compareVersions('1.17.0', '1.16.5') > 0);
  assert.ok(compareVersions('1.9.3', '1.10.0') < 0, 'сравниваем числа, а не строки');
  assert.equal(compareVersions('1.16.0', '1.16'), 0);
  assert.ok(compareVersions('2.0.0', '1.99.99') > 0);
});

const log: Release[] = [
  { version: '1.17.0', date: '2026-11-07', items: ['c'] },
  { version: '1.16.5', date: '2026-11-07', items: ['b'] },
  { version: '1.16.0', date: '2026-11-07', items: ['a'] },
];

test('после обновления показываем только непросмотренные версии', () => {
  assert.deepEqual(unseenReleases('1.17.0', '1.16.0', log).map((r) => r.version), ['1.17.0', '1.16.5']);
  assert.deepEqual(unseenReleases('1.17.0', '1.17.0', log), [], 'уже видел — ничего');
  assert.deepEqual(unseenReleases('1.16.5', '1.16.0', log).map((r) => r.version), ['1.16.5'], 'версии новее установленной не показываем');
  assert.deepEqual(unseenReleases('1.17.0', undefined, log).map((r) => r.version), ['1.17.0'], 'прошлая версия неизвестна — только текущая');
  assert.deepEqual(unseenReleases('1.18.0', '1.17.0', log), [], 'для версии без записи показывать нечего');
});

test('история изменений: новые сверху, версии не повторяются, первая совпадает с app.json', () => {
  for (let i = 1; i < CHANGELOG.length; i++) {
    assert.ok(compareVersions(CHANGELOG[i - 1].version, CHANGELOG[i].version) > 0, `${CHANGELOG[i - 1].version} должна быть новее ${CHANGELOG[i].version}`);
  }
  for (const r of CHANGELOG) {
    assert.match(r.version, /^\d+\.\d+\.\d+$/);
    assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(r.items.length > 0 && r.items.every((t) => t.trim().length > 0), `пустой пункт в ${r.version}`);
  }
  const app = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'app.json'), 'utf8')) as { expo: { version: string } };
  assert.equal(CHANGELOG[0].version, app.expo.version, 'при смене версии в app.json добавь запись в src/lib/changelog.ts');
});
