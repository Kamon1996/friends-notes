/// <reference types="node" />
// Знак зодиака по дню рождения: границы знаков, Новый год, 29 февраля, даты без года и мусор.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ELEMENT_NAME, ZODIAC, zodiacRange, zodiacSign } from '../zodiac';

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
