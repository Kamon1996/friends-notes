import { plural } from '../dates';
import { PHRASES } from './phrases';
import type { Phrase } from './types';

/**
 * Голос ИИ: что она говорит в каждой ситуации. Характер — Рейчел из сериала, которая помогает в приложении;
 * имени в интерфейсе нет. Фразы — в phrases.ts (генерируются из разбора), здесь только выбор и подстановки:
 *  - на каждую ситуацию несколько фраз, выбираем случайно и не повторяем, пока набор не кончится;
 *  - фразы про кофе звучат втрое реже и не больше одной за поток (newFlow);
 *  - числа подставляются с правильными окончаниями: «1 друг», «3 друга», «12 друзей».
 */

export type Vars = { n?: number; k?: number; name?: string };

/** Размер компании для первой фразы. */
export function startBucket(n: number): string {
  if (n <= 1) return 'one';
  if (n <= 10) return 'few';
  if (n <= 60) return 'some';
  if (n <= 200) return 'many';
  return 'huge';
}

/** Итог «всё определилось». */
export function doneBucket(n: number): string {
  if (n <= 1) return 'one';
  if (n <= 200) return 'some';
  return 'huge';
}

/** Сколько загадок осталось: одна, 2–4, 5 и больше, или больше половины. */
export function leftBucket(k: number, total: number): string {
  if (k >= 3 && k * 2 > total) return 'most';
  if (k === 1) return 'one';
  if (k <= 4) return 'few';
  return 'many';
}

const INSTR: Record<number, string> = { 2: 'двумя', 3: 'тремя', 4: 'четырьмя' };
const COLLECTIVE: Record<number, string> = { 2: 'Двое', 3: 'Трое', 4: 'Четверо' };

/** Подставить числа и имя в шаблон фразы. */
export function fill(text: string, v: Vars = {}): string {
  const n = v.n ?? 0;
  const k = v.k ?? 0;
  return text
    .replace(/\{n\}/g, String(n))
    .replace(/\{k\}/g, String(k))
    .replace(/\{друг\}/g, plural(n, 'друг', 'друга', 'друзей'))
    .replace(/\{человек\}/g, plural(k, 'человек', 'человека', 'человек'))
    .replace(/\{загадка\}/g, plural(k, 'загадка', 'загадки', 'загадок'))
    .replace(/\{новым другом\}/g, plural(k, 'новым другом', 'новыми друзьями', 'новыми друзьями'))
    .replace(/\{идея\}/g, plural(k, 'идею', 'идеи', 'идей'))
    .replace(/\{k_instr\}/g, INSTR[k] ?? String(k))
    .replace(/\{K_coll\}/g, COLLECTIVE[k] ?? String(k))
    .replace(/\{name\}/g, v.name ?? '');
}

/** Во сколько раз реже звучат фразы про кофе. */
export const COFFEE_WEIGHT = 1 / 3;

export function createVoice(opts: { random?: () => number; phrases?: Record<string, Phrase[]> } = {}) {
  const random = opts.random ?? Math.random;
  const book = opts.phrases ?? PHRASES;
  const bags = new Map<string, number[]>();
  const last = new Map<string, number>();
  let coffeeUsed = false;

  function pool(sit: string, bucket?: string): number[] {
    const all = book[sit] ?? [];
    const exact = bucket === undefined ? [] : all.map((_, i) => i).filter((i) => all[i].bucket === bucket);
    return exact.length ? exact : all.map((_, i) => i).filter((i) => !all[i].bucket);
  }

  function pick(sit: string, bucket?: string): Phrase | null {
    const all = book[sit] ?? [];
    const ids = pool(sit, bucket);
    if (!ids.length) return null;
    const key = `${sit}|${bucket ?? ''}`;
    let bag = (bags.get(key) ?? []).filter((i) => ids.includes(i));
    let avoid: number | undefined;
    if (!bag.length) {
      bag = ids.slice();
      // новый круг не начинается с той же фразы, что закончила прошлый
      if (bag.length > 1) avoid = last.get(key);
    }
    let weights = bag.map((i) => (i === avoid ? 0 : all[i].coffee ? (coffeeUsed ? 0 : COFFEE_WEIGHT) : 1));
    if (!weights.some((w) => w > 0)) weights = bag.map((i) => (i === avoid ? 0 : 1));
    if (!weights.some((w) => w > 0)) weights = bag.map(() => 1);
    const total = weights.reduce((a, b) => a + b, 0);
    let r = random() * total;
    let at = 0;
    for (; at < bag.length - 1; at++) {
      r -= weights[at];
      if (r < 0 && weights[at] > 0) break;
    }
    while (weights[at] === 0 && at > 0) at--;
    const chosen = bag[at];
    bags.set(key, bag.filter((_, j) => j !== at));
    last.set(key, chosen);
    if (all[chosen].coffee) coffeeUsed = true;
    return all[chosen];
  }

  return {
    /** Фраза для ситуации (с подставленными числами) или null, если сказать нечего. */
    say(sit: string, vars: Vars = {}, bucket?: string): string | null {
      const p = pick(sit, bucket);
      return p ? fill(p.text, vars) : null;
    },
    /** Новый поток (запуск задачи): снова можно одну фразу про кофе. */
    newFlow() {
      coffeeUsed = false;
    },
  };
}

/** Общий голос приложения. */
export const voice = createVoice();

// ---------- почему по имени не понять ----------

const FAMILIES: [string, string[]][] = [
  ['alex', ['саша', 'сашка', 'сашенька', 'сашуля', 'саня', 'шура', 'шурочка']],
  ['evg', ['женя', 'женька', 'женечка']],
  ['val', ['валя', 'валька', 'валюша']],
  ['slava', ['слава']],
  ['stas', ['стася']],
  ['nika', ['ника']],
  ['kris', ['крис']],
  ['surname', ['ким', 'ли', 'джин', 'алекс']],
];
/**
 * Подписи-профессии, которые по привычке считают «мужскими»: для них — шутка про сексизм. Остальные профессии и роли
 * получают обычную подсказку.
 */
const ROLES = new Set(['сантехник', 'сосед', 'мастер', 'курьер', 'таксист', 'водитель', 'электрик', 'механик', 'слесарь', 'грузчик', 'охранник']);

const words = (name: string) => name.toLowerCase().replace(/ё/g, 'е').split(/[^\p{L}]+/u).filter(Boolean);
const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/** Подсказка на карточке загадки: почему по этому имени не понять. */
export function riddleHint(name: string, v = voice): string {
  const ws = words(name);
  const role = ws.find((w) => ROLES.has(w));
  if (role) {
    const said = v.say('gender.why', { name: cap(role) }, 'role');
    if (said) return said;
  }
  for (const [family, names] of FAMILIES) {
    if (ws.some((w) => names.includes(w))) {
      const said = v.say('gender.why', {}, family);
      if (said) return said;
    }
  }
  return v.say('gender.why', {}, 'other') ?? 'По имени не угадать';
}
