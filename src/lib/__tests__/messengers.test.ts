/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { toCandidates, candidateToFriend } from '../contactsImport';
import { applyEnrichment } from '../enrich';
import { MIME, buildPhoneIndex, isServiceNumber, phoneKey, telegramUrl, viberUrl, whatsappUrl } from '../messengers';
import type { Friend } from '../types';

const row = (contactId: string, mimetype: string, data1: string, extra: Partial<{ data4: string; accountName: string; sync1: string }> = {}) => ({
  contactId,
  mimetype,
  data1,
  data4: extra.data4 ?? '',
  accountName: extra.accountName ?? '',
  sync1: extra.sync1 ?? '',
});

test('служебные номера', () => {
  assert.equal(isServiceNumber('*100#'), true);
  assert.equal(isServiceNumber('101'), true);
  assert.equal(isServiceNumber('2222'), true);
  assert.equal(isServiceNumber('*114*210#'), true);
  assert.equal(isServiceNumber('+375 29 111-22-33'), false);
  assert.equal(isServiceNumber('80291112233'), false);
});

test('индекс мессенджеров: Telegram, себя, WhatsApp, Viber, нормализованные номера', () => {
  const idx = buildPhoneIndex([
    row('10', MIME.phone, '80 29 111-22-33', { data4: '+375291112233' }),
    row('10', MIME.telegram, '555', { accountName: '999', sync1: '375291112233' }),
    row('10', MIME.whatsapp, '375291112233@s.whatsapp.net'),
    row('20', MIME.viberMessage, '+375447778899'),
    row('20', MIME.phone, '*100#'),
    row('30', MIME.telegram, '999', { accountName: '999', sync1: '375250000000' }), // это сам владелец
    row('40', MIME.telegram, '777', { accountName: '999' }), // номер скрыт
  ]);
  assert.deepEqual(idx.phonesByContact.get('10'), ['+375291112233']);
  assert.equal(idx.phonesByContact.has('20'), false); // служебный номер не считается
  assert.deepEqual(idx.byContact.get('10'), { telegramId: 555, whatsapp: '375291112233' });
  assert.deepEqual(idx.byContact.get('20'), { viber: '375447778899' });
  assert.deepEqual(idx.byContact.get('40'), { telegramId: 777 });
  assert.ok(idx.selfContactIds.has('30'));
  assert.equal(idx.byContact.has('30'), false);
  assert.deepEqual(idx.byPhone.get('291112233'), { telegramId: 555, whatsapp: '375291112233' });
});

test('ссылки на чаты', () => {
  assert.equal(telegramUrl(555), 'tg://openmessage?user_id=555');
  assert.equal(telegramUrl(555, 'ios'), 'tg://user?id=555');
  assert.equal(whatsappUrl('375291112233'), 'https://wa.me/375291112233');
  assert.equal(viberUrl('+375 44 777-88-99'), 'viber://chat?number=%2B375447778899');
});

test('импорт: себя и служебные номера пропускаем, копии по номеру склеиваем', () => {
  const list = toCandidates(
    [
      { id: '1', fullName: 'Баланс', phones: [{ number: '*100#' }] },
      { id: '2', fullName: 'Я сам', phones: [{ number: '+375250000000' }], isSelf: true },
      { id: '3', fullName: '+375291112233', phones: [{ number: '+375291112233' }], links: { whatsapp: '375291112233' } },
      { id: '4', fullName: 'Олег', phones: [{ number: '80 29 111-22-33' }], normalizedPhones: ['+375291112233'], links: { telegramId: 555 }, photoUri: 'content://photo/4', thumbUri: 'content://thumb/4' },
      { id: '5', fullName: 'Без номера', links: { telegramId: 777 } },
    ],
    [],
  );
  assert.deepEqual(list.map((c) => c.name), ['Без номера', 'Олег']);
  const oleg = list[1];
  assert.equal(oleg.phone, '+375291112233'); // нормализованный номер в приоритете
  assert.deepEqual(oleg.links, { telegramId: 555, whatsapp: '375291112233' });
  assert.equal(oleg.photoUri, 'content://photo/4');
  assert.equal(oleg.thumbUri, 'content://thumb/4');
  const f = candidateToFriend(oleg, 'f1', () => 'd');
  assert.equal(f.telegramId, 555);
  assert.equal(f.whatsapp, '375291112233');
  assert.equal(f.viber, null);
  assert.equal(f.thumbUri, 'content://thumb/4');
});

test('автоподтягивание для уже добавленных друзей', () => {
  const base: Friend = { id: 'a', name: 'Олег', emoji: '🙂', birthday: null, phone: '8 029 111 22 33', food: '', flowers: '', gifts: '', notes: '', dates: [], createdAt: 0 };
  const map = new Map([[phoneKey('+375291112233'), { links: { telegramId: 555, viber: '375291112233' }, photoUri: 'content://p' }]]);
  const { friends, changed } = applyEnrichment([base, { ...base, id: 'b', phone: '' }], map);
  assert.equal(changed, 1);
  assert.equal(friends[0].telegramId, 555);
  assert.equal(friends[0].viber, '375291112233');
  assert.equal(friends[0].photoUri, 'content://p');
  assert.equal(friends[0].thumbUri, 'content://p'); // миниатюры нет — берём то же фото
  // уже заполненное не трогаем, повторный запуск ничего не меняет
  assert.equal(applyEnrichment(friends, map).changed, 0);
});

