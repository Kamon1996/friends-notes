/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEVELOPER_TELEGRAM, buildReportText, telegramReportUrl } from '../bugReport';

test('шапка сообщения разработчику: версия, система, телефон, сбой', () => {
  const text = buildReportText({ version: '1.19.0', os: 'Android', osVersion: '15', device: 'samsung SM-S911B', crashId: 'abc123' });
  assert.equal(text, '🐞 Друзья 1.19.0 · Android 15 · samsung SM-S911B\nПоследний сбой: abc123\nЧто случилось: ');
  const noCrash = buildReportText({ version: '1.19.0', os: 'iOS', osVersion: '18.1', device: 'iPhone' });
  assert.equal(noCrash, '🐞 Друзья 1.19.0 · iOS 18.1 · iPhone\nЧто случилось: ');
  assert.equal(buildReportText({ version: '1.19.0', os: 'Web', osVersion: '', device: 'браузер' }), '🐞 Друзья 1.19.0 · Web · браузер\nЧто случилось: ');
});

test('ссылка открывает чат с разработчиком с подставленным текстом', () => {
  const url = telegramReportUrl(DEVELOPER_TELEGRAM, '🐞 Друзья 1.19.0\nЧто случилось: ');
  assert.ok(url.startsWith(`https://t.me/${DEVELOPER_TELEGRAM}?text=`));
  assert.equal(decodeURIComponent(url.split('?text=')[1]), '🐞 Друзья 1.19.0\nЧто случилось: ');
  assert.ok(!/[\s\n]/.test(url), 'в ссылке не должно быть пробелов и переносов');
});
