/// <reference types="node" />
// Знак зодиака по дню рождения: границы знаков, Новый год, 29 февраля, даты без года и мусор.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ACCENTS } from '../theme';
import { ELEMENT_ACCENT, ELEMENT_NAME, ZODIAC, zodiacColors, zodiacRange, zodiacSign } from '../zodiac';

const name = (d: string | null) => zodiacSign(d)?.name ?? null;

test('каждый знак: первый и последний день — его, соседние — нет', () => {
  for (const [i, s] of ZODIAC.entries()) {
    const p = (m: number, d: number) => `1990-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    assert.equal(name(p(...s.from)), s.name, `${s.name} с ${s.from}`);
    assert.equal(name(p(...s.to)), s.name, `${s.name} по ${s.to}`);
    const next = ZODIAC[(i + 1) % ZODIAC.length];
    assert.equal(name(p(...next.from)), next.name);
  }
});

test('известные даты', () => {
  assert.equal(name('1995-11-07'), 'Скорпион');
  assert.equal(name('1995-01-24'), 'Водолей');
  assert.equal(name('1997-01-13'), 'Козерог');
  assert.equal(name('1990-12-31'), 'Козерог', 'Козерог переходит через Новый год');
  assert.equal(name('1990-01-01'), 'Козерог');
  assert.equal(name('2000-02-29'), 'Рыбы', '29 февраля');
  assert.equal(name('1990-06-20'), 'Близнецы');
  assert.equal(name('1990-06-21'), 'Рак');
});

test('без года тоже знак: он зависит только от числа и месяца', () => {
  assert.equal(name('1904-03-21'), 'Овен');
  assert.equal(name('--03-21'), 'Овен');
});

test('каждый день года — ровно один знак, все 12 встречаются', () => {
  const seen = new Map<string, number>();
  for (let t = Date.UTC(2024, 0, 1); t < Date.UTC(2025, 0, 1); t += 86_400_000) {
    const s = zodiacSign(new Date(t).toISOString().slice(0, 10));
    assert.ok(s, new Date(t).toISOString());
    seen.set(s.id, (seen.get(s.id) ?? 0) + 1);
  }
  assert.equal(seen.size, 12);
  assert.equal([...seen.values()].reduce((a, b) => a + b, 0), 366);
  for (const days of seen.values()) assert.ok(days >= 29 && days <= 32, String(days));
});

test('нет даты или мусор — нет знака', () => {
  for (const bad of [null, undefined, '', 'вчера', '1990-13-01', '1990-00-10', '1990-05-32']) assert.equal(zodiacSign(bad as string | null), null, String(bad));
});

test('подписи: диапазон дат и стихия', () => {
  assert.equal(zodiacRange(zodiacSign('1995-01-24')!), '20 янв — 18 фев');
  assert.equal(zodiacRange(zodiacSign('1990-12-31')!), '22 дек — 19 янв');
  assert.equal(ELEMENT_NAME[zodiacSign('1995-11-07')!.element], 'вода');
  assert.deepEqual(
    ['fire', 'earth', 'air', 'water'].map((e) => ZODIAC.filter((s) => s.element === e).length),
    [3, 3, 3, 3],
  );
});

test('цвет стихии — акцент приложения: огонь терракота, земля эвкалипт, воздух мёд, вода индиго', () => {
  assert.deepEqual(ELEMENT_ACCENT, { fire: 'terracotta', earth: 'eucalyptus', air: 'honey', water: 'indigo' });
  for (const scheme of ['light', 'dark'] as const) {
    const fire = ACCENTS.find((a) => a.id === 'terracotta')![scheme];
    assert.deepEqual(zodiacColors('fire', scheme), { icon: fire.accent, text: fire.accentText, bg: fire.soft });
  }
  assert.notDeepEqual(zodiacColors('water', 'light'), zodiacColors('water', 'dark'), 'у тёмной темы свои оттенки');
});

test('текст чипа читается на его фоне: контраст не ниже 4.5 в обеих темах', () => {
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  for (const el of ['fire', 'earth', 'air', 'water'] as const) {
    for (const scheme of ['light', 'dark'] as const) {
      const c = zodiacColors(el, scheme);
      assert.ok(contrast(c.text, c.bg) >= 4.5, `${el}/${scheme}: ${contrast(c.text, c.bg).toFixed(2)}`);
    }
  }
});

