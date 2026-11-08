/// <reference types="node" />
// Модуль ИИ: сервисы по приоритету, запасные модели, паузы до обновления лимитов — на подставном интернете.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { PAUSE_MAX, PAUSE_MIN, defaultPause, nextMonthStart, nextPacificMidnight, parseDuration, pauseUntil, retryHint } from '../ai/limits';
import { PROVIDERS, classify, extractJson, pickOpenRouterFree } from '../ai/providers';
import { MODEL_LIST_TTL, createAi, sanitizeState, type AiState } from '../ai/router';
import { TASK_PROVIDERS } from '../ai/tasks';
import type { AiFetch, AiTask, ProviderId } from '../ai/types';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 10, 8, 9, 0, 0);

const headers = (h: Record<string, string> = {}) => {
  const lower = Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]));
  return { get: (name: string) => lower[name.toLowerCase()] ?? null };
};

// ---------- Подставной интернет ----------

type Reply = { status: number; body?: unknown; headers?: Record<string, string> } | 'offline' | 'hang';
interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, unknown> | null;
  provider: ProviderId | 'openrouter-models';
  model: string;
}

/** Определить сервис и модель по запросу. */
function identify(url: string, body: Record<string, unknown> | null): { provider: Call['provider']; model: string } {
  if (url.includes('generativelanguage.googleapis.com')) return { provider: 'gemini', model: decodeURIComponent(/models\/([^:]+):/.exec(url)![1]) };
  if (url === 'https://openrouter.ai/api/v1/models') return { provider: 'openrouter-models', model: '' };
  const provider: ProviderId = url.includes('openrouter.ai') ? 'openrouter' : 'huggingface';
  return { provider, model: String(body?.model ?? '') };
}

class Net {
  calls: Call[] = [];
  constructor(public respond: (c: Call) => Reply) {}
  fetch: AiFetch = async (url, init) => {
    const body = init.body ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    const call: Call = { url, method: init.method ?? 'GET', headers: init.headers ?? {}, body, ...identify(url, body) };
    this.calls.push(call);
    const r = this.respond(call);
    if (r === 'offline') throw new TypeError('Network request failed');
    if (r === 'hang') return new Promise(() => {});
    return { status: r.status, headers: headers(r.headers), text: async () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body ?? null)) };
  };
  /** «gemini/model» по порядку — что спрашивали (без запроса списка моделей). */
  get asked() {
    return this.calls.filter((c) => c.provider !== 'openrouter-models').map((c) => `${c.provider}/${c.model}`);
  }
}

const geminiOk = (text: string): Reply => ({ status: 200, body: { candidates: [{ content: { parts: [{ text }] } }] } });
const openAiOk = (text: string): Reply => ({ status: 200, body: { choices: [{ message: { role: 'assistant', content: text } }] } });
const ok = (c: Call, text = 'OK') => (c.provider === 'gemini' ? geminiOk(text) : openAiOk(text));

/** Простая задача: ответ годится, если начинается с «OK». */
const ECHO: AiTask<string, string> = {
  id: 'echo',
  providers: ['gemini', 'openrouter', 'huggingface'],
  request: (q) => ({ system: 'Отвечай коротко.', prompt: q, json: true, maxTokens: 50 }),
  parse: (text) => (text.startsWith('OK') ? text : null),
};

const ALL_KEYS = { gemini: 'g-key', openrouter: 'o-key', huggingface: 'h-key' };

/** «Телефон» с модулем ИИ: состояние хранится между запусками как JSON. */
function phone(respond: (c: Call) => Reply, keys: Partial<Record<ProviderId, string>> = ALL_KEYS, extra: { timeoutMs?: number; modelsPerProvider?: number } = {}) {
  const net = new Net(respond);
  let stored: string | null = null;
  let saves = 0;
  const clock = { now: T0 };
  const make = () =>
    createAi({
      keys,
      fetch: net.fetch,
      now: () => clock.now,
      load: async () => (stored ? JSON.parse(stored) : null),
      save: async (s) => {
        saves++;
        stored = JSON.stringify(s);
      },
      ...extra,
    });
  let ai = make();
  return {
    net,
    clock,
    get ai() {
      return ai;
    },
    /** Перезапуск приложения: новое состояние модуля из сохранённого. */
    restart() {
      ai = make();
    },
    get stored(): AiState {
      return stored ? JSON.parse(stored) : { pauses: {}, models: {} };
    },
    get saves() {
      return saves;
    },
  };
}

// ---------- Лимиты ----------

describe('когда сервис снова можно трогать', () => {
  test('длительности: «2m59.56s», «7.66s», «500ms», «1h2m», «33s», «12»', () => {
    assert.equal(parseDuration('2m59.56s'), 179_560);
    assert.equal(parseDuration('7.66s'), 7660);
    assert.equal(parseDuration('500ms'), 500);
    assert.equal(parseDuration('1h2m'), HOUR + 2 * MINUTE);
    assert.equal(parseDuration('33s'), 33_000);
    assert.equal(parseDuration('12'), 12_000);
    assert.equal(parseDuration('скоро'), undefined);
    assert.equal(parseDuration('5 minutes'), undefined);
    assert.equal(parseDuration(null), undefined);
  });

  test('Retry-After: секунды и дата; retry-after-ms', () => {
    assert.equal(retryHint({ status: 429, headers: headers({ 'Retry-After': '20' }), body: null }, T0), T0 + 20 * SECOND);
    const date = new Date(T0 + HOUR).toUTCString();
    assert.equal(retryHint({ status: 429, headers: headers({ 'retry-after': date }), body: null }, T0), Date.parse(date));
    assert.equal(retryHint({ status: 429, headers: headers({ 'retry-after-ms': '1500' }), body: null }, T0), T0 + 1500);
  });

  test('OpenRouter: X-RateLimit-Reset в мс — и в заголовке, и в error.metadata.headers', () => {
    const reset = String(T0 + 5 * HOUR);
    assert.equal(retryHint({ status: 429, headers: headers({ 'X-RateLimit-Reset': reset }), body: null }, T0), T0 + 5 * HOUR);
    const body = { error: { code: 429, message: 'Rate limit exceeded: free-models-per-day', metadata: { headers: { 'X-RateLimit-Limit': '50', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': reset } } } };
    assert.equal(retryHint({ status: 429, headers: headers(), body }, T0), T0 + 5 * HOUR);
    assert.equal(retryHint({ status: 429, headers: headers({ 'x-ratelimit-reset': String((T0 + HOUR) / 1000) }), body: null }, T0), T0 + HOUR, 'и в секундах');
  });

  test('Gemini: RetryInfo — через сколько; квота «в день» — до полуночи по тихоокеанскому', () => {
    const minute = {
      error: {
        code: 429,
        status: 'RESOURCE_EXHAUSTED',
        details: [
          { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier' }] },
          { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '33s' },
        ],
      },
    };
    assert.equal(retryHint({ status: 429, headers: headers(), body: minute }, T0), T0 + 33 * SECOND);
    const day = { error: { code: 429, details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }, { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '20s' }] } };
    assert.equal(retryHint({ status: 429, headers: headers(), body: day }, T0), nextPacificMidnight(T0), 'дневная квота важнее «20 секунд»');
  });

  test('OpenAI-совместимые: сброс счётчиков — только если упёрлись и Retry-After нет', () => {
    const h = headers({ 'x-ratelimit-reset-requests': '2m59.56s', 'x-ratelimit-reset-tokens': '7.66s' });
    assert.equal(retryHint({ status: 429, headers: h, body: null }, T0), T0 + 179_560);
    assert.equal(retryHint({ status: 200, headers: h, body: null }, T0), undefined, 'обычный ответ — это не пауза');
    assert.equal(retryHint({ status: 429, headers: headers({ 'retry-after': '3', 'x-ratelimit-reset-requests': '2m' }), body: null }, T0), T0 + 3 * SECOND);
  });

  test('чепуха и прошлое не считаются; больше месяца не ждём', () => {
    assert.equal(retryHint({ status: 429, headers: headers({ 'retry-after': 'потом' }), body: null }, T0), undefined);
    assert.equal(retryHint({ status: 429, headers: headers({ 'retry-after': new Date(T0 - HOUR).toUTCString() }), body: null }, T0), undefined);
    assert.equal(retryHint({ status: 429, headers: headers({ 'retry-after': String(400 * 24 * 3600) }), body: null }, T0), T0 + PAUSE_MAX);
    assert.equal(retryHint({ status: 429, headers: headers(), body: 'Too many requests' }, T0), undefined);
  });

  test('полночь по тихоокеанскому и начало месяца', () => {
    assert.equal(nextPacificMidnight(Date.UTC(2026, 10, 8, 7)), Date.UTC(2026, 10, 8, 8));
    assert.equal(nextPacificMidnight(Date.UTC(2026, 10, 8, 9)), Date.UTC(2026, 10, 9, 8));
    assert.equal(nextMonthStart(Date.UTC(2026, 11, 31, 23)), Date.UTC(2027, 0, 1));
  });

  test('пауза по умолчанию растёт с каждой неудачей подряд, но в пределах', () => {
    assert.deepEqual([0, 1, 2, 3].map((n) => defaultPause('rate-limit', n)), [15 * MINUTE, 30 * MINUTE, HOUR, 2 * HOUR]);
    assert.equal(defaultPause('rate-limit', 20), DAY);
    assert.deepEqual([0, 1, 7].map((n) => defaultPause('server', n)), [5 * MINUTE, 10 * MINUTE, 6 * HOUR]);
    assert.equal(defaultPause('auth', 0), 7 * DAY);
    assert.equal(defaultPause('region', 5), 7 * DAY);
    assert.equal(defaultPause('model-missing', 0), 7 * DAY);
    assert.equal(defaultPause('bad-request', 0), DAY);
    assert.equal(pauseUntil('rate-limit', T0 + SECOND, 0, T0), T0 + PAUSE_MIN, 'не короче 30 секунд');
    assert.equal(pauseUntil('rate-limit', undefined, 0, T0), T0 + 15 * MINUTE);
    assert.equal(pauseUntil('rate-limit', T0 + 3 * HOUR, 5, T0), T0 + 3 * HOUR, 'подсказка сервиса важнее своей паузы');
  });
});

// ---------- Сервисы ----------

describe('как разговариваем с каждым сервисом', () => {
  const req = { system: 'Правила', prompt: 'Вопрос', json: true, temperature: 0, maxTokens: 300 };

  test('Gemini: ключ в заголовке, не в адресе; правила — systemInstruction; JSON — responseMimeType', () => {
    const { url, init } = PROVIDERS.gemini.request('gemini-flash-lite-latest', 'SECRET', req);
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent');
    assert.ok(!url.includes('SECRET'));
    assert.equal(init.headers['x-goog-api-key'], 'SECRET');
    const body = JSON.parse(init.body);
    assert.deepEqual(body.systemInstruction, { parts: [{ text: 'Правила' }] });
    assert.deepEqual(body.contents, [{ role: 'user', parts: [{ text: 'Вопрос' }] }]);
    assert.deepEqual(body.generationConfig, { temperature: 0, responseMimeType: 'application/json' });
  });

  for (const [id, url] of [
    ['openrouter', 'https://openrouter.ai/api/v1/chat/completions'],
    ['huggingface', 'https://router.huggingface.co/v1/chat/completions'],
  ] as const) {
    test(`${id}: OpenAI-совместимый запрос, ключ — Bearer`, () => {
      const r = PROVIDERS[id].request('some/model', 'SECRET', req);
      assert.equal(r.url, url);
      assert.equal(r.init.headers.authorization, 'Bearer SECRET');
      assert.ok(!r.url.includes('SECRET'));
      const body = JSON.parse(r.init.body);
      assert.equal(body.model, 'some/model');
      assert.deepEqual(body.messages, [
        { role: 'system', content: 'Правила' },
        { role: 'user', content: 'Вопрос' },
      ]);
      assert.equal(body.temperature, 0);
      assert.equal(body.max_tokens, 300);
      assert.equal(body.response_format, undefined, 'не все модели его понимают');
      for (const v of Object.values(r.init.headers)) assert.match(v, /^[\x20-\x7e]*$/, 'заголовки — только латиница');
    });
  }

  test('у каждого сервиса есть модели, у задачи «пол» — все три сервиса', () => {
    for (const p of Object.values(PROVIDERS)) assert.ok(p.models.length >= 2, p.id);
    assert.deepEqual([...TASK_PROVIDERS.gender].sort(), ['gemini', 'huggingface', 'openrouter']);
    assert.equal(TASK_PROVIDERS.gender[0], 'gemini');
  });

  test('текст ответа: Gemini без «мыслей»; OpenAI — строка или части; пусто — null', () => {
    assert.equal(PROVIDERS.gemini.text({ candidates: [{ content: { parts: [{ text: 'думаю…', thought: true }, { text: '{"a":1}' }] } }] }), '{"a":1}');
    assert.equal(PROVIDERS.gemini.text({ candidates: [{ finishReason: 'SAFETY' }] }), null);
    assert.equal(PROVIDERS.gemini.text({ promptFeedback: { blockReason: 'OTHER' } }), null);
    assert.equal(PROVIDERS.huggingface.text({ choices: [{ message: { content: 'да' } }] }), 'да');
    assert.equal(PROVIDERS.openrouter.text({ choices: [{ message: { content: [{ type: 'text', text: 'а' }, { type: 'text', text: 'б' }] } }] }), 'аб');
    assert.equal(PROVIDERS.huggingface.text({ choices: [{ message: { content: '  ' } }] }), null);
    assert.equal(PROVIDERS.openrouter.text(null), null);
  });

  test('что значит ошибка', () => {
    const cases: [ProviderId, number, unknown, string | null][] = [
      ['gemini', 200, { candidates: [] }, null],
      ['gemini', 429, { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded' } }, 'rate-limit'],
      ['gemini', 400, { error: { code: 400, status: 'FAILED_PRECONDITION', message: 'User location is not supported for the API use.' } }, 'region'],
      ['gemini', 400, { error: { code: 400, status: 'INVALID_ARGUMENT', message: 'API key not valid. Please pass a valid API key.' } }, 'auth'],
      ['gemini', 403, { error: { code: 403, status: 'PERMISSION_DENIED' } }, 'auth'],
      ['gemini', 404, { error: { code: 404, status: 'NOT_FOUND', message: 'models/x is not found for API version v1beta' } }, 'model-missing'],
      ['gemini', 400, { error: { code: 400, status: 'INVALID_ARGUMENT', message: 'Invalid JSON payload' } }, 'bad-request'],
      ['gemini', 503, { error: { code: 503, status: 'UNAVAILABLE', message: 'The model is overloaded.' } }, 'server'],
      ['huggingface', 429, { error: { message: 'Rate limit reached for model', type: 'tokens', code: 'rate_limit_exceeded' } }, 'rate-limit'],
      ['huggingface', 400, { error: { message: 'The model `x` has been decommissioned', code: 'model_decommissioned' } }, 'model-missing'],
      ['huggingface', 404, { error: { message: 'The model `x` does not exist', code: 'model_not_found' } }, 'model-missing'],
      ['huggingface', 401, { error: { message: 'Invalid API Key', code: 'invalid_api_key' } }, 'auth'],
      ['huggingface', 403, { error: { message: 'Forbidden' } }, 'auth'],
      ['huggingface', 498, { error: { message: 'Flex tier capacity exceeded' } }, 'server'],
      ['huggingface', 413, { error: { message: 'Request too large' } }, 'bad-request'],
      ['openrouter', 402, { error: { code: 402, message: 'Insufficient credits' } }, 'credits'],
      ['openrouter', 404, { error: { code: 404, message: 'No endpoints found matching your data policy' } }, 'model-missing'],
      ['openrouter', 403, { error: { code: 403, message: 'Input was flagged by moderation' } }, 'bad-request'],
      ['openrouter', 200, { error: { code: 502, message: 'Provider returned error' } }, 'server'],
      ['openrouter', 400, { error: { code: 400, message: 'meta-llama/x:free is not a valid model ID' } }, 'model-missing'],
      ['huggingface', 402, { error: 'You have exceeded your monthly included credits for Inference Providers.' }, 'credits'],
      ['huggingface', 400, { error: { message: "The requested model 'x' is not supported by any provider you have enabled." } }, 'model-missing'],
      ['huggingface', 500, '<html>', 'server'],
    ];
    for (const [id, status, body, want] of cases) assert.equal(classify(id, status, body), want, `${id} ${status} ${JSON.stringify(body).slice(0, 80)}`);
  });

  test('JSON из ответа: рассуждения, обёртка ``` и слова вокруг не мешают', () => {
    assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
    assert.deepEqual(extractJson('```json\n[1,2]\n```'), [1, 2]);
    assert.deepEqual(extractJson('<think>хм, {это не то}</think>\n{"answers":[]}'), { answers: [] });
    assert.deepEqual(extractJson('Вот ответ: {"a":[1]} Надеюсь, помог!'), { a: [1] });
    assert.deepEqual(extractJson('Ответ: [{"i":0}] — всё'), [{ i: 0 }]);
    assert.equal(extractJson('не знаю'), undefined);
    assert.equal(extractJson(''), undefined);
  });

  test('OpenRouter: из списка моделей — только бесплатные текстовые, сначала предпочтительные, не больше 8', () => {
    const data = [
      { id: 'openai/gpt-5', architecture: { input_modalities: ['text'], output_modalities: ['text'] } },
      { id: 'some/new-model:free', architecture: { input_modalities: ['text'], output_modalities: ['text'] } },
      { id: 'google/gemma-3-27b-it:free', architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] } },
      { id: 'black-forest/flux:free', architecture: { input_modalities: ['text'], output_modalities: ['image'] } },
      { id: 'meta-llama/llama-3.3-70b-instruct:free', architecture: { input_modalities: ['text'], output_modalities: ['text'] } },
      { id: 'audio/only:free', architecture: { input_modalities: ['audio'], output_modalities: ['text'] } },
      { id: 'old/format:free' },
      ...Array.from({ length: 10 }, (_, i) => ({ id: `x/m${i}:free` })),
    ];
    const list = pickOpenRouterFree({ data });
    assert.deepEqual(list.slice(0, 4), ['meta-llama/llama-3.3-70b-instruct:free', 'google/gemma-3-27b-it:free', 'some/new-model:free', 'old/format:free']);
    assert.equal(list.length, 8);
    assert.deepEqual(pickOpenRouterFree(null), []);
    assert.deepEqual(pickOpenRouterFree({ data: 'x' }), []);
  });
});

// ---------- Очередь сервисов ----------

describe('порядок и запасные варианты', () => {
  test('первый по приоритету ответил — остальных не трогаем', async () => {
    const p = phone((c) => ok(c, 'OK gemini'));
    const r = await p.ai.run(ECHO, 'вопрос');
    assert.equal(r.status, 'ok');
    assert.deepEqual(r.status === 'ok' && [r.value, r.provider, r.model], ['OK gemini', 'gemini', 'gemini-flash-lite-latest']);
    assert.deepEqual(p.net.asked, ['gemini/gemini-flash-lite-latest']);
  });

  test('без ключа сервис пропускается', async () => {
    const p = phone((c) => ok(c), { openrouter: 'o-key' });
    p.net.respond = (c) => (c.provider === 'openrouter-models' ? { status: 500 } : ok(c));
    const r = await p.ai.run(ECHO, 'вопрос');
    assert.equal(r.status === 'ok' && r.provider, 'openrouter');
    assert.ok(p.net.asked.every((a) => a.startsWith('openrouter/')));
  });

  test('ни одного ключа — «недоступно», в сеть не ходим', async () => {
    const p = phone((c) => ok(c), {});
    const r = await p.ai.run(ECHO, 'вопрос');
    assert.equal(r.status, 'unavailable');
    assert.equal(p.net.calls.length, 0);
  });

  test('сервис упёрся в лимит — спрашиваем следующий и не трогаем этот до времени, которое он назвал', async () => {
    const p = phone((c) => (c.provider === 'gemini' ? { status: 429, headers: { 'retry-after': '3600' }, body: { error: { code: 429, status: 'RESOURCE_EXHAUSTED' } } } : ok(c, 'OK')));
    const first = await p.ai.run(ECHO, 'вопрос');
    assert.equal(first.status === 'ok' && first.provider, 'openrouter');
    assert.equal(p.stored.pauses['gemini/gemini-flash-lite-latest'].until, T0 + HOUR, 'лимит у модели');
    // Минутный лимит у модели — следующая модель Gemini может ответить.
    assert.deepEqual(p.net.asked.slice(0, 2), ['gemini/gemini-flash-lite-latest', 'gemini/gemini-3.5-flash-lite']);
  });

  test('после перезапуска пауза помнится; кончилась — снова спрашиваем по приоритету', async () => {
    let geminiDown = true;
    const p = phone((c) => (c.provider === 'gemini' && geminiDown ? { status: 429, headers: { 'retry-after': '600' } } : ok(c)), { gemini: 'g', huggingface: 'h' }, { modelsPerProvider: 1 });
    await p.ai.run(ECHO, '1');
    assert.deepEqual(p.net.asked, ['gemini/gemini-flash-lite-latest', 'huggingface/meta-llama/Llama-3.3-70B-Instruct']);
    p.restart();
    p.clock.now = T0 + 5 * MINUTE;
    await p.ai.run(ECHO, '2');
    assert.deepEqual(p.net.asked.slice(2), ['gemini/gemini-3.5-flash-lite', 'huggingface/meta-llama/Llama-3.3-70B-Instruct'], 'модель на паузе даже не спрашиваем — только следующую');
    p.clock.now = T0 + 10 * MINUTE;
    geminiDown = false;
    await p.ai.run(ECHO, '3');
    assert.deepEqual(p.net.asked.slice(4), ['gemini/gemini-flash-lite-latest'], 'пауза кончилась — основная модель Gemini снова первая');
    assert.deepEqual(Object.keys(p.stored.pauses), ['gemini/gemini-3.5-flash-lite'], 'ответившая модель прощена, у другой пауза ещё идёт');
  });

  test('модель убрали — следующая модель того же сервиса; убранную неделю не трогаем', async () => {
    const p = phone((c) => (c.model === 'gemini-flash-lite-latest' ? { status: 404, body: { error: { code: 404, status: 'NOT_FOUND' } } } : ok(c)), { gemini: 'g' });
    const r = await p.ai.run(ECHO, '1');
    assert.equal(r.status === 'ok' && r.model, 'gemini-3.5-flash-lite');
    assert.equal(p.stored.pauses['gemini/gemini-flash-lite-latest'].until, T0 + 7 * DAY);
    await p.ai.run(ECHO, '2');
    assert.deepEqual(p.net.asked, ['gemini/gemini-flash-lite-latest', 'gemini/gemini-3.5-flash-lite', 'gemini/gemini-3.5-flash-lite']);
  });

  test('неверный ключ или страна не поддерживается — весь сервис на неделю, другие его модели не перебираем', async () => {
    for (const body of [
      { error: { code: 400, status: 'INVALID_ARGUMENT', message: 'API key not valid.' } },
      { error: { code: 400, status: 'FAILED_PRECONDITION', message: 'User location is not supported for the API use.' } },
    ]) {
      const p = phone((c) => (c.provider === 'gemini' ? { status: 400, body } : ok(c)), { gemini: 'g', huggingface: 'h' });
      const r = await p.ai.run(ECHO, '1');
      assert.equal(r.status === 'ok' && r.provider, 'huggingface');
      assert.deepEqual(p.net.asked, ['gemini/gemini-flash-lite-latest', 'huggingface/meta-llama/Llama-3.3-70B-Instruct']);
      assert.equal(p.stored.pauses.gemini.until, T0 + 7 * DAY);
    }
  });

  test('OpenRouter: дневной лимит бесплатных — на весь сервис до сброса, поминутный — только у модели', async () => {
    const reset = String(T0 + 6 * HOUR);
    const p = phone(
      (c) => {
        if (c.provider === 'openrouter-models') return { status: 500 };
        if (c.model === 'meta-llama/llama-3.3-70b-instruct:free') return { status: 429, body: { error: { code: 429, message: 'Rate limit exceeded: free-models-per-min.' } } };
        return { status: 429, body: { error: { code: 429, message: 'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day', metadata: { headers: { 'X-RateLimit-Reset': reset } } } } };
      },
      { openrouter: 'o' },
    );
    const r = await p.ai.run(ECHO, '1');
    assert.equal(r.status, 'unavailable');
    assert.deepEqual(p.net.asked, ['openrouter/meta-llama/llama-3.3-70b-instruct:free', 'openrouter/google/gemma-3-27b-it:free']);
    assert.equal(p.stored.pauses['openrouter/meta-llama/llama-3.3-70b-instruct:free'].until, T0 + 15 * MINUTE);
    assert.equal(p.stored.pauses.openrouter.until, T0 + 6 * HOUR);
  });

  test('Hugging Face: кредиты кончились — сервис на паузе', async () => {
    const p = phone(() => ({ status: 402, body: { error: 'You have exceeded your monthly included credits for Inference Providers.' } }), { huggingface: 'h' });
    assert.equal((await p.ai.run(ECHO, '1')).status, 'unavailable');
    assert.equal(p.stored.pauses.huggingface.reason, 'credits');
    assert.equal(p.net.calls.length, 1);
  });

  test('сбой сервиса — пауза растёт с каждым разом; ответил — счётчик сброшен', async () => {
    let down = true;
    const p = phone((c) => (down ? { status: 503, body: { error: { code: 503, status: 'UNAVAILABLE' } } } : ok(c)), { huggingface: 'h' });
    await p.ai.run(ECHO, '1');
    assert.equal(p.stored.pauses.huggingface.until, T0 + 5 * MINUTE);
    p.clock.now = T0 + 6 * MINUTE;
    await p.ai.run(ECHO, '2');
    assert.equal(p.stored.pauses.huggingface.until, p.clock.now + 10 * MINUTE);
    assert.equal(p.stored.pauses.huggingface.strikes, 2);
    p.clock.now += 11 * MINUTE;
    down = false;
    assert.equal((await p.ai.run(ECHO, '3')).status, 'ok');
    assert.equal(p.stored.pauses.huggingface, undefined);
  });

  test('не ответил вовремя — следующий сервис, этот на паузе', async () => {
    const p = phone((c) => (c.provider === 'gemini' ? 'hang' : ok(c)), { gemini: 'g', huggingface: 'h' }, { timeoutMs: 20 });
    const r = await p.ai.run(ECHO, '1');
    assert.equal(r.status === 'ok' && r.provider, 'huggingface');
    assert.equal(p.stored.pauses.gemini.reason, 'timeout');
  });

  test('нет сети — идём дальше, но паузу не ставим: появится сеть — спросим', async () => {
    const p = phone(() => 'offline');
    const r = await p.ai.run(ECHO, '1');
    assert.equal(r.status, 'unavailable');
    assert.ok(r.attempts.some((a) => a.outcome === 'network'));
    assert.deepEqual(p.stored.pauses, {});
    assert.equal(p.saves, 0, 'ничего не изменилось — не сохраняем');
  });

  test('ответ не по делу — пробуем другую модель и сервис; не по делу у всех — «бесполезно»', async () => {
    const p = phone((c) => (c.provider === 'huggingface' ? ok(c, 'OK hf') : ok(c, 'Извините, не могу помочь')), { gemini: 'g', huggingface: 'h' });
    const r = await p.ai.run(ECHO, '1');
    assert.equal(r.status === 'ok' && r.provider, 'huggingface');
    assert.equal(p.net.asked.filter((a) => a.startsWith('gemini/')).length, 3, 'три модели Gemini');
    assert.deepEqual(p.stored.pauses, {}, 'за ответ не по делу не наказываем');

    const q = phone((c) => ok(c, 'нет'), { gemini: 'g', huggingface: 'h' });
    const all = await q.ai.run(ECHO, '1');
    assert.equal(all.status, 'unusable');
  });

  test('ответ не по делу у одного, а остальные недоступны — тоже «бесполезно» (повторять нет смысла)', async () => {
    const p = phone((c) => (c.provider === 'gemini' ? ok(c, 'нет') : { status: 429 }), { gemini: 'g', huggingface: 'h' }, { modelsPerProvider: 1 });
    assert.equal((await p.ai.run(ECHO, '1')).status, 'unusable');
  });

  test(`за один вопрос — не больше трёх моделей одного сервиса`, async () => {
    const p = phone(() => ({ status: 404 }), { gemini: 'g' });
    await p.ai.run(ECHO, '1');
    assert.equal(p.net.calls.length, 3);
    await p.ai.run(ECHO, '2');
    assert.equal(p.net.calls.length, 4, 'в следующий раз — оставшаяся четвёртая');
    await p.ai.run(ECHO, '3');
    assert.equal(p.net.calls.length, 4, 'все модели на паузе — сервис не трогаем');
  });

  test('все сервисы на паузе — сразу «недоступно», без запросов', async () => {
    const p = phone(() => ({ status: 401 }));
    p.net.respond = (c) => (c.provider === 'openrouter-models' ? { status: 500 } : { status: 401 });
    await p.ai.run(ECHO, '1');
    const before = p.net.calls.length;
    const r = await p.ai.run(ECHO, '2');
    assert.equal(r.status, 'unavailable');
    assert.equal(p.net.calls.length, before);
    assert.ok(r.attempts.every((a) => a.outcome === 'paused'));
  });
});

describe('свежие бесплатные модели OpenRouter', () => {
  const models = { data: [{ id: 'new/fresh:free' }, { id: 'meta-llama/llama-3.3-70b-instruct:free' }, { id: 'paid/model' }] };

  test('список берём у сервиса раз в неделю и спрашиваем по нему', async () => {
    const p = phone((c) => (c.provider === 'openrouter-models' ? { status: 200, body: models } : ok(c)), { openrouter: 'o' });
    await p.ai.run(ECHO, '1');
    assert.deepEqual(p.net.asked, ['openrouter/meta-llama/llama-3.3-70b-instruct:free']);
    assert.deepEqual(p.stored.models.openrouter, { list: ['meta-llama/llama-3.3-70b-instruct:free', 'new/fresh:free'], at: T0 });
    p.restart();
    p.clock.now = T0 + DAY;
    await p.ai.run(ECHO, '2');
    assert.equal(p.net.calls.filter((c) => c.provider === 'openrouter-models').length, 1, 'через день — из памяти');
    p.clock.now = T0 + MODEL_LIST_TTL + 1;
    await p.ai.run(ECHO, '3');
    assert.equal(p.net.calls.filter((c) => c.provider === 'openrouter-models').length, 2, 'через неделю — обновили');
    assert.equal(p.net.calls.find((c) => c.provider === 'openrouter-models')!.headers.authorization, undefined, 'список моделей — без ключа');
  });

  test('список не получили — берём прошлый или встроенный', async () => {
    const p = phone((c) => (c.provider === 'openrouter-models' ? 'offline' : ok(c)), { openrouter: 'o' });
    const r = await p.ai.run(ECHO, '1');
    assert.equal(r.status === 'ok' && r.model, PROVIDERS.openrouter.models[0]);
  });

  test('модель из списка пропала — в следующий раз список обновим', async () => {
    let gone = true;
    const p = phone(
      (c) => (c.provider === 'openrouter-models' ? { status: 200, body: models } : gone && c.model === 'meta-llama/llama-3.3-70b-instruct:free' ? { status: 404, body: { error: { code: 404, message: 'No endpoints found' } } } : ok(c)),
      { openrouter: 'o' },
    );
    const r = await p.ai.run(ECHO, '1');
    assert.equal(r.status === 'ok' && r.model, 'new/fresh:free');
    assert.equal(p.stored.models.openrouter!.at, 0);
    gone = false;
    await p.ai.run(ECHO, '2');
    assert.equal(p.net.calls.filter((c) => c.provider === 'openrouter-models').length, 2);
  });
});

describe('хранение состояния', () => {
  test('битое или чужое состояние — выбрасываем непонятное', () => {
    assert.deepEqual(sanitizeState(null), { pauses: {}, models: {} });
    assert.deepEqual(sanitizeState('мусор'), { pauses: {}, models: {} });
    assert.deepEqual(
      sanitizeState({
        pauses: { gemini: { until: T0, strikes: 2, reason: 'rate-limit' }, bad: { until: 'завтра', strikes: 1, reason: 'rate-limit' }, odd: { until: T0, strikes: 1, reason: 'лень' } },
        models: { openrouter: { list: ['a:free'], at: T0 }, nobody: { list: ['x'], at: T0 }, huggingface: { list: [1], at: T0 } },
      }),
      { pauses: { gemini: { until: T0, strikes: 2, reason: 'rate-limit' } }, models: { openrouter: { list: ['a:free'], at: T0 } } },
    );
  });

  test('хранилище не читается — работаем как с чистого листа', async () => {
    const net = new Net((c) => ok(c));
    const ai = createAi({ keys: { gemini: 'g' }, fetch: net.fetch, now: () => T0, load: () => Promise.reject(new Error('диск')), save: async () => {} });
    assert.equal((await ai.run(ECHO, '1')).status, 'ok');
  });

  test('давно кончившиеся паузы выбрасываются', async () => {
    const p = phone((c) => ok(c), { huggingface: 'h' });
    p.net.respond = () => ({ status: 503 });
    await p.ai.run(ECHO, '1');
    p.clock.now = T0 + 3 * DAY;
    p.net.respond = () => ({ status: 401 });
    await p.ai.run(ECHO, '2');
    assert.deepEqual(Object.keys(p.stored.pauses), ['huggingface']);
    assert.equal(p.stored.pauses.huggingface.reason, 'auth');
  });
});
