/// <reference types="node" />
// Кнопки «Поздравить» и «Написать» в подробностях дня: куда писать — и что кнопки нет, если некуда.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { messageChannel } from '../messageChannel';

test('Telegram — первым: по id из импорта, иначе по нику', () => {
  assert.equal(messageChannel({ telegramId: 42, whatsapp: '+7 900 000-00-00' })?.app, 'Telegram');
  assert.equal(messageChannel({ socials: [{ id: '1', network: 'telegram', url: '', handle: 'anya' }] })?.url, 'https://t.me/anya');
});

test('без Telegram — WhatsApp, Viber, потом соцсети с личными сообщениями', () => {
  assert.deepEqual(messageChannel({ whatsapp: '+7 (900) 111-22-33' }), { key: 'wa', app: 'WhatsApp', url: 'https://wa.me/79001112233', icon: 'bubble' });
  assert.equal(messageChannel({ viber: '+79001112233' })?.app, 'Viber');
  const socials = [
    { id: '1', network: 'youtube', url: 'https://youtube.com/@a' },
    { id: '2', network: 'instagram', url: 'https://instagram.com/a' },
    { id: '3', network: 'vk', url: 'https://vk.com/a' },
  ];
  assert.equal(messageChannel({ socials })?.app, 'VK');
});

test('некуда написать (только телефон для звонка или YouTube) — кнопки нет', () => {
  assert.equal(messageChannel({}), null);
  assert.equal(messageChannel({ socials: [{ id: '1', network: 'youtube', url: 'https://youtube.com/@a' }] }), null);
});
