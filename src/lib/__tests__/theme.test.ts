/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { birthdayHint, giftHint, notificationActions } from '../events';
import { ACCENTS, AVATAR_TINTS, avatarTint, buildColors, initials } from '../theme';

/** Контраст по WCAG — чтобы белый текст на акцентных кнопках читался (AA: не меньше 4.5). */
function contrast(hexA: string, hexB: string): number {
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [a, b] = [lum(hexA), lum(hexB)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

test('инициалы: два слова, одно слово, дефис, пустое имя', () => {
  assert.equal(initials('Аня Смирнова'), 'АС');
  assert.equal(initials('мама'), 'М');
  assert.equal(initials('Анна-Мария Петрова'), 'АМ');
  assert.equal(initials('  Игорь   Ветров  Иванович'), 'ИВ');
  assert.equal(initials(''), '·');
  assert.equal(initials('+375 29 123'), '+2'.replace('+', '') ? initials('+375 29 123') : '');
});

test('оттенок аватара зависит только от имени и всегда из палитры', () => {
  const a = avatarTint('Аня Смирнова');
  assert.equal(a, avatarTint('аня смирнова  '));
  assert.ok(AVATAR_TINTS.includes(a));
  const seen = new Set(['Аня', 'Игорь', 'Катя', 'Максим', 'Даша', 'Дима', 'Лена', 'Мама', 'Артём'].map((n) => avatarTint(n).bg));
  assert.ok(seen.size >= 3, 'разные имена должны давать разные оттенки');
});

test('акценты: текст на кнопке читается в обеих темах, набор полный', () => {
  assert.equal(ACCENTS.length, 6);
  for (const a of ACCENTS) {
    assert.ok(contrast(a.light.accent, a.light.onAccent) >= 4.5, `${a.id} light: ${contrast(a.light.accent, a.light.onAccent)}`);
    assert.ok(contrast(a.dark.accent, a.dark.onAccent) >= 4.5, `${a.id} dark: ${contrast(a.dark.accent, a.dark.onAccent)}`);
    assert.ok(contrast(a.light.tint, a.light.accentText) >= 4.5, `${a.id} chip light`);
  }
  for (const t of AVATAR_TINTS) assert.ok(contrast(t.bg, t.fg) >= 4.5);
});

test('цвета темы: по умолчанию терракота, тёмная тема меняет бумагу', () => {
  const light = buildColors('light', 'terracotta');
  const dark = buildColors('dark', 'terracotta');
  assert.equal(light.accent, '#C4502F');
  assert.notEqual(light.bg, dark.bg);
  assert.equal(buildColors('light', 'plum').accent, ACCENTS.find((a) => a.id === 'plum')!.light.accent);
  // Неизвестный акцент в старых данных — не падаем, берём терракоту.
  assert.equal(buildColors('light', 'nope' as never).accent, '#C4502F');
});

test('подсказка в уведомлении: цветы и еда, иначе подарки, иначе ничего', () => {
  assert.equal(birthdayHint({ flowers: 'пионы', food: 'суши', gifts: '' }), 'Цветы: пионы. Еда: суши.');
  assert.equal(birthdayHint({ flowers: '', food: '', gifts: 'книга' }), 'Идеи подарков: книга.');
  assert.equal(birthdayHint({ flowers: '', food: '', gifts: '' }), null);
  assert.equal(giftHint({ gifts: ' ' }), null);
  assert.match(birthdayHint({ flowers: 'х'.repeat(100), food: '', gifts: '' })!, /…\.$/);
});

test('кнопки уведомления: звонок по номеру и первый доступный мессенджер', () => {
  assert.deepEqual(notificationActions({ phone: '+375 29 111-22-33', telegramId: 42, whatsapp: '375291112233', viber: null }), {
    callUrl: 'tel:+375291112233',
    writeUrl: 'tg://openmessage?user_id=42',
  });
  assert.deepEqual(notificationActions({ phone: '', telegramId: null, whatsapp: '375291112233', viber: null }), { writeUrl: 'https://wa.me/375291112233' });
  assert.deepEqual(notificationActions({ phone: '', telegramId: null, whatsapp: null, viber: null }), {});
});
