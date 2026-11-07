/// <reference types="node" />
// Контакт Telegram → формат общего импорта: телефон, имя, дата, ники и «О себе».
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { floodWaitSeconds, tgErrorText, tgToRawContact, type TgPerson } from '../telegramImport';

const person = (patch: Partial<TgPerson> = {}): TgPerson => ({
  id: 42,
  firstName: 'Аня',
  lastName: 'Смирнова',
  phoneNumber: '79991234567',
  usernames: [],
  birthdate: null,
  bio: null,
  ...patch,
});

test('телефон получает плюс, имя собирается, без года — без года, id Telegram сохраняется', () => {
  const c = tgToRawContact(person({ birthdate: { day: 3, month: 9, year: 0 } }));
  assert.equal(c.fullName, 'Аня Смирнова');
  assert.deepEqual(c.phones, [{ number: '+79991234567' }]);
  assert.deepEqual(c.birthday, { day: 3, month: 9, year: undefined });
  assert.equal(c.links?.telegramId, 42);
  assert.deepEqual(tgToRawContact(person({ phoneNumber: '' })).phones, []);
  assert.equal(tgToRawContact(person({ lastName: '' })).fullName, 'Аня');
});

test('каждый @username становится ссылкой на Telegram', () => {
  const c = tgToRawContact(person({ usernames: ['anya', 'anya_alt'] }));
  assert.deepEqual(
    c.socials?.map((s) => [s.network, s.handle, s.url]),
    [
      ['telegram', 'anya', 'https://t.me/anya'],
      ['telegram', 'anya_alt', 'https://t.me/anya_alt'],
    ],
  );
});

test('«О себе»: ссылки и ники уходят в соцсети без дублей своего @username, текст — в заметку', () => {
  const c = tgToRawContact(person({ usernames: ['anya'], bio: 'Фотограф. inst: anya.photo, vk.com/anya_s, @anya' }));
  assert.deepEqual(
    c.socials?.map((s) => `${s.network}:${s.handle}`),
    ['telegram:anya', 'instagram:anya.photo', 'vk:anya_s'],
  );
  assert.match(c.note ?? '', /^О себе: Фотограф\./);
});

test('«О себе» без ссылок целиком становится заметкой, пустое — ничего не добавляет', () => {
  assert.equal(tgToRawContact(person({ bio: 'Люблю горы' })).note, 'О себе: Люблю горы');
  assert.equal(tgToRawContact(person({ bio: '' })).note, '');
});

test('после вырезанных ссылок в заметке не остаются висячие разделители', { todo: 'известная ошибка: остаётся «Фотограф. · ·»' }, () => {
  const c = tgToRawContact(person({ bio: 'Фотограф. inst: anya.photo · vk.com/anya_s' }));
  assert.equal(c.note, 'О себе: Фотограф.');
});

test('ожидание от Telegram и понятные тексты ошибок', () => {
  assert.equal(floodWaitSeconds('Too Many Requests: retry after 17'), 17);
  assert.equal(floodWaitSeconds('FLOOD_WAIT_5'), 5);
  assert.equal(floodWaitSeconds('PHONE_CODE_INVALID'), null);
  assert.equal(floodWaitSeconds(undefined), null);
  assert.match(tgErrorText(new Error('PHONE_CODE_INVALID')), /^Неверный код/);
  assert.match(tgErrorText('FLOOD_WAIT_30'), /подождать/);
  assert.equal(tgErrorText('что-то новое'), 'что-то новое', 'неизвестную ошибку показываем как есть');
});
