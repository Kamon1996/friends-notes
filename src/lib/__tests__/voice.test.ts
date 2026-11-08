/// <reference types="node" />
// Голос ИИ: правильные окончания, фраза по размеру компании, без повторов, кофе реже и не больше одного за поток.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { COFFEE_WEIGHT, createVoice, doneBucket, fill, leftBucket, riddleHint, startBucket } from '../voice';
import { PHRASES } from '../voice/phrases';
import type { Phrase } from '../voice/types';

/** Детерминированный «случай» для тестов. */
function seeded(seed = 1) {
  let s = (seed * 2654435761) % 2147483647 || 1;
  const next = () => {
    s = (s * 48271) % 2147483647;
    return (s - 1) / 2147483646;
  };
  next();
  next();
  return next;
}

describe('подстановки', () => {
  test('друзья с правильными окончаниями', () => {
    assert.equal(fill('{n} {друг}', { n: 1 }), '1 друг');
    assert.equal(fill('{n} {друг}', { n: 3 }), '3 друга');
    assert.equal(fill('{n} {друг}', { n: 12 }), '12 друзей');
    assert.equal(fill('{n} {друг}', { n: 124 }), '124 друга');
    assert.equal(fill('{n} {друг}', { n: 311 }), '311 друзей');
  });
  test('загадки, люди, новые друзья, идеи', () => {
    assert.equal(fill('{k} {загадка}', { k: 1 }), '1 загадка');
    assert.equal(fill('{k} {загадка}', { k: 3 }), '3 загадки');
    assert.equal(fill('{k} {загадка}', { k: 7 }), '7 загадок');
    assert.equal(fill('Но {k} {человек} меня запутали', { k: 3 }), 'Но 3 человека меня запутали');
    assert.equal(fill('Но {k} {человек} меня запутали', { k: 7 }), 'Но 7 человек меня запутали');
    assert.equal(fill('с {k} {новым другом}', { k: 1 }), 'с 1 новым другом');
    assert.equal(fill('с {k} {новым другом}', { k: 5 }), 'с 5 новыми друзьями');
    assert.equal(fill('Нашла {k} {идея}', { k: 2 }), 'Нашла 2 идеи');
  });
  test('«С тремя», «Трое» — для 2–4', () => {
    assert.equal(fill('С {k_instr} засомневалась', { k: 2 }), 'С двумя засомневалась');
    assert.equal(fill('{K_coll} не дались', { k: 4 }), 'Четверо не дались');
  });
  test('имя', () => assert.equal(fill('{name}? Хм', { name: 'Сантехник' }), 'Сантехник? Хм'));
});

describe('размер компании', () => {
  test('старт', () => {
    assert.deepEqual([1, 2, 10, 11, 60, 61, 200, 201].map(startBucket), ['one', 'few', 'few', 'some', 'some', 'many', 'many', 'huge']);
  });
  test('итог', () => assert.deepEqual([1, 34, 200, 312].map(doneBucket), ['one', 'some', 'some', 'huge']));
  test('загадки', () => {
    assert.equal(leftBucket(1, 100), 'one');
    assert.equal(leftBucket(3, 100), 'few');
    assert.equal(leftBucket(7, 100), 'many');
    assert.equal(leftBucket(6, 10), 'most');
    assert.equal(leftBucket(2, 3), 'few', 'двое из трёх — ещё не «сплошные прозвища»');
  });
});

describe('выбор фразы', () => {
  const book: Record<string, Phrase[]> = {
    s: [{ text: 'a' }, { text: 'b' }, { text: 'c' }, { text: 'кофе', coffee: true }],
    b: [{ text: 'один', bucket: 'one' }, { text: 'много', bucket: 'many' }, { text: 'всем' }],
  };
  test('не повторяется, пока набор не кончится', () => {
    const v = createVoice({ random: seeded(7), phrases: { s: book.s.slice(0, 3) } });
    const first = [v.say('s'), v.say('s'), v.say('s')];
    assert.equal(new Set(first).size, 3);
    const next = v.say('s');
    assert.notEqual(next, first[2], 'новый круг не начинается с последней фразы');
  });
  test('по размеру: своя группа, иначе общие', () => {
    const v = createVoice({ random: seeded(3), phrases: book });
    assert.equal(v.say('b', {}, 'one'), 'один');
    assert.equal(v.say('b', {}, 'huge'), 'всем');
  });
  test('нечего сказать — null', () => assert.equal(createVoice({ phrases: book }).say('нет'), null));
  test('кофе — не больше одного за поток', () => {
    for (let seed = 1; seed < 60; seed++) {
      const v = createVoice({ random: seeded(seed), phrases: { s: book.s, t: [{ text: 'ещё кофе', coffee: true }, { text: 'чай' }] } });
      const said = [v.say('s'), v.say('s'), v.say('s'), v.say('s'), v.say('t')];
      assert.ok(said.filter((x) => x && x.includes('кофе')).length <= 1, `seed ${seed}: ${said.join(', ')}`);
    }
  });
  test('кофе звучит заметно реже остальных', () => {
    let coffee = 0;
    let tea = 0;
    for (let seed = 1; seed < 3000; seed++) {
      const v = createVoice({ random: seeded(seed), phrases: { s: [{ text: 'кофе', coffee: true }, { text: 'чай' }] } });
      if (v.say('s') === 'кофе') coffee++;
      else tea++;
    }
    const share = coffee / (coffee + tea);
    const expected = COFFEE_WEIGHT / (1 + COFFEE_WEIGHT);
    assert.ok(Math.abs(share - expected) < 0.05, `доля кофе ${share.toFixed(2)}, ждали около ${expected.toFixed(2)}`);
  });
  test('новый поток — снова можно про кофе', () => {
    const v = createVoice({ random: () => 0, phrases: { s: [{ text: 'кофе', coffee: true }, { text: 'чай' }] } });
    v.say('s');
    v.newFlow();
    const later = Array.from({ length: 4 }, () => v.say('s'));
    assert.ok(later.includes('кофе'));
  });
});

describe('реальный набор фраз', () => {
  test('есть всё, без чего флоу пола не обойтись', () => {
    for (const sit of ['menu.title', 'menu.sub', 'gender.start', 'gender.spin', 'gender.done', 'gender.left', 'gender.choice.title', 'gender.choice.text', 'gender.cards']) {
      assert.ok(PHRASES[sit]?.length, `нет фраз для ${sit}`);
    }
  });
  test('у каждого размера компании есть старт', () => {
    const v = createVoice({ random: seeded(5) });
    for (const n of [1, 5, 34, 124, 312]) {
      const s = v.say('gender.start', { n }, startBucket(n));
      assert.ok(s && !s.includes('{'), `${n}: ${s}`);
    }
  });
  test('ни одна фраза не оставляет незаполненных скобок', () => {
    for (const [sit, list] of Object.entries(PHRASES)) {
      for (const p of list) {
        const k = p.bucket === 'few' ? 3 : p.bucket === 'one' ? 1 : 7;
        const out = fill(p.text, { n: 34, k, name: 'Сантехник' });
        assert.ok(!/[{}]/.test(out), `${sit}: ${out}`);
      }
    }
  });
  test('не называем, как устроено внутри', () => {
    const all = Object.values(PHRASES).flat().map((p) => p.text).join(' ');
    assert.ok(!/gemini|openrouter|genderize|hugging|google|нейросет/i.test(all));
  });
  test('нет «взаперти» и «выбраться»', () => {
    const all = Object.values(PHRASES).flat().map((p) => p.text).join(' ');
    assert.ok(!/взаперт|выбрать?ся|заперт|на свобод/i.test(all));
  });
});

describe('подсказка на карточке загадки', () => {
  test('по имени — вариант этого имени', () => {
    const v = createVoice({ random: seeded(2) });
    assert.equal(riddleHint('Женя', v), 'Евгений или Евгения?');
    assert.equal(riddleHint('Саша Ким', v), 'Александр или Александра?');
    assert.equal(riddleHint('Валя с работы', v), 'Валентин или Валентина?');
  });
  test('незнакомое — общая фраза', () => {
    const s = riddleHint('Пупсик', createVoice({ random: seeded(9) }));
    assert.ok(s.length > 5 && !s.includes('{'));
  });
  test('профессия — с её названием или общая', () => {
    const s = riddleHint('Сантехник Вася', createVoice({ random: seeded(4) }));
    assert.ok(!s.includes('{'), s);
  });
});
