/// <reference types="node" />
// Какие ссылки сначала отдаются приложению соцсети и каким пакетам; совпадение списка с манифестом.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { ANDROID_APPS, appTarget } from '../appLinks';
import { networkById } from '../socials';

test('профили популярных сетей и WhatsApp открываются в своих приложениях', () => {
  assert.deepEqual(appTarget('https://t.me/anya_smi'), ['org.telegram.messenger', 'org.telegram.messenger.web', 'org.thunderdog.challegram']);
  assert.deepEqual(appTarget('https://www.instagram.com/anya.smirnova'), ['com.instagram.android']);
  assert.deepEqual(appTarget('https://www.tiktok.com/@anya'), ['com.zhiliaoapp.musically', 'com.ss.android.ugc.trill']);
  assert.deepEqual(appTarget('https://youtube.com/@anyasings'), ['com.google.android.youtube']);
  assert.deepEqual(appTarget('https://m.vk.com/anya_s'), ['com.vkontakte.android']);
  assert.deepEqual(appTarget('https://twitter.com/anya'), ['com.twitter.android']);
  assert.deepEqual(appTarget('https://www.threads.net/@anya'), ['com.instagram.barcelona']);
  assert.deepEqual(appTarget('https://wa.me/79991234567'), ['com.whatsapp', 'com.whatsapp.w4b']);
});

test('сеть без известного приложения — любое не-браузерное приложение; личный сайт и не веб-адреса — как обычно', () => {
  assert.deepEqual(appTarget('https://habr.com/ru/users/anya'), []);
  assert.equal(appTarget('https://anya.design'), null);
  for (const url of ['tel:+79991234567', 'tg://openmessage?user_id=1', 'viber://chat?number=%2B7999', 'intent://x#Intent;end', 'javascript:alert(1)']) {
    assert.equal(appTarget(url), null, url);
  }
});

test('каждый ключ — сеть из каталога, пакеты не повторяются', () => {
  for (const id of Object.keys(ANDROID_APPS)) assert.ok(networkById(id).id === id, `нет сети ${id}`);
  const all = Object.values(ANDROID_APPS).flat();
  assert.equal(new Set(all).size, all.length);
});

test('все пакеты объявлены в <queries> манифеста — иначе Android 11+ их не увидит', () => {
  const manifest = readFileSync('modules/open-in-app/android/src/main/AndroidManifest.xml', 'utf8');
  const declared = new Set([...manifest.matchAll(/<package android:name="([^"]+)"/g)].map((m) => m[1]));
  const used = new Set([...Object.values(ANDROID_APPS).flat(), ...(appTarget('https://wa.me/1') ?? [])]);
  assert.deepEqual([...used].filter((p) => !declared.has(p)), [], 'пакеты без <queries>');
  assert.deepEqual([...declared].filter((p) => !used.has(p)), [], 'лишние пакеты в <queries>');
});
