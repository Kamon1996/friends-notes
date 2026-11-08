/// <reference types="node" />
// Тир-лист: оценки моделей из испытания → тиры → кого приложение спрашивает первым.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { scoreLabels } from '../ai/bench';
import { RATINGS } from '../ai/ratings';
import { createAi } from '../ai/router';
import { mergeRatings, rankModels, ratingsSource, tierOf, tierPlan, type BenchOutcome, type ModelRating, type Ratings, type TaskRatings } from '../ai/tiers';
import type { AiFetch, AiTask, ProviderId } from '../ai/types';

const rating = (provider: ProviderId, model: string, o: Partial<ModelRating> = {}): ModelRating => ({
  provider,
  model,
  testedAt: '2026-11-08',
  cases: 100,
  correct: 75,
  correctUnknown: 22,
  missed: 2,
  wrong: 0,
  guessed: 0,
  omitted: 1,
  harmful: 0,
  score: 97,
  medianMs: 5000,
  parsedShare: 1,
  status: 'ok',
  history: [],
  ...o,
});

const task = (...models: ModelRating[]): TaskRatings => ({ benchCases: 100, updatedAt: '2026-11-08', models: Object.fromEntries(models.map((m) => [`${m.provider}:${m.model}`, m])) });

describe('тиры', () => {
  test('S — без вредных ошибок, ≥90% верно, всё понятно и быстро', () => {
    assert.equal(tierOf(rating('gemini', 'a')), 'S');
    assert.equal(tierOf(rating('gemini', 'a', { medianMs: 12_000 })), 'A', 'медленнее 10 с — уже не S');
  });
  test('A, B, C — по вредным ошибкам и точности', () => {
    assert.equal(tierOf(rating('gemini', 'a', { harmful: 1, wrong: 1 })), 'A');
    assert.equal(tierOf(rating('gemini', 'a', { correct: 60, correctUnknown: 22 })), 'A');
    assert.equal(tierOf(rating('gemini', 'a', { harmful: 2, guessed: 2 })), 'B');
    assert.equal(tierOf(rating('gemini', 'a', { correct: 52, correctUnknown: 20 })), 'B');
    assert.equal(tierOf(rating('gemini', 'a', { harmful: 3, guessed: 3 })), 'C');
    assert.equal(tierOf(rating('gemini', 'a', { correct: 40, correctUnknown: 15 })), 'C');
    assert.equal(tierOf(rating('gemini', 'a', { parsedShare: 0.5 })), 'B', 'половину ответов приложение не поняло');
  });
  test('F — путает пол, не понимает формат, модели нет, слишком мало верных', () => {
    assert.equal(tierOf(rating('gemini', 'a', { harmful: 4, wrong: 4 })), 'F');
    assert.equal(tierOf(rating('gemini', 'a', { parsedShare: 0 })), 'F');
    assert.equal(tierOf(rating('gemini', 'a', { status: 'unavailable' })), 'F');
    assert.equal(tierOf(rating('gemini', 'a', { correct: 30, correctUnknown: 10 })), 'F');
  });
  test('слишком медленная — не выше C', () => {
    assert.equal(tierOf(rating('gemini', 'a', { medianMs: 45_000 })), 'C');
    assert.equal(tierOf(rating('gemini', 'a', { medianMs: null })), 'C');
  });

  test('тир-лист: по тиру, потом итог, вредные ошибки, скорость', () => {
    const list = rankModels(
      task(
        rating('openrouter', 'fast-a', { harmful: 1, score: 90, medianMs: 2000 }),
        rating('gemini', 's-slow', { medianMs: 9000 }),
        rating('gemini', 's-fast', { medianMs: 3000 }),
        rating('huggingface', 'f', { status: 'unavailable' }),
        rating('openrouter', 'slow-a', { harmful: 1, score: 90, medianMs: 8000 }),
        rating('openrouter', 'top-a', { harmful: 1, score: 93, medianMs: 9000 }),
      ),
    );
    assert.deepEqual(list.map((m) => `${m.tier} ${m.model}`), ['S s-fast', 'S s-slow', 'A top-a', 'A fast-a', 'A slow-a', 'F f']);
    assert.deepEqual(rankModels(undefined), []);
  });

  test('план: хорошие первыми, слабые в конце, F — никогда; только сервисы задачи', () => {
    const plan = tierPlan(task(rating('openrouter', 'good'), rating('gemini', 'weak', { harmful: 3, guessed: 3 }), rating('huggingface', 'bad', { harmful: 9, wrong: 9 }), rating('huggingface', 'other-task-provider')), ['gemini', 'openrouter', 'huggingface']);
    assert.deepEqual(plan.first, [
      { provider: 'openrouter', model: 'good' },
      { provider: 'huggingface', model: 'other-task-provider' },
    ]);
    assert.deepEqual(plan.last, [{ provider: 'gemini', model: 'weak' }]);
    assert.deepEqual([...plan.banned], ['huggingface:bad']);
    assert.deepEqual(tierPlan(task(rating('huggingface', 'x')), ['gemini']).first, []);
  });
});

describe('оценки после испытания', () => {
  const truth = 'f'.repeat(77) + 'u'.repeat(23);
  const cases = Array.from({ length: 100 }, (_, i) => ({ name: `n${i}`, want: truth[i] as 'f' | 'u', group: 'g' }));
  const outcome = (model: string, labels: string, o: Partial<BenchOutcome> = {}): BenchOutcome => ({
    provider: 'openrouter',
    model,
    score: scoreLabels(cases, labels),
    ms: [4000, 6000],
    requests: [
      { kind: 'ok', appParsed: true },
      { kind: 'ok', appParsed: true },
    ],
    ...o,
  });

  test('новые модели записываются с тиром и историей', () => {
    const { ratings, updated } = mergeRatings({}, 'gender', 100, [outcome('a:free', truth)], '2026-11-08');
    const r = ratings.gender.models['openrouter:a:free'];
    assert.deepEqual(updated, ['openrouter:a:free']);
    assert.equal(r.score, 100);
    assert.equal(r.medianMs, 6000);
    assert.equal(r.parsedShare, 1);
    assert.equal(tierOf(r), 'S');
    assert.deepEqual(r.history, [{ testedAt: '2026-11-08', score: 100, harmful: 0, medianMs: 6000 }]);
  });

  test('не проверенные в этот раз (лимит, сбой, отказ сервиса, пропуск) — оценка остаётся прежней', () => {
    const first = mergeRatings({}, 'gender', 100, [outcome('a:free', truth), outcome('b:free', truth), outcome('c:free', truth), outcome('d:free', truth)], '2026-11-08').ratings;
    const { ratings, updated, kept } = mergeRatings(
      first,
      'gender',
      100,
      [
        outcome('a:free', '', { skipped: 'дневной лимит OpenRouter', requests: [] }),
        outcome('b:free', '-'.repeat(100), { requests: [{ kind: 'rate-limit', appParsed: false }] }),
        outcome('c:free', truth.slice(0, 50) + '-'.repeat(50), { requests: [{ kind: 'ok', appParsed: true }, { kind: 'server', appParsed: false }] }),
        outcome('d:free', '-'.repeat(100), { requests: [{ kind: 'auth', appParsed: false }] }),
      ],
      '2026-11-09',
    );
    assert.deepEqual(updated, []);
    assert.equal(kept.length, 4);
    assert.deepEqual(ratings.gender, first.gender);
  });

  test('модель убрали или она не принимает запрос — unavailable (тир F)', () => {
    const { ratings } = mergeRatings({}, 'gender', 100, [outcome('gone:free', '-'.repeat(100), { ms: [], requests: [{ kind: 'model-missing', appParsed: false, note: 'No endpoints found' }] })], '2026-11-08');
    const r = ratings.gender.models['openrouter:gone:free'];
    assert.equal(r.status, 'unavailable');
    assert.equal(r.note, 'No endpoints found');
    assert.equal(tierOf(r), 'F');
  });

  test('не уложилась в срок — это тоже оценка: медленная модель приложению не годится', () => {
    const { ratings, updated } = mergeRatings({}, 'gender', 100, [outcome('slow:free', '-'.repeat(100), { ms: [], requests: [{ kind: 'timeout', appParsed: false }] })], '2026-11-08');
    assert.deepEqual(updated, ['openrouter:slow:free']);
    assert.equal(tierOf(ratings.gender.models['openrouter:slow:free']), 'F');
  });

  test('повторное испытание обновляет оценку; история — последние 5', () => {
    let ratings: Ratings = {};
    for (let day = 1; day <= 7; day++) ratings = mergeRatings(ratings, 'gender', 100, [outcome('a:free', truth, { ms: [day * 1000] })], `2026-11-0${day}`).ratings;
    const r = ratings.gender.models['openrouter:a:free'];
    assert.equal(r.testedAt, '2026-11-07');
    assert.deepEqual(r.history.map((h) => h.testedAt), ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07']);
  });

  test('файл оценок — рабочий TypeScript с теми же данными', () => {
    const { ratings } = mergeRatings({}, 'gender', 100, [outcome('a:free', truth)], '2026-11-08');
    const src = ratingsSource(ratings);
    assert.match(src, /^import type \{ Ratings \} from '\.\/tiers';/);
    assert.match(src, /export const RATINGS: Ratings = \{/);
    assert.deepEqual(JSON.parse(src.slice(src.indexOf('= ') + 2).replace(/;\s*$/, '')), ratings);
    assert.equal(typeof RATINGS, 'object', 'файл в репозитории читается');
  });
});

describe('приложение спрашивает по тир-листу', () => {
  const ECHO: AiTask<string, string> = { id: 'gender', providers: ['gemini', 'openrouter', 'huggingface'], request: (q) => ({ prompt: q }), parse: (t) => (t.startsWith('OK') ? t : null) };

  function run(ratings: Ratings, respond: (provider: string, model: string) => number, keys: Partial<Record<ProviderId, string>> = { gemini: 'g', openrouter: 'o', huggingface: 'h' }) {
    const asked: string[] = [];
    const fetch: AiFetch = async (url, init) => {
      if (url === 'https://openrouter.ai/api/v1/models') return { status: 500, headers: { get: () => null }, text: async () => '' };
      const body = JSON.parse(init.body!);
      const provider = url.includes('generativelanguage') ? 'gemini' : url.includes('openrouter') ? 'openrouter' : 'huggingface';
      const model = provider === 'gemini' ? decodeURIComponent(/models\/([^:]+):/.exec(url)![1]) : body.model;
      asked.push(`${provider}:${model}`);
      const status = respond(provider, model);
      const text = provider === 'gemini' ? { candidates: [{ content: { parts: [{ text: 'OK' }] } }] } : { choices: [{ message: { content: 'OK' } }] };
      return { status, headers: { get: () => null }, text: async () => JSON.stringify(status === 200 ? text : { error: { code: status, message: 'x' } }) };
    };
    const ai = createAi({ keys, fetch, now: () => 0, load: async () => null, save: async () => {}, ratings, modelsPerProvider: 5 });
    return { ai, asked };
  }

  test('лучшая по тир-листу — первой, даже если её сервис по умолчанию не первый', async () => {
    const ratings = { gender: task(rating('huggingface', 'hf-best'), rating('gemini', 'gem-ok', { harmful: 1, wrong: 1, score: 90 })) };
    const { ai, asked } = run(ratings, () => 200);
    const r = await ai.run(ECHO, 'q');
    assert.equal(r.status === 'ok' && r.model, 'hf-best');
    assert.deepEqual(asked, ['huggingface:hf-best']);
  });

  test('лучшая не ответила — следующая по тир-листу, потом не испытанные по приоритету, слабые — в конце, F — никогда', async () => {
    const ratings = {
      gender: task(
        rating('openrouter', 'or-best'),
        rating('huggingface', 'hf-good', { harmful: 1, wrong: 1, score: 90 }),
        rating('gemini', 'gemini-flash-lite-latest', { harmful: 3, guessed: 3, score: 80 }),
        rating('gemini', 'gemini-3.5-flash-lite', { harmful: 6, wrong: 6 }),
      ),
    };
    const { ai, asked } = run(ratings, () => 503, { gemini: 'g', openrouter: 'o', huggingface: 'h' });
    const r = await ai.run(ECHO, 'q');
    assert.equal(r.status, 'unavailable');
    // 503 — сервис целиком на паузе, поэтому от каждого сервиса — по одной модели.
    assert.deepEqual(asked, ['openrouter:or-best', 'huggingface:hf-good', 'gemini:gemini-flash-latest']);
  });

  test('не испытанные модели идут после проверенных, F пропускаются, C — в самом конце', async () => {
    const ratings = {
      gender: task(rating('gemini', 'gemini-3.5-flash-lite', { harmful: 6, wrong: 6 }), rating('gemini', 'gemini-flash-latest', { harmful: 3, guessed: 3, score: 80 })),
    };
    const { ai, asked } = run(ratings, () => 404, { gemini: 'g' });
    await ai.run(ECHO, 'q');
    assert.deepEqual(asked, ['gemini:gemini-flash-lite-latest', 'gemini:gemini-2.5-flash-lite', 'gemini:gemini-flash-latest']);
  });

  test('без оценок — как раньше, по приоритету сервисов', async () => {
    const { ai, asked } = run({}, () => 200);
    await ai.run(ECHO, 'q');
    assert.deepEqual(asked, ['gemini:gemini-flash-lite-latest']);
  });
});
