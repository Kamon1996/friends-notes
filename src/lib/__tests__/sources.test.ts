/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SOURCES, accountsFor, formatDump, otherAccounts } from '../sources';
import { SAMPLE_ACCOUNTS, SAMPLE_DUMPS } from '../sourcesSample';

const byKey = (k: string) => SOURCES.find((s) => s.key === k)!;

test('аккаунты раскладываются по источникам', () => {
  const accounts = [
    ...SAMPLE_ACCOUNTS,
    { accountType: 'vnd.sec.contact.phone', accountName: 'vnd.sec.contact.phone', rawContacts: 5 },
    { accountType: 'com.viber.voip.account', accountName: 'Viber', rawContacts: 3 },
    { accountType: 'com.whatsapp.w4b', accountName: 'WhatsApp Business', rawContacts: 1 },
    { accountType: 'com.vkontakte.account', accountName: 'VK', rawContacts: 1 },
    { accountType: 'com.skype.contacts.sync', accountName: 'Skype', rawContacts: 1 },
  ];
  assert.deepEqual(accountsFor(byKey('phone'), accounts).map((a) => a.accountType), ['', 'vnd.sec.contact.phone']);
  assert.equal(accountsFor(byKey('telegram'), accounts)[0].accountType, 'org.telegram.messenger');
  assert.equal(accountsFor(byKey('whatsapp'), accounts).length, 2);
  assert.equal(accountsFor(byKey('viber'), accounts).length, 1);
  assert.equal(accountsFor(byKey('vk'), accounts).length, 1);
  assert.equal(accountsFor(byKey('instagram'), accounts).length, 0);
  assert.deepEqual(otherAccounts(accounts).map((a) => a.accountType), ['com.skype.contacts.sync']);
});

test('текстовый формат дампа', () => {
  const text = formatDump('Telegram', [SAMPLE_DUMPS['org.telegram.messenger']]);
  assert.match(text, /=== Telegram: 2 сырых контактов ===/);
  assert.match(text, /#1 Аня/);
  assert.match(text, /- vnd\.org\.telegram\.messenger\.android\.profile: data1=123456789/);
  assert.match(text, /raw: _id=5  contact_id=105/);
});
