/// <reference types="node" />
// Испытание моделей: набор имён, оценка ответов и прогон по всем моделям — на подставной сети.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { BENCH_LISTS, GENDER_BENCH, benchLabels, groupErrors, rankResults, runBench, scoreLabels, type BenchCase } from '../ai/bench';
import type { AiFetch, ProviderId } from '../ai/types';
import { genderFromName } from '../gender';

describe('набор имён', () => {
  test('100 имён, без повторов, ответы только f/m/u', () => {
    assert.equal(GENDER_BENCH.length, 100);
    assert.equal(new Set(GENDER_BENCH.map((c) => c.name.toLowerCase())).size, 100);
    for (const c of GENDER_BENCH) assert.ok(['f', 'm', 'u'].includes(c.want), c.name);
  });

  test('трудных больше, чем простых: неоднозначные, казахские, татарские пары, мужские на -а, латиница', () => {
    const count = (g: string) => GENDER_BENCH.filter((c) => c.group === g).length;
    assert.ok(GENDER_BENCH.filter((c) => c.want === 'u').length >= 20);
    assert.ok(count('kz') >= 15);
    assert.ok(count('tatar') >= 6);
    assert.ok(count('ru-a-male') >= 5);
    assert.ok(count('latin') >= 8);
    assert.ok(count('ru-easy') <= 10);
  });

  test('с нашей базой имён набор не спорит', () => {
    for (const c of GENDER_BENCH) {
      const base = genderFromName(c.name);
      if (c.want === 'u') assert.equal(base, null, `${c.name}: база уверена, а это неоднозначное`);
      else if (base) assert.equal(base, c.want, c.name);
    }
  });
});

describe('оценка ответа', () => {
  const cases: BenchCase[] = [
    { name: 'Анна', want: 'f', group: 'a' },
    { name: 'Иван', want: 'm', group: 'a' },
    { name: 'Саша', want: 'u', group: 'b' },
    { name: 'Женя', want: 'u', group: 'b' },
    { name: 'Илья', want: 'm', group: 'c' },
    { name: 'Нино', want: 'f', group: 'c' },
  ];

  test('метки по порядку: f, m, u и «-» — если имя пропущено', () => {
    const text = '<think>…</think>{"answers":[{"i":0,"g":"F"},{"i":1,"g":"m"},{"i":2,"g":"u"},{"i":4,"g":"x"},{"i":9,"g":"f"}]}';
    assert.equal(benchLabels(text, 6), 'fmu---');
    assert.equal(benchLabels('[{"i":"5","g":"f"}]', 6), '-----f');
    assert.equal(benchLabels('не JSON', 3), '---');
    assert.equal(benchLabels(null, 2), '--');
  });

  test('верно, «не знаю», перепутала, угадывала, пропустила; вредные ошибки — втрое', () => {
    const s = scoreLabels(cases, 'fmumu-');
    assert.deepEqual(s, { total: 6, correct: 2, correctUnknown: 1, missed: 1, wrong: 0, guessed: 1, omitted: 1, harmful: 1, score: 0 });
    assert.equal(scoreLabels(cases, 'mfuumf').wrong, 2);
    assert.equal(scoreLabels(cases, 'fmuumf').score, 6);
    assert.equal(scoreLabels(cases, '').omitted, 6);
  });

  test('ошибки по группам', () => {
    assert.deepEqual(groupErrors(cases, 'fmmuu-'), { b: ['Саша:m'], c: ['Илья:u', 'Нино:-'] });
  });
});

describe('какие модели испытывать', () => {
  test('Gemini: только текстовые gemini и gemma с generateContent', () => {
    const body = {
      models: [
        { name: 'models/gemini-flash-lite-latest', supportedGenerationMethods: ['generateContent', 'countTokens'] },
        { name: 'models/gemma-3-27b-it', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-2.5-flash-preview-tts', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-embedding-001', supportedGenerationMethods: ['embedContent'] },
        { name: 'models/imagen-4.0-generate-001', supportedGenerationMethods: ['predict'] },
        { name: 'models/gemini-2.5-flash-image', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-live-2.5-flash', supportedGenerationMethods: ['bidiGenerateContent'] },
      ],
    };
    assert.deepEqual(BENCH_LISTS.gemini.pick(body), ['gemini-flash-lite-latest', 'gemma-3-27b-it']);
  });

  test('Hugging Face: только крупные модели общего назначения из доступных', () => {
    const body = { data: ['meta-llama/Llama-3.3-70B-Instruct', 'Qwen/Qwen2.5-72B-Instruct', 'Qwen/Qwen2.5-Coder-32B-Instruct', 'google/gemma-3-27b-it', 'someone/tiny-model'].map((id) => ({ id })) };
    assert.deepEqual(BENCH_LISTS.huggingface.pick(body), ['meta-llama/Llama-3.3-70B-Instruct', 'Qwen/Qwen2.5-72B-Instruct', 'google/gemma-3-27b-it']);
  });
});

// ---------- Прогон на подставной сети ----------

type Reply = { status: number; body?: unknown; headers?: Record<string, string> } | 'offline' | 'hang';

function fakeNet(answer: (provider: string, model: string, names: string[]) => Reply) {
  const calls: { provider: string; model: string; names: string[] }[] = [];
  const fetch: AiFetch = async (url, init) => {
    const respond = (r: Reply) => {
      if (r === 'offline' || r === 'hang') throw new TypeError('Network request failed');
      return { status: r.status, headers: { get: (n: string) => r.headers?.[n.toLowerCase()] ?? null }, text: async () => JSON.stringify(r.body ?? null) };
    };
    if (url.endsWith('/models') || url.includes('/models?')) {
      if (url.includes('openrouter')) return respond({ status: 200, body: { data: [{ id: 'good/model:free' }, { id: 'bad/model:free' }, { id: 'gone/model:free' }, { id: 'late/model:free' }] } });
      if (url.includes('generativelanguage')) return respond({ status: 200, body: { models: [{ name: 'models/gemini-flash-lite-latest', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemma-3-27b-it', supportedGenerationMethods: ['generateContent'] }] } });
      return respond('offline');
    }
    const body = init.body ? JSON.parse(init.body) : {};
    const provider = url.includes('generativelanguage') ? 'gemini' : url.includes('openrouter') ? 'openrouter' : 'huggingface';
    const model = provider === 'gemini' ? decodeURIComponent(/models\/([^:]+):/.exec(url)![1]) : body.model;
    const prompt: string = provider === 'gemini' ? body.contents[0].parts[0].text : body.messages.at(-1).content;
    const names = prompt.split('\n').filter((l) => /^\d+: /.test(l)).map((l) => l.replace(/^\d+: /, ''));
    calls.push({ provider, model, names });
    const r = answer(provider, model, names);
    if (r === 'hang') {
      return new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    }
    return respond(r);
  };
  return { fetch, calls };
}

const perfect = (names: string[]) => JSON.stringify({ answers: names.map((n, i) => ({ i, g: GENDER_BENCH.find((c) => c.name === n)!.want })) });
const openAi = (text: string): Reply => ({ status: 200, body: { choices: [{ message: { content: text } }], usage: { prompt_tokens: 900, completion_tokens: 800 } } });
const gemini = (text: string): Reply => ({ status: 200, body: { candidates: [{ content: { parts: [{ text }] } }] } });

function bench(answer: Parameters<typeof fakeNet>[0], extra: Partial<Parameters<typeof runBench>[0]> = {}) {
  const net = fakeNet(answer);
  let clock = 0;
  const lines: string[] = [];
  const run = runBench({
    providers: ['gemini', 'openrouter', 'huggingface'] as ProviderId[],
    keys: { gemini: 'g', openrouter: 'o' },
    fetch: net.fetch,
    now: () => clock,
    sleep: async (ms) => void (clock += ms),
    log: (l) => lines.push(l),
    ...extra,
  });
  return { net, lines, run };
}

describe('прогон', () => {
  test('все модели получают все имена тем же запросом, что в приложении; без ключа сервис пропускается', async () => {
    const { net, lines, run } = bench((p, m, names) => (p === 'gemini' ? gemini(perfect(names)) : openAi(perfect(names))), { only: ['openrouter:good/model:free'] });
    const results = await run;
    assert.deepEqual(results.map((r) => `${r.provider}/${r.model}`), ['gemini/gemini-flash-lite-latest', 'gemini/gemma-3-27b-it', 'openrouter/good/model:free']);
    for (const r of results) {
      assert.equal(r.score.score, 100, r.model);
      assert.equal(r.requests.length, 2, 'по 50 имён в запросе');
      assert.ok(r.requests.every((q) => q.appParsed));
    }
    assert.deepEqual(net.calls.filter((c) => c.model === 'good/model:free').flatMap((c) => c.names), GENDER_BENCH.map((c) => c.name));
    assert.ok(lines.some((l) => l.includes('[huggingface] нет ключа')));
  });

  test('поминутный лимит — ждём и повторяем один раз; дневной лимит OpenRouter — остальные модели «не проверены»', async () => {
    let first = true;
    const { run } = bench(
      (p, m, names) => {
        if (p === 'gemini') return gemini(perfect(names));
        if (m === 'good/model:free') {
          if (first) {
            first = false;
            return { status: 429, headers: { 'retry-after': '7' }, body: { error: { code: 429, message: 'Rate limit exceeded: free-models-per-min.' } } };
          }
          return openAi(perfect(names));
        }
        return { status: 429, body: { error: { code: 429, message: 'Rate limit exceeded: free-models-per-day.' } } };
      },
      { providers: ['openrouter'] },
    );
    const results = await run;
    assert.equal(results[0].score.score, 100, 'после повтора ответила');
    assert.equal(results[0].requests.length, 2);
    assert.equal(results[1].requests.length, 1);
    assert.deepEqual(results.slice(2).map((r) => r.skipped), ['дневной лимит OpenRouter', 'дневной лимит OpenRouter']);
    assert.equal(rankResults(results).at(-1)!.skipped, 'дневной лимит OpenRouter', 'непроверенные — в конце таблицы');
  });

  test('модель убрали — дальше её не мучаем; висит дольше срока — «не ответила вовремя»; ответ мимо формата отмечен', async () => {
    const { run } = bench(
      (p, m, names) => {
        if (m === 'bad/model:free') return openAi('Извините, я не могу определить пол.');
        if (m === 'gone/model:free') return { status: 404, body: { error: { code: 404, message: 'No endpoints found' } } };
        if (m === 'late/model:free') return 'hang';
        return openAi(perfect(names));
      },
      { providers: ['openrouter'], timeoutMs: 5 },
    );
    const results = await run;
    const by = Object.fromEntries(results.map((r) => [r.model, r]));
    assert.equal(by['gone/model:free'].requests.length, 1);
    assert.equal(by['gone/model:free'].requests[0].kind, 'model-missing');
    assert.equal(by['bad/model:free'].requests[0].appParsed, false);
    assert.match(by['bad/model:free'].requests[0].note!, /не могу/);
    assert.equal(by['bad/model:free'].score.omitted, 100);
    assert.equal(by['late/model:free'].requests[0].kind, 'timeout');
    assert.equal(rankResults(results)[0].model, 'good/model:free');
  });

  test('бюджет запросов OpenRouter: больше не тратим', async () => {
    const { net, run } = bench((p, m, names) => openAi(perfect(names)), { providers: ['openrouter'], openRouterBudget: 3 });
    const results = await run;
    assert.equal(net.calls.length, 3);
    assert.ok(results.some((r) => r.skipped === 'бюджет запросов OpenRouter на сегодня'));
  });

  test('неверный ключ — сервис дальше не трогаем', async () => {
    const { net, run } = bench(() => ({ status: 400, body: { error: { code: 400, status: 'INVALID_ARGUMENT', message: 'API key not valid.' } } }), { providers: ['gemini'] });
    const results = await run;
    assert.equal(net.calls.length, 1);
    assert.equal(results[1].skipped, 'сервис отказал: auth');
  });

  test('рейтинг: сначала без вредных ошибок, потом по верным, потом быстрее', () => {
    const r = (model: string, labels: string, ms: number[]) => ({ provider: 'openrouter' as const, model, requests: [], labels, ms, score: scoreLabels(GENDER_BENCH, labels) });
    const truth = GENDER_BENCH.map((c) => c.want).join('');
    const careful = truth.replace(/[fm]/g, (g, i) => (i < 10 ? 'u' : g));
    const guesser = truth.replace(/u/g, 'm');
    const ranked = rankResults([r('guesser', guesser, [1000]), r('careful', careful, [1000]), r('slow-perfect', truth, [9000]), r('fast-perfect', truth, [2000])]);
    assert.deepEqual(ranked.map((x) => x.model), ['fast-perfect', 'slow-perfect', 'careful', 'guesser']);
  });
});
