/// <reference types="node" />
// Пол определяется сам при каждом запуске, по ступеням: своя база → Genderize → ИИ телефона → облачный ИИ.
// Каждую ступень про человека спрашиваем один раз; ручной выбор главнее всего. Здесь — подставной интернет,
// подставной ИИ телефона и облачный ИИ, и «телефон», который запускают много раз подряд, с перезаписью данных.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createAi } from '../ai/router';
import type { AiFetch, AiResult, AiRunner, AiTask } from '../ai/types';
import { genderOnSave } from '../gender';
import {
  AI_BATCH,
  BACKOFF_RATE_LIMIT,
  BACKOFF_REFUSED,
  BACKOFF_SERVER,
  GENDER_TASK,
  PASS_LIMITS,
  applyGenderUpdate,
  createGenderSync,
  devicePrompt,
  genderPass,
  genderPending,
  genderPrompt,
  genderizeUrl,
  parseDeviceAnswer,
  parseGenderAnswer,
  parseGenderize,
  type DeviceAiStatus,
  type GenderDeps,
  type GenderSubject,
  retractUnisexGuess,
} from '../genderDetect';
import { normalizeData } from '../storage';
import type { Friend } from '../types';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 10, 8, 9);

const friend = (id: string, name: string, extra: Partial<Friend> = {}): Friend => ({
  id,
  name,
  emoji: '🙂',
  birthday: null,
  phone: '',
  food: '',
  flowers: '',
  gifts: '',
  notes: '',
  dates: [],
  createdAt: 0,
  ...extra,
});

/** Латинские «имена», которых нет в своей базе: Ab, Ac, … — чтобы набрать сколько угодно разных. */
const latinName = (i: number) => `Q${String.fromCharCode(97 + Math.floor(i / 26) % 26)}${String.fromCharCode(97 + (i % 26))}`;

type Reply = { status: number; body?: unknown } | 'offline';

/** Подставной Genderize: отвечает из словаря; все запросы и все отвеченные имена записываются. */
class Net {
  calls: { url: string }[] = [];
  /** Имя (строчными) → пол, в котором Genderize уверен. Нет в словаре — «не знаю». */
  genderize = new Map<string, 'f' | 'm'>();
  genderizeReply: Reply | null = null;
  /** Сколько раз сервис ОТВЕТИЛ про имя — это и есть «спросили». */
  answered = { genderize: new Map<string, number>() };

  fetch: GenderDeps['fetch'] = async (url) => {
    this.calls.push({ url });
    const reply = this.answerGenderize(url);
    if (reply === 'offline') throw new TypeError('Network request failed');
    return { ok: reply.status >= 200 && reply.status < 300, status: reply.status, json: async () => reply.body };
  };

  get genderizeCalls() {
    return this.calls;
  }
  /** Самый частый ответ про одно имя — должен быть не больше 1. */
  maxAnswered(service: 'genderize') {
    return Math.max(0, ...this.answered[service].values());
  }

  private answerGenderize(url: string): Reply {
    if (this.genderizeReply) return this.genderizeReply;
    const names = genderizeNames(url);
    for (const n of names) this.answered.genderize.set(n.toLowerCase(), (this.answered.genderize.get(n.toLowerCase()) ?? 0) + 1);
    return {
      status: 200,
      body: names.map((name) => {
        const g = this.genderize.get(name.toLowerCase());
        return g ? { name, gender: g === 'f' ? 'female' : 'male', probability: 0.99, count: 500 } : { name, gender: 'male', probability: 0.6, count: 900 };
      }),
    };
  }
}

const genderizeNames = (url: string) => new URL(url).searchParams.getAll('name[]');
const genderizeCountry = (url: string) => new URL(url).searchParams.get('country_id');

/**
 * Подставной облачный ИИ (вместо модуля src/lib/ai): отвечает из словаря, записывает, про какие имена спрашивали.
 * Сам модуль — с сервисами, запасными вариантами и паузами — проверяется в ai.test.ts.
 */
class FakeAi implements AiRunner {
  /** Имя (строчными) → пол. Нет в словаре — «u». */
  answers = new Map<string, 'f' | 'm'>();
  mode: 'ok' | 'unusable' | 'unavailable' | 'throw' = 'ok';
  asked: string[][] = [];
  prompts: string[] = [];
  answered = new Map<string, number>();
  async run<I, O>(task: AiTask<I, O>, input: I): Promise<AiResult<O>> {
    const names = input as unknown as string[];
    this.asked.push(names);
    this.prompts.push(task.request(input).prompt);
    if (this.mode === 'throw') throw new Error('сбой');
    if (this.mode === 'unavailable') return { status: 'unavailable', attempts: [] };
    if (this.mode === 'unusable') return { status: 'unusable', attempts: [] };
    for (const n of names) this.answered.set(n.toLowerCase(), (this.answered.get(n.toLowerCase()) ?? 0) + 1);
    const text = JSON.stringify({ answers: names.map((n, i) => ({ i, g: this.answers.get(n.toLowerCase()) ?? 'u' })) });
    const value = task.parse(text, input);
    return value === null ? { status: 'unusable', attempts: [] } : { status: 'ok', value, provider: 'gemini', model: 'test', attempts: [] };
  }
  maxAnswered() {
    return Math.max(0, ...this.answered.values());
  }
}

/** Подставной ИИ телефона. */
class Device {
  state: DeviceAiStatus | 'broken' = 'available';
  answers = new Map<string, string>();
  failOn = new Set<string>();
  asked: string[] = [];
  api = {
    status: async (): Promise<DeviceAiStatus> => {
      if (this.state === 'broken') throw new Error('нет сервиса');
      return this.state;
    },
    generate: async (prompt: string) => {
      const name = /«(.+?)»/.exec(prompt)![1];
      this.asked.push(name);
      if (this.failOn.has(name)) throw new Error('модель занята');
      return this.answers.get(name.toLowerCase()) ?? 'Неизвестно';
    },
  };
}

/**
 * «Телефон»: друзья хранятся как JSON и при каждом запуске читаются заново (как после перезапуска приложения),
 * паузы сервисов — отдельно. Запуск = чтение → фоновый проход → применение → запись.
 */
class Phone {
  private stored: string;
  backoff = '{}';
  now = T0;
  constructor(
    friends: Friend[],
    readonly deps: GenderDeps,
  ) {
    this.stored = JSON.stringify({ friends });
  }
  get friends(): Friend[] {
    return normalizeData(JSON.parse(this.stored)).friends;
  }
  private write(friends: Friend[]) {
    this.stored = JSON.stringify({ friends });
  }
  async launch() {
    const friends = this.friends;
    const sync = createGenderSync({
      deps: this.deps,
      load: async () => JSON.parse(this.backoff),
      save: async (b) => void (this.backoff = JSON.stringify(b)),
      now: () => this.now,
    });
    const names = new Map(friends.map((f) => [f.id, f.name]));
    const updates = await sync.run(friends);
    const byId = new Map(updates.map((u) => [u.id, u]));
    this.write(friends.map((f) => applyGenderUpdate(f, byId.get(f.id), names.get(f.id))));
    return updates;
  }
  /** Сохранить друга так, как это делает форма (через genderOnSave). */
  edit(id: string, change: (f: Friend) => Friend) {
    this.write(this.friends.map((f) => (f.id === id ? genderOnSave(f, change(f)) : f)));
  }
  add(f: Friend) {
    this.write([...this.friends, genderOnSave(undefined, f)]);
  }
  get(id: string) {
    return this.friends.find((f) => f.id === id)!;
  }
  /** id → [пол, кто определил, ступень]. */
  state() {
    return Object.fromEntries(this.friends.map((f) => [f.id, [f.gender ?? null, f.genderBy ?? null, f.genderStage ?? null]]));
  }
  get pause() {
    return JSON.parse(this.backoff) as { genderize?: number };
  }
}

const setup = (friends: Friend[], opts: { ai?: boolean; device?: boolean } = {}) => {
  const net = new Net();
  const device = new Device();
  const ai = new FakeAi();
  const phone = new Phone(friends, { fetch: net.fetch, ai: opts.ai ? ai : undefined, deviceAi: opts.device ? device.api : undefined });
  return { net, device, ai, phone };
};

describe('разбор ответов', () => {
  test('Genderize: берём только уверенные ответы по многим людям', () => {
    const r = parseGenderize([
      { name: 'Алуа', gender: 'female', probability: 0.99, count: 1200 },
      { name: 'Саша', gender: 'male', probability: 0.62, count: 9000 },
      { name: 'Редкое', gender: 'female', probability: 1, count: 3 },
      { name: 'Пусто', gender: null, probability: 0, count: 0 },
      'мусор',
    ]);
    assert.deepEqual([...r], [
      ['алуа', 'f'],
      ['саша', null],
      ['редкое', null],
      ['пусто', null],
    ]);
    assert.deepEqual([...parseGenderize({ name: 'Ерлан', gender: 'male', probability: 0.98, count: 400 })], [['ерлан', 'm']]);
    assert.deepEqual([...parseGenderize(null)], []);
    assert.deepEqual([...parseGenderize('<html>')], []);
  });

  test('адрес Genderize: имена закодированы, страна — если знаем', () => {
    assert.equal(genderizeUrl(['Алуа', 'Саша'], 'KZ'), `https://api.genderize.io?name[]=${encodeURIComponent('Алуа')}&name[]=${encodeURIComponent('Саша')}&country_id=KZ`);
    assert.ok(!genderizeUrl(['A']).includes('country_id'));
    assert.deepEqual(genderizeNames(genderizeUrl(['Анна-Мария', 'O&Neil'])), ['Анна-Мария', 'O&Neil'], 'спецсимволы не ломают адрес');
  });

  test('ответ ИИ: {"answers":[…]} или просто массив; «u», чужие номера и мусор — «не знаем»; непонятный ответ — null', () => {
    const text = (list: unknown) => JSON.stringify({ answers: list });
    assert.deepEqual([...parseGenderAnswer(text([{ i: 0, g: 'f' }, { i: 1, g: 'u' }, { i: 2, g: 'M' }, { i: 9, g: 'f' }, { i: 'x', g: 'm' }, null]), 3)!], [
      [0, 'f'],
      [2, 'm'],
    ]);
    assert.deepEqual([...parseGenderAnswer('[{"i":0,"g":"m"}]', 1)!], [[0, 'm']], 'массив без обёртки');
    assert.deepEqual([...parseGenderAnswer('```json\n{"answers":[{"i":"0","g":"f"}]}\n```', 1)!], [[0, 'f']], 'номер строкой и ``` не мешают');
    assert.deepEqual([...parseGenderAnswer('<think>Саша — неясно</think>{"answers":[{"i":0,"g":"u"}]}', 1)!], [], 'рассуждения модели не мешают');
    assert.equal(parseGenderAnswer('не JSON', 1), null);
    assert.equal(parseGenderAnswer('{"i":0}', 1), null, 'нет списка');
    assert.equal(parseGenderAnswer('', 1), null);
  });

  test('вопрос ИИ: имена пронумерованы, просим JSON и не угадывать; сервисы по приоритету — Gemini первый', () => {
    const req = GENDER_TASK.request(['Алуашка', 'Саша']);
    assert.equal(req.prompt, genderPrompt(['Алуашка', 'Саша']));
    assert.match(req.prompt, /0: Алуашка\n1: Саша$/);
    assert.match(req.prompt, /Не угадывай/);
    assert.equal(req.json, true);
    assert.equal(req.temperature, 0);
    assert.deepEqual(GENDER_TASK.providers, ['gemini', 'openrouter']);
  });

  test('ответ встроенного ИИ одним словом', () => {
    assert.equal(parseDeviceAnswer('Женщина'), 'f');
    assert.equal(parseDeviceAnswer('мужчина.'), 'm');
    assert.equal(parseDeviceAnswer('Female'), 'f');
    assert.equal(parseDeviceAnswer('male'), 'm');
    assert.equal(parseDeviceAnswer('Неизвестно'), null);
    assert.equal(parseDeviceAnswer('Не знаю'), null);
    assert.equal(parseDeviceAnswer('женщина или мужчина'), null, 'оба — не знаем');
    assert.equal(parseDeviceAnswer(''), null);
    assert.match(devicePrompt('Алуашка'), /«Алуашка»/);
  });
});

describe('кому ещё нужно определять', () => {
  test('нет пола, не выбран вручную и ступени не кончились', () => {
    assert.equal(genderPending({}), true);
    assert.equal(genderPending({ genderStage: 'names' }), true);
    assert.equal(genderPending({ genderStage: 'genderize' }), true);
    assert.equal(genderPending({ genderStage: 'device-ai' }), true);
    assert.equal(genderPending({ genderStage: 'ai' }), false, 'все ступени пройдены — выбирает человек');
    assert.equal(genderPending({ gender: 'f', genderBy: 'names' }), false);
    assert.equal(genderPending({ genderBy: 'manual' }), false, '«Не указан» вручную');
    assert.equal(genderPending({ gender: 'm', genderBy: 'manual' }), false);
  });
});

describe('своя база — без интернета', () => {
  test('уверенные имена определяются сразу, в интернет ничего не уходит', async () => {
    const { net, phone } = setup([friend('a', 'Аня'), friend('b', 'Иван Петров'), friend('c', 'Мама'), friend('d', 'Саша Иванова'), friend('e', 'Дядя Женя')], { ai: true });
    await phone.launch();
    assert.equal(net.calls.length, 0);
    assert.deepEqual(phone.state(), {
      a: ['f', 'names', null],
      b: ['m', 'names', null],
      c: ['f', 'names', null],
      d: ['f', 'names', null],
      e: ['m', 'names', null],
    });
  });

  test('Саша, Женя, Валя, Ника сами по себе — сразу «загадка»: ни в Genderize, ни в ИИ не отправляем', async () => {
    const { net, ai, phone } = setup(
      [friend('s', 'Саша'), friend('z', 'Женя'), friend('v', 'Валя'), friend('n', 'Ника'), friend('k', 'Алуашка', { phone: '+7 707 111 22 33' })],
      { ai: true },
    );
    net.genderize.set('алуашка', 'f');
    await phone.launch();
    assert.deepEqual(phone.state(), {
      s: [null, null, 'ai'],
      z: [null, null, 'ai'],
      v: [null, null, 'ai'],
      n: [null, null, 'ai'],
      k: ['f', 'genderize', null],
    });
    assert.deepEqual(net.genderizeCalls.flatMap((c) => genderizeNames(c.url)), ['Алуашка']);
    assert.deepEqual(ai.asked, []);
  });

  test('угаданный раньше по такому имени пол снимаем — снова «загадка»; база, ручной выбор и имя с признаком — как были', () => {
    const pick = (f: GenderSubject) => [f.gender ?? null, f.genderBy ?? null, f.genderStage ?? null];
    assert.deepEqual(pick(retractUnisexGuess(friend('v', 'Валя', { gender: 'f', genderBy: 'genderize' }))), [null, null, 'ai']);
    assert.deepEqual(pick(retractUnisexGuess(friend('n', 'Ника', { gender: 'f', genderBy: 'ai' }))), [null, null, 'ai']);
    assert.deepEqual(pick(retractUnisexGuess(friend('w', 'Сантехник Валя', { gender: 'm', genderBy: 'device-ai' }))), [null, null, 'ai']);
    assert.deepEqual(pick(retractUnisexGuess(friend('a', 'Валя', { gender: 'f', genderBy: 'manual' }))), ['f', 'manual', null]);
    assert.deepEqual(pick(retractUnisexGuess(friend('b', 'Валя Сидорова', { gender: 'f', genderBy: 'genderize' }))), ['f', 'genderize', null]);
    assert.deepEqual(pick(retractUnisexGuess(friend('c', 'Алуашка', { gender: 'f', genderBy: 'genderize' }))), ['f', 'genderize', null]);
  });

  test('база пополнилась в новой версии — ждущих проверяем ею снова, без интернета', async () => {
    // «Анна» уже прошла Genderize (например, раньше база её не знала) — теперь база знает, сеть не нужна.
    const { net, phone } = setup([friend('a', 'Анна', { genderStage: 'genderize' }), friend('b', 'Иван', { genderStage: 'device-ai' })], { ai: true });
    await phone.launch();
    assert.equal(net.calls.length, 0);
    assert.deepEqual(phone.state(), { a: ['f', 'names', null], b: ['m', 'names', null] });
  });

  test('ни имени, ни подписи (эмодзи, цифры) — никуда не отправляем, сразу «выбери сам»', async () => {
    const { net, device, phone } = setup([friend('x', '🙂'), friend('y', '12345'), friend('z', '—')], { ai: true, device: true });
    await phone.launch();
    assert.equal(net.calls.length, 0);
    assert.equal(device.asked.length, 0);
    assert.deepEqual(phone.state(), { x: [null, null, 'ai'], y: [null, null, 'ai'], z: [null, null, 'ai'] });
  });
});

describe('Genderize', () => {
  test('уходит только имя и страна по коду номера: без фамилии, роли и самого номера', async () => {
    const { net, phone } = setup([
      friend('a', 'Ардак Пак', { phone: '+7 707 606 39 03' }),
      friend('b', 'Нурай Сантехник', { phone: '+7 999 123-45-67' }),
      friend('c', 'Еркеш Шевченко', { phone: '+380501234567' }),
      friend('d', 'John Smith'),
    ]);
    await phone.launch();
    const sent = net.genderizeCalls.map((c) => [genderizeCountry(c.url), genderizeNames(c.url)]);
    assert.deepEqual(sent.sort(), [
      [null, ['John']],
      ['KZ', ['Ардак']],
      ['RU', ['Нурай']],
      ['UA', ['Еркеш']],
    ]);
    const all = net.calls.map((c) => decodeURIComponent(c.url)).join(' ');
    for (const secret of ['Пак', 'Сантехник', 'Шевченко', 'Smith', '606', '999', '50123']) assert.ok(!all.includes(secret), `«${secret}» не должно уходить`);
  });

  test('одинаковые имена — один раз; по 10 имён в запросе', async () => {
    const list = [friend('s1', 'Ардак Пак'), friend('s2', 'Ардак Цой'), friend('s3', 'Ардак'), ...Array.from({ length: 12 }, (_, i) => friend(`l${i}`, latinName(i)))];
    const { net, phone } = setup(list);
    await phone.launch();
    assert.deepEqual(net.genderizeCalls.map((c) => genderizeNames(c.url).length), [10, 3]);
    assert.equal(net.answered.genderize.get('ардак'), 1);
    assert.deepEqual([phone.get('s1').genderStage, phone.get('s2').genderStage, phone.get('s3').genderStage], ['genderize', 'genderize', 'genderize']);
  });

  test(`за один запуск — не больше ${PASS_LIMITS.genderize} имён (бесплатный лимит в день), остальные — в следующий`, async () => {
    const { net, phone } = setup(Array.from({ length: 150 }, (_, i) => friend(`n${i}`, latinName(i))));
    await phone.launch();
    assert.equal(net.answered.genderize.size, 100);
    assert.equal(net.genderizeCalls.length, 10);
    await phone.launch();
    assert.equal(net.answered.genderize.size, 150);
    await phone.launch();
    assert.equal(net.genderizeCalls.length, 15, 'третий запуск — никого');
    assert.equal(net.maxAnswered('genderize'), 1);
    assert.ok(phone.friends.every((f) => f.genderStage === 'genderize'));
  });

  test('ответил «не знаю» — второй раз не спрашиваем, сколько ни запускай', async () => {
    const { net, phone } = setup([friend('s', 'Ардак')]);
    for (let i = 0; i < 5; i++) await phone.launch();
    assert.equal(net.genderizeCalls.length, 1);
    assert.deepEqual(phone.state(), { s: [null, null, 'genderize'] });
  });

  test('нет сети — никого не отмечаем и паузу не ставим: спросим при следующем запуске', async () => {
    const { net, phone } = setup([friend('k', 'Алуашка')]);
    net.genderize.set('алуашка', 'f');
    net.genderizeReply = 'offline';
    await phone.launch();
    assert.deepEqual(phone.state(), { k: [null, null, 'names'] });
    assert.deepEqual(phone.pause, {});
    net.genderizeReply = null;
    await phone.launch();
    assert.deepEqual(phone.state(), { k: ['f', 'genderize', null] });
  });

  test('лимит (429) — пауза на сутки, никого не отмечаем; потом продолжаем', async () => {
    const { net, phone } = setup([friend('k', 'Алуашка')]);
    net.genderize.set('алуашка', 'f');
    net.genderizeReply = { status: 429, body: { error: 'Request limit reached' } };
    await phone.launch();
    assert.equal(phone.pause.genderize, T0 + BACKOFF_RATE_LIMIT);
    assert.deepEqual(phone.state(), { k: [null, null, 'names'] });
    net.genderizeReply = null;
    phone.now = T0 + 23 * HOUR;
    await phone.launch();
    assert.equal(net.genderizeCalls.length, 1, 'на паузе не ходим');
    phone.now = T0 + DAY;
    await phone.launch();
    assert.deepEqual(phone.state(), { k: ['f', 'genderize', null] });
  });

  for (const status of [401, 402, 403]) {
    test(`отказ (${status}) — пауза на неделю`, async () => {
      const { net, phone } = setup([friend('s', 'Ардак')]);
      net.genderizeReply = { status, body: { error: 'no' } };
      await phone.launch();
      assert.equal(phone.pause.genderize, T0 + BACKOFF_REFUSED);
      assert.deepEqual(phone.state(), { s: [null, null, 'names'] });
    });
  }

  test('сбой сервиса (5xx) — пауза на час, чтобы не дёргать его при каждом открытии', async () => {
    const { net, phone } = setup([friend('s', 'Ардак')]);
    net.genderizeReply = { status: 503 };
    await phone.launch();
    assert.equal(phone.pause.genderize, T0 + BACKOFF_SERVER);
    phone.now = T0 + 30 * 60_000;
    await phone.launch();
    assert.equal(net.genderizeCalls.length, 1);
  });

  test('в ответе нет нашего имени или ответ непонятный — не считаем, что спросили', async () => {
    const { net, phone } = setup([friend('s', 'Ардак')]);
    net.genderizeReply = { status: 200, body: [] };
    await phone.launch();
    net.genderizeReply = { status: 200, body: '<html>' };
    await phone.launch();
    assert.deepEqual(phone.state(), { s: [null, null, 'names'] });
    net.genderizeReply = null;
    await phone.launch();
    assert.deepEqual(phone.state(), { s: [null, null, 'genderize'] });
  });

  test('ошибка на второй пачке — первая засчитана, вторую спросим потом', async () => {
    const { net, phone } = setup(Array.from({ length: 15 }, (_, i) => friend(`n${i}`, latinName(i))));
    const real = net.fetch;
    let n = 0;
    phone.deps.fetch = async (url, init) => (++n === 2 ? Promise.reject(new TypeError('offline')) : real(url, init));
    await phone.launch();
    const stages = phone.friends.map((f) => f.genderStage);
    assert.equal(stages.filter((s) => s === 'genderize').length, 10);
    assert.equal(stages.filter((s) => s === 'names').length, 5);
    await phone.launch();
    assert.ok(phone.friends.every((f) => f.genderStage === 'genderize'));
    assert.equal(net.maxAnswered('genderize'), 1);
  });
});

describe('ИИ: сначала телефона, потом облачный', () => {
  test('ИИ телефона понял — облачный не спрашиваем', async () => {
    const { ai, device, phone } = setup([friend('k', 'Алуашка')], { ai: true, device: true });
    device.answers.set('алуашка', 'Женщина');
    await phone.launch();
    assert.deepEqual(phone.state(), { k: ['f', 'device-ai', null] });
    assert.equal(ai.asked.length, 0);
  });

  test('ИИ телефона не понял — спрашиваем облачный; не понял и он — больше никого не спрашиваем', async () => {
    const { net, ai, device, phone } = setup([friend('s', 'Ардак')], { ai: true, device: true });
    await phone.launch();
    assert.deepEqual(phone.state(), { s: [null, null, 'ai'] });
    for (let i = 0; i < 4; i++) await phone.launch();
    assert.equal(net.calls.length, 1, 'Genderize — один раз');
    assert.deepEqual(device.asked, ['Ардак'], 'ИИ телефона — один раз');
    assert.deepEqual(ai.asked, [['Ардак']], 'облачный ИИ — один раз');
  });

  test('ИИ телефона не понял, а облачный понял', async () => {
    const { ai, phone } = setup([friend('k', 'Алуашка')], { ai: true, device: true });
    ai.answers.set('алуашка', 'f');
    await phone.launch();
    assert.deepEqual(phone.state(), { k: ['f', 'ai', null] });
  });

  for (const state of ['unavailable', 'downloadable', 'downloading', 'broken'] as const) {
    test(`ИИ телефона ${state} — сразу облачный, ступень ИИ телефона не отмечаем`, async () => {
      const { ai, device, phone } = setup([friend('k', 'Алуашка'), friend('s', 'Ардак')], { ai: true, device: true });
      device.state = state;
      ai.answers.set('алуашка', 'f');
      await phone.launch();
      assert.equal(device.asked.length, 0);
      assert.deepEqual(phone.state(), { k: ['f', 'ai', null], s: [null, null, 'ai'] });
    });
  }

  test('ИИ телефона ещё не скачан, а облачный недоступен — ждём, потом спросим ИИ телефона', async () => {
    const { ai, device, phone } = setup([friend('k', 'Алуашка')], { ai: true, device: true });
    device.state = 'downloading';
    ai.mode = 'unavailable';
    await phone.launch();
    assert.deepEqual(phone.state(), { k: [null, null, 'genderize'] });
    device.state = 'available';
    device.answers.set('алуашка', 'женщина');
    await phone.launch();
    assert.deepEqual(phone.state(), { k: ['f', 'device-ai', null] });
    assert.equal(ai.asked.length, 1);
  });

  test('ИИ телефона сломался на человеке — не отмечаем, спрашиваем облачный', async () => {
    const { ai, device, phone } = setup([friend('k', 'Kai')], { ai: true, device: true });
    device.failOn.add('Kai');
    ai.answers.set('kai', 'm');
    await phone.launch();
    assert.deepEqual(phone.state(), { k: ['m', 'ai', null] });
  });

  test('ИИ телефона: одинаковые имена — один вопрос; в вопросе только имя', async () => {
    const { device, phone } = setup([friend('a', 'Ардак Пак'), friend('b', 'Ардак Цой'), friend('c', 'Ардак')], { device: true });
    await phone.launch();
    assert.deepEqual(device.asked, ['Ардак']);
    assert.ok(phone.friends.every((f) => f.genderStage === 'device-ai'), 'без облачного ИИ дальше не идём');
  });

  test('облачный ИИ: только имена, одинаковые — один раз', async () => {
    const { ai, phone } = setup([friend('a', 'Ардак Пак', { phone: '+7 707 606 39 03' }), friend('b', 'Ардак Цой'), friend('c', 'Нурай Сантехник')], { ai: true });
    await phone.launch();
    assert.deepEqual(ai.asked, [['Ардак', 'Нурай']]);
    for (const secret of ['Пак', 'Цой', 'Сантехник', '707']) assert.ok(!ai.prompts[0].includes(secret), secret);
  });

  test(`облачный ИИ: не больше ${PASS_LIMITS.ai} имён за запуск, по ${AI_BATCH} в вопросе`, async () => {
    const { net, ai, phone } = setup(Array.from({ length: 120 }, (_, i) => friend(`n${i}`, latinName(i))), { ai: true });
    await phone.launch(); // Genderize — 100, облачный ИИ — те же 100
    assert.deepEqual(ai.asked.map((n) => n.length), [50, 50]);
    await phone.launch(); // Genderize — 20, облачный ИИ — 20
    assert.deepEqual(ai.asked.map((n) => n.length), [50, 50, 20]);
    await phone.launch();
    assert.equal(net.calls.length + ai.asked.length, 10 + 2 + 3, 'третий запуск — никого');
    assert.equal(ai.answered.size, 120);
    assert.equal(ai.maxAnswered(), 1);
    assert.equal(net.maxAnswered('genderize'), 1);
    assert.ok(phone.friends.every((f) => f.genderStage === 'ai'));
  });

  test('облачный ИИ недоступен (нет ключей, все на паузе, нет сети) — никого не отмечаем, спросим в следующий раз', async () => {
    const { net, ai, phone } = setup([friend('k', 'Kai')], { ai: true });
    ai.mode = 'unavailable';
    await phone.launch();
    assert.deepEqual(phone.state(), { k: [null, null, 'genderize'] });
    ai.mode = 'ok';
    ai.answers.set('kai', 'm');
    await phone.launch();
    assert.deepEqual(phone.state(), { k: ['m', 'ai', null] });
    assert.equal(net.calls.length, 1, 'Genderize при этом не переспрашиваем');
  });

  test('недоступен на первой пачке — остальные пачки в этот раз не спрашиваем', async () => {
    const { ai, phone } = setup(Array.from({ length: 60 }, (_, i) => friend(`n${i}`, latinName(i))), { ai: true });
    ai.mode = 'unavailable';
    await phone.launch();
    assert.equal(ai.asked.length, 1);
    assert.ok(phone.friends.every((f) => f.genderStage === 'genderize'));
  });

  test('сбой внутри модуля ИИ — как «недоступен», проход не падает', async () => {
    const { ai, phone } = setup([friend('k', 'Kai')], { ai: true });
    ai.mode = 'throw';
    await phone.launch();
    assert.deepEqual(phone.state(), { k: [null, null, 'genderize'] });
  });

  test('облачный ИИ ответил не по делу — второй раз не спрашиваем, выбирает человек', async () => {
    const { ai, phone } = setup([friend('k', 'Kai')], { ai: true });
    ai.mode = 'unusable';
    await phone.launch();
    await phone.launch();
    assert.deepEqual(phone.state(), { k: [null, null, 'ai'] });
    assert.equal(ai.asked.length, 1);
  });

  test('без облачного ИИ и без ИИ телефона — после Genderize никуда не ходим, ждём', async () => {
    const { net, phone } = setup([friend('s', 'Ардак')]);
    for (let i = 0; i < 3; i++) await phone.launch();
    assert.equal(net.calls.length, 1);
    assert.deepEqual(phone.state(), { s: [null, null, 'genderize'] });
  });

  test('Genderize на паузе — к ИИ не перескакиваем: порядок ступеней не нарушаем', async () => {
    const { net, ai, device, phone } = setup([friend('k', 'Алуашка')], { ai: true, device: true });
    phone.backoff = JSON.stringify({ genderize: T0 + HOUR });
    await phone.launch();
    assert.equal(net.calls.length + ai.asked.length + device.asked.length, 0);
    assert.deepEqual(phone.state(), { k: [null, null, 'names'] });
  });

  test('целиком: настоящий модуль ИИ — Gemini упёрся в лимит, ответил OpenRouter, Gemini до сброса не трогаем', async () => {
    const calls: { url: string; body: string }[] = [];
    const aiFetch: AiFetch = async (url, init) => {
      const reply = (status: number, body: unknown, h: Record<string, string> = {}) => ({ status, headers: { get: (n: string) => h[n.toLowerCase()] ?? null }, text: async () => JSON.stringify(body) });
      if (url === 'https://openrouter.ai/api/v1/models') return reply(500, null); // список моделей не дали — встроенный
      calls.push({ url, body: init.body ?? '' });
      if (url.includes('generativelanguage')) return reply(429, { error: { code: 429, status: 'RESOURCE_EXHAUSTED' } }, { 'retry-after': '3600' });
      const prompt = JSON.parse(init.body!).messages.at(-1).content as string;
      const names = prompt.split('\n').filter((l) => /^\d+: /.test(l)).map((l) => l.replace(/^\d+: /, ''));
      const answers = names.map((n, i) => ({ i, g: n === 'Kai' ? 'm' : 'u' }));
      return reply(200, { choices: [{ message: { content: `Вот: ${JSON.stringify({ answers })}` } }] });
    };
    let stored: string | null = null;
    const realAi = createAi({ keys: { gemini: 'g', openrouter: 'o' }, fetch: aiFetch, now: () => T0, load: async () => (stored ? JSON.parse(stored) : null), save: async (st) => void (stored = JSON.stringify(st)), modelsPerProvider: 1 });
    const net = new Net();
    const phone = new Phone([friend('k', 'Kai'), friend('s', 'Ардак Пак', { phone: '+7 707 111 22 33' })], { fetch: net.fetch, ai: realAi });
    await phone.launch();
    assert.deepEqual(phone.state(), { k: ['m', 'ai', null], s: [null, null, 'ai'] });
    assert.deepEqual(calls.map((c) => new URL(c.url).hostname), ['generativelanguage.googleapis.com', 'openrouter.ai']);
    assert.ok(calls.every((c) => !/Пак|707/.test(c.body)), 'только имена');
    assert.ok(JSON.parse(stored!).pauses['gemini/gemini-flash-lite-latest'].until === T0 + HOUR);
  });
});

describe('ручной выбор главнее всего', () => {
  test('выбран вручную — ни одна ступень его не трогает, даже если база «не согласна»', async () => {
    const { net, device, phone } = setup(
      [friend('a', 'Ардак', { gender: 'f', genderBy: 'manual' }), friend('b', 'Еркеш', { genderBy: 'manual' }), friend('c', 'Анна', { gender: 'm', genderBy: 'manual' })],
      { ai: true, device: true },
    );
    for (let i = 0; i < 3; i++) await phone.launch();
    assert.equal(net.calls.length + device.asked.length, 0);
    assert.deepEqual(phone.state(), { a: ['f', 'manual', null], b: [null, 'manual', null], c: ['m', 'manual', null] });
  });

  test('переименовали друга с ручным полом — пол остаётся', async () => {
    const { net, phone } = setup([friend('a', 'Ардак', { gender: 'f', genderBy: 'manual' })]);
    phone.edit('a', (f) => ({ ...f, name: 'Иван' }));
    await phone.launch();
    assert.deepEqual(phone.state(), { a: ['f', 'manual', null] });
    assert.equal(net.calls.length, 0);
  });

  test('не определился → переименовали → спрашиваем заново, один раз; определённый при переименовании не трогаем', async () => {
    const { net, phone } = setup([friend('s', 'Ардак'), friend('k', 'Алуашка')]);
    net.genderize.set('алуашка', 'f');
    net.genderize.set('kai', 'm');
    await phone.launch();
    assert.deepEqual(phone.state(), { s: [null, null, 'genderize'], k: ['f', 'genderize', null] });
    phone.edit('s', (f) => ({ ...f, name: 'Kai' }));
    phone.edit('k', (f) => ({ ...f, name: 'Ардак' }));
    await phone.launch();
    await phone.launch();
    assert.deepEqual(phone.state(), { s: ['m', 'genderize', null], k: ['f', 'genderize', null] });
    assert.deepEqual(net.genderizeCalls.flatMap((c) => genderizeNames(c.url)).sort(), ['Kai', 'Алуашка', 'Ардак']);
  });

  test('выбрали вручную, пока шёл проход, — результат прохода не применяется', () => {
    const f: GenderSubject = { id: 'a', name: 'Саша', phone: '', gender: 'm', genderBy: 'manual' };
    assert.equal(applyGenderUpdate(f, { id: 'a', gender: 'f', by: 'genderize' }, 'Саша'), f);
    const none: GenderSubject = { id: 'b', name: 'Женя', phone: '', genderBy: 'manual' };
    assert.equal(applyGenderUpdate(none, { id: 'b', stage: 'ai' }, 'Женя'), none);
  });

  test('переименовали, пока шёл проход, — ответ про старое имя не применяется', () => {
    const f: GenderSubject = { id: 'a', name: 'Женя Петрова', phone: '', gender: 'f', genderBy: 'names' };
    assert.equal(applyGenderUpdate(f, { id: 'a', gender: 'm', by: 'ai' }, 'Женя'), f);
    const g: GenderSubject = { id: 'b', name: 'Kai', phone: '', genderStage: 'names' };
    assert.equal(applyGenderUpdate(g, { id: 'b', stage: 'ai' }, 'Саша'), g, 'и ступень от старого имени — тоже');
  });

  test('применение: пол — с источником и без ступени; ступень только растёт', () => {
    const f: GenderSubject = { id: 'a', name: 'Kai', phone: '', genderStage: 'genderize' };
    assert.deepEqual(applyGenderUpdate(f, { id: 'a', gender: 'm', by: 'ai' }, 'Kai'), { id: 'a', name: 'Kai', phone: '', gender: 'm', genderBy: 'ai' });
    assert.equal(applyGenderUpdate(f, { id: 'a', stage: 'names' }, 'Kai'), f);
    assert.equal(applyGenderUpdate(f, { id: 'a', stage: 'genderize' }, 'Kai'), f);
    assert.deepEqual(applyGenderUpdate(f, { id: 'a', stage: 'ai' }, 'Kai').genderStage, 'ai');
    assert.equal(applyGenderUpdate(f, undefined, 'Kai'), f);
    const known: GenderSubject = { id: 'b', name: 'Kai', phone: '', gender: 'f', genderBy: 'genderize' };
    assert.equal(applyGenderUpdate(known, { id: 'b', gender: 'm', by: 'ai' }, 'Kai'), known, 'уже определённый не перезаписываем');
  });
});

describe('сохранение друга', () => {
  test('новый друг: уверенное имя — сразу по базе; сомнительное — ждёт фонового прохода', () => {
    assert.deepEqual(pick(genderOnSave(undefined, friend('a', 'Аня'))), ['f', 'names', null]);
    assert.deepEqual(pick(genderOnSave(undefined, friend('b', 'Саша'))), [null, null, 'names']);
    assert.deepEqual(pick(genderOnSave(undefined, friend('c', 'Саша', { gender: 'm', genderBy: 'ai' }))), [null, null, 'names'], 'чужие поля из импорта не верим');
  });

  test('имя то же — пол, найденный, пока была открыта форма, не теряется', () => {
    const stored = friend('a', 'Kai', { gender: 'm', genderBy: 'genderize' });
    const fromForm = { ...friend('a', 'Kai', { genderStage: 'names' }), gifts: 'книги' };
    const saved = genderOnSave(stored, fromForm);
    assert.deepEqual(pick(saved), ['m', 'genderize', null]);
    assert.equal(saved.gifts, 'книги');
  });

  test('имя то же — дошедшая ступень не откатывается', () => {
    const stored = friend('a', 'Саша', { genderStage: 'ai' });
    assert.deepEqual(pick(genderOnSave(stored, { ...stored, notes: 'любит чай' })), [null, null, 'ai']);
  });

  test('пол не определился, а друга переименовали — пробуем заново по новому имени', () => {
    const stored = friend('a', 'Саша', { genderStage: 'ai' });
    assert.deepEqual(pick(genderOnSave(stored, { ...stored, name: 'Саша Иванова' })), ['f', 'names', null], 'база поняла сразу');
    assert.deepEqual(pick(genderOnSave(stored, { ...stored, name: 'Kai' })), [null, null, 'names'], 'дальше — фоновый проход');
    const waiting = friend('b', 'Женя', { genderStage: 'genderize' });
    assert.deepEqual(pick(genderOnSave(waiting, { ...waiting, name: 'Женя Петров' })), ['m', 'names', null]);
  });

  test('пол уже определился — переименование его не трогает', () => {
    const found = friend('b', 'Kai', { gender: 'm', genderBy: 'ai' });
    assert.deepEqual(pick(genderOnSave(found, { ...found, name: 'Robin' })), ['m', 'ai', null]);
    const byName = friend('c', 'Анна', { gender: 'f', genderBy: 'names' });
    assert.deepEqual(pick(genderOnSave(byName, { ...byName, name: 'Саша' })), ['f', 'names', null], 'даже если новое имя неоднозначное');
    assert.deepEqual(pick(genderOnSave(byName, { ...byName, name: 'Иван' })), ['f', 'names', null], 'и даже если база думает иначе');
  });

  test('«Не указан» вручную — переименование тоже не трогает', () => {
    const none = friend('d', 'Саша', { genderBy: 'manual' });
    assert.deepEqual(pick(genderOnSave(none, { ...friend('d', 'Саша Иванова') })), [null, 'manual', null]);
  });

  test('ручной выбор: сохраняется как выбран, ступень убирается; «Не указан» — тоже ручной', () => {
    const stored = friend('a', 'Саша', { genderStage: 'genderize' });
    assert.deepEqual(pick(genderOnSave(stored, { ...stored, gender: 'f', genderBy: 'manual' })), ['f', 'manual', null]);
    assert.deepEqual(pick(genderOnSave(stored, { ...stored, genderBy: 'manual' })), [null, 'manual', null]);
    const manual = friend('b', 'Анна', { gender: 'm', genderBy: 'manual' });
    assert.deepEqual(pick(genderOnSave(manual, { ...manual, name: 'Аня' })), ['m', 'manual', null]);
  });

  test('другие правки (избранное, заметки) ручной пол не сбрасывают', () => {
    const stored = friend('a', 'Саша', { gender: 'f', genderBy: 'manual' });
    const fromCard = { ...friend('a', 'Саша'), favorite: true }; // карточка без полей пола
    assert.deepEqual(pick(genderOnSave(stored, fromCard)), ['f', 'manual', null]);
  });
});

const pick = (f: Friend) => [f.gender ?? null, f.genderBy ?? null, f.genderStage ?? null];

describe('хранение', () => {
  test('после перезапуска остаются только согласованные значения', () => {
    const load = (extra: Record<string, unknown>, name = 'Kai') => pick(normalizeData({ friends: [{ ...friend('a', name), ...extra }] }).friends[0]);
    assert.deepEqual(load({ gender: 'f' }), [null, null, null], 'пол без источника — определим заново');
    assert.deepEqual(load({ genderBy: 'genderize' }), [null, null, null], 'источник без пола');
    assert.deepEqual(load({ gender: 'x', genderBy: 'names' }), [null, null, null]);
    assert.deepEqual(load({ gender: 'f', genderBy: 'robot' }), [null, null, null]);
    assert.deepEqual(load({ gender: 'f', genderBy: 'genderize', genderStage: 'ai' }), ['f', 'genderize', null], 'ступень при поле не нужна');
    assert.deepEqual(load({ genderStage: 'device-ai' }), [null, null, 'device-ai']);
    assert.deepEqual(load({ genderStage: 'later' }), [null, null, null]);
    assert.deepEqual(load({ genderBy: 'manual', genderStage: 'genderize' }), [null, 'manual', null], '«Не указан» вручную');
    assert.deepEqual(load({ gender: 'm', genderBy: 'manual' }, 'Анна'), ['m', 'manual', null], 'ручной — даже если база не согласна');
  });

  test('старое «gemini» (когда облачным ИИ был только Gemini) читается как «ai»', () => {
    const load = (extra: Record<string, unknown>) => pick(normalizeData({ friends: [{ ...friend('a', 'Kai'), ...extra }] }).friends[0]);
    assert.deepEqual(load({ genderStage: 'gemini' }), [null, null, 'ai']);
    assert.deepEqual(load({ gender: 'm', genderBy: 'gemini' }), ['m', 'ai', null]);
  });

  test('определённый пол после перезапуска остаётся, даже если имя потом сменили', () => {
    const load = (name: string, gender: string) => pick(normalizeData({ friends: [{ ...friend('a', name), gender, genderBy: 'names' }] }).friends[0]);
    assert.deepEqual(load('Саша', 'm'), ['m', 'names', null]);
    assert.deepEqual(load('Анна', 'f'), ['f', 'names', null]);
  });
});

describe('фоновый запуск', () => {
  test('один проход за раз: повторный вызов во время прохода ничего не запускает', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const net = new Net();
    const sync = createGenderSync({
      deps: { fetch: async (url, init) => (await gate, net.fetch(url, init)) },
      load: async () => ({}),
      save: async () => {},
      now: () => T0,
    });
    const people = [friend('s', 'Ардак')];
    const first = sync.run(people);
    assert.deepEqual(await sync.run(people), []);
    release();
    assert.equal((await first).length, 1);
    assert.equal(net.calls.length, 1);
    assert.equal((await sync.run([friend('k', 'Kai')])).length, 1, 'после прохода снова можно');
  });

  test('никого не нужно определять — даже паузы не читаем', async () => {
    let loads = 0;
    const sync = createGenderSync({ deps: { fetch: async () => assert.fail('сеть') }, load: async () => (loads++, {}), save: async () => {}, now: () => T0 });
    assert.deepEqual(await sync.run([friend('a', 'Аня', { gender: 'f', genderBy: 'names' }), friend('b', 'Саша', { genderBy: 'manual' }), friend('c', 'Женя', { genderStage: 'ai' })]), []);
    assert.equal(loads, 0);
  });

  test('паузы сохраняются, только если изменились; битое хранилище — как без пауз', async () => {
    let saves = 0;
    const net = new Net();
    const sync = createGenderSync({ deps: { fetch: net.fetch }, load: async () => Promise.reject(new Error('битое')), save: async () => void saves++, now: () => T0 });
    await sync.run([friend('s', 'Ардак')]);
    assert.equal(saves, 0);
    assert.equal(net.calls.length, 1);
    net.genderizeReply = { status: 429 };
    await sync.run([friend('k', 'Kai')]);
    assert.equal(saves, 1);
  });

  test('сбой сохранения паузы не роняет проход', async () => {
    const net = new Net();
    net.genderizeReply = { status: 429 };
    const sync = createGenderSync({ deps: { fetch: net.fetch }, load: async () => ({}), save: async () => Promise.reject(new Error('диск')), now: () => T0 });
    assert.deepEqual(await sync.run([friend('s', 'Ардак')]), [{ id: 's', stage: 'names' }]);
  });
});

describe('месяц жизни телефона', () => {
  test('каждый сервис спрашивает про каждое имя не больше одного раза; ручной выбор не трогается', async () => {
    const { net, ai, device, phone } = setup(
      [
        friend('anna', 'Анна'),
        friend('sasha-f', 'Саша Иванова'),
        friend('sasha', 'Саша', { phone: '+7 999 111 22 33' }),
        friend('zhenya', 'Женя Ким', { phone: '+7 707 111 22 33' }),
        friend('alua', 'Алуашка', { phone: '+7 707 222 33 44' }),
        friend('kai', 'Kai'),
        friend('manual', 'Валя', { gender: 'f', genderBy: 'manual' }),
        friend('emoji', '🌸'),
      ],
      { ai: true, device: true },
    );
    net.genderize.set('kai', 'm');
    ai.answers.set('алуашка', 'f');
    device.state = 'unavailable';

    // 1. Открыли без интернета: только своя база. Саша и Женя бывают у обоих — сразу «загадки», наружу не уходят.
    net.genderizeReply = 'offline';
    await phone.launch();
    assert.deepEqual(phone.state(), {
      anna: ['f', 'names', null],
      'sasha-f': ['f', 'names', null],
      sasha: [null, null, 'ai'],
      zhenya: [null, null, 'ai'],
      alua: [null, null, 'names'],
      kai: [null, null, 'names'],
      manual: ['f', 'manual', null],
      emoji: [null, null, 'ai'], // отправлять нечего — сразу «выбери сам»
    });

    // 2. Интернет есть, но лимит Genderize на сегодня кончился.
    net.genderizeReply = { status: 429 };
    phone.now += HOUR;
    await phone.launch();
    const pausedUntil = phone.pause.genderize!;
    assert.equal(pausedUntil, phone.now + BACKOFF_RATE_LIMIT);

    // 3. Ещё несколько открытий в тот же день — никуда не ходим.
    const before = net.calls.length;
    for (let i = 0; i < 5; i++) {
      phone.now += HOUR;
      await phone.launch();
    }
    assert.equal(net.calls.length, before);

    // 4. На следующий день: Genderize знает Kai, остальных — облачный ИИ (ИИ телефона нет).
    net.genderizeReply = null;
    phone.now = pausedUntil;
    await phone.launch();
    assert.deepEqual(phone.state(), {
      anna: ['f', 'names', null],
      'sasha-f': ['f', 'names', null],
      sasha: [null, null, 'ai'],
      zhenya: [null, null, 'ai'],
      alua: ['f', 'ai', null],
      kai: ['m', 'genderize', null],
      manual: ['f', 'manual', null],
      emoji: [null, null, 'ai'],
    });

    // 5. Неделю открываем каждый день — ни одного запроса.
    const settled = net.calls.length;
    for (let i = 0; i < 7; i++) {
      phone.now += DAY;
      await phone.launch();
    }
    assert.equal(net.calls.length, settled);

    // 6. Женю переименовали в «Женя Петрова» — база поняла сразу. Сашу выбрали вручную. Добавили нового друга.
    phone.edit('zhenya', (f) => ({ ...f, name: 'Женя Петрова' }));
    phone.edit('sasha', (f) => ({ ...f, gender: 'm', genderBy: 'manual' }));
    phone.add(friend('robin', 'Robin'));
    device.state = 'available'; // ИИ телефона наконец скачался
    device.answers.set('robin', 'мужчина');
    await phone.launch();
    assert.deepEqual(phone.state(), {
      anna: ['f', 'names', null],
      'sasha-f': ['f', 'names', null],
      sasha: ['m', 'manual', null],
      zhenya: ['f', 'names', null],
      alua: ['f', 'ai', null],
      kai: ['m', 'genderize', null],
      manual: ['f', 'manual', null],
      emoji: [null, null, 'ai'],
      robin: ['m', 'device-ai', null],
    });
    assert.deepEqual(device.asked, ['Robin'], 'ИИ телефона спросили только про нового');

    assert.equal(net.maxAnswered('genderize'), 1);
    assert.equal(ai.maxAnswered(), 1);
    const sentNames = [...net.genderizeCalls.flatMap((c) => genderizeNames(c.url)), ...ai.asked.flat()];
    // Без сети и при лимите имена тоже уходили (ответа не было) — но наружу уходили только эти имена.
    assert.deepEqual([...new Set(sentNames)].sort(), ['Kai', 'Robin', 'Алуашка']);
    const raw = [...net.calls.map((c) => decodeURIComponent(c.url)), ...ai.prompts.map((p) => p.split('\n').filter((l) => /^\d+: /.test(l)).join('\n'))].join(' ');
    for (const secret of ['Иванова', 'Ким', 'Саша', 'Женя', '999', '707', '🌸']) assert.ok(!raw.includes(secret), `«${secret}» не должно уходить`);
  });
});

// Проход сам по себе (без «телефона») — те же правила.
describe('genderPass', () => {
  test('возвращает только изменения: кто определился и кто продвинулся', async () => {
    const net = new Net();
    net.genderize.set('kai', 'm');
    const r = await genderPass(
      [
        { id: 'a', name: 'Аня', phone: '' },
        { id: 'k', name: 'Kai', phone: '' },
        { id: 's', name: 'Ардак', phone: '', genderStage: 'genderize' },
        { id: 'm', name: 'Женя', phone: '', genderBy: 'manual' },
      ],
      { fetch: net.fetch },
      { now: T0 },
    );
    assert.deepEqual(r.updates, [
      { id: 'a', gender: 'f', by: 'names' },
      { id: 'k', gender: 'm', by: 'genderize' },
    ]);
    assert.deepEqual(r.problems, []);
  });

  test('проблемы сервисов описаны словами', async () => {
    const net = new Net();
    net.genderizeReply = { status: 429 };
    const r = await genderPass([{ id: 's', name: 'Ардак', phone: '' }], { fetch: net.fetch }, { now: T0 });
    assert.deepEqual(r.problems, ['Genderize: лимит исчерпан']);
    assert.equal(r.backoff.genderize, T0 + BACKOFF_RATE_LIMIT);
  });
});
