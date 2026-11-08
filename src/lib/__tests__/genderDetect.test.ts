/// <reference types="node" />
// Пол определяется сам при каждом запуске, по ступеням: своя база → Genderize → ИИ телефона → Gemini.
// Каждую ступень про человека спрашиваем один раз; ручной выбор главнее всего. Здесь — подставной интернет,
// подставной ИИ телефона и «телефон», который запускают много раз подряд, с перезаписью данных между запусками.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { genderOnSave } from '../gender';
import {
  BACKOFF_RATE_LIMIT,
  BACKOFF_REFUSED,
  BACKOFF_SERVER,
  PASS_LIMITS,
  applyGenderUpdate,
  createGenderSync,
  devicePrompt,
  geminiBody,
  genderPass,
  genderPending,
  genderizeUrl,
  parseDeviceAnswer,
  parseGemini,
  parseGenderize,
  type DeviceAiStatus,
  type GenderDeps,
  type GenderSubject,
} from '../genderDetect';
import { normalizeData } from '../storage';
import type { Friend } from '../types';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 10, 8, 9);
const KEY = 'test-key';

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

/** Подставной интернет: Genderize и Gemini отвечают из словарей; все запросы и все отвеченные имена записываются. */
class Net {
  calls: { url: string; body?: string; headers?: Record<string, string> }[] = [];
  /** Имя (строчными) → пол, в котором Genderize уверен. Нет в словаре — «не знаю». */
  genderize = new Map<string, 'f' | 'm'>();
  /** Имя (строчными) → пол по мнению Gemini. Нет в словаре — «u». */
  gemini = new Map<string, 'f' | 'm'>();
  genderizeReply: Reply | null = null;
  geminiReply: Reply | null = null;
  geminiByModel = new Map<string, Reply>();
  /** Сколько раз сервис ОТВЕТИЛ про имя — это и есть «спросили». */
  answered = { genderize: new Map<string, number>(), gemini: new Map<string, number>() };

  fetch: GenderDeps['fetch'] = async (url, init) => {
    this.calls.push({ url, body: init?.body, headers: init?.headers });
    const reply = url.startsWith('https://api.genderize.io') ? this.answerGenderize(url) : this.answerGemini(url, init?.body ?? '');
    if (reply === 'offline') throw new TypeError('Network request failed');
    return { ok: reply.status >= 200 && reply.status < 300, status: reply.status, json: async () => reply.body };
  };

  get genderizeCalls() {
    return this.calls.filter((c) => c.url.startsWith('https://api.genderize.io'));
  }
  get geminiCalls() {
    return this.calls.filter((c) => c.url.includes('generativelanguage'));
  }
  /** Самый частый ответ про одно имя — должен быть не больше 1. */
  maxAnswered(service: 'genderize' | 'gemini') {
    return Math.max(0, ...this.answered[service].values());
  }

  private count(service: 'genderize' | 'gemini', names: string[]) {
    for (const n of names) this.answered[service].set(n.toLowerCase(), (this.answered[service].get(n.toLowerCase()) ?? 0) + 1);
  }

  private answerGenderize(url: string): Reply {
    if (this.genderizeReply) return this.genderizeReply;
    const names = genderizeNames(url);
    this.count('genderize', names);
    return {
      status: 200,
      body: names.map((name) => {
        const g = this.genderize.get(name.toLowerCase());
        return g ? { name, gender: g === 'f' ? 'female' : 'male', probability: 0.99, count: 500 } : { name, gender: 'male', probability: 0.6, count: 900 };
      }),
    };
  }

  private answerGemini(url: string, body: string): Reply {
    const model = /models\/([^:]+):generateContent/.exec(url)?.[1] ?? '';
    const special = this.geminiByModel.get(model) ?? this.geminiReply;
    if (special) return special;
    const names = geminiNames(body);
    this.count('gemini', names);
    return { status: 200, body: geminiAnswer(names.map((n, i) => ({ i, g: this.gemini.get(n.toLowerCase()) ?? 'u' }))) };
  }
}

const genderizeNames = (url: string) => new URL(url).searchParams.getAll('name[]');
const genderizeCountry = (url: string) => new URL(url).searchParams.get('country_id');
const geminiNames = (body: string) =>
  (JSON.parse(body).contents[0].parts[0].text as string)
    .split('\n')
    .filter((l) => /^\d+: /.test(l))
    .map((l) => l.replace(/^\d+: /, ''));
const geminiAnswer = (list: unknown) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(list) }] } }] });

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
    return JSON.parse(this.backoff) as { genderize?: number; gemini?: number };
  }
}

const setup = (friends: Friend[], opts: { key?: boolean; device?: boolean } = {}) => {
  const net = new Net();
  const device = new Device();
  const phone = new Phone(friends, { fetch: net.fetch, geminiKey: opts.key ? KEY : undefined, deviceAi: opts.device ? device.api : undefined });
  return { net, device, phone };
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

  test('Gemini: JSON по номерам строк; «u», чужие номера и мусор — «не знаем»; совсем непонятный ответ — null', () => {
    assert.deepEqual([...parseGemini(geminiAnswer([{ i: 0, g: 'f' }, { i: 1, g: 'u' }, { i: 2, g: 'm' }, { i: 9, g: 'f' }, { i: 'x', g: 'm' }, null]), 3)!], [
      [0, 'f'],
      [2, 'm'],
    ]);
    assert.deepEqual([...parseGemini({ candidates: [{ content: { parts: [{ text: '```json\n[{"i":0,"g":"m"}]\n```' }] } }] }, 1)!], [[0, 'm']], 'обёртка ``` не мешает');
    assert.equal(parseGemini({ candidates: [{ content: { parts: [{ text: 'не JSON' }] } }] }, 1), null);
    assert.equal(parseGemini({ candidates: [{ content: { parts: [{ text: '{"i":0}' }] } }] }, 1), null, 'не массив');
    assert.equal(parseGemini({}, 1), null);
    assert.equal(parseGemini(null, 1), null);
  });

  test('запрос к Gemini: имена пронумерованы, температура 0, ответ JSON, просим не угадывать', () => {
    const body = JSON.parse(geminiBody(['Алуашка', 'Саша']));
    assert.equal(body.generationConfig.temperature, 0);
    assert.equal(body.generationConfig.responseMimeType, 'application/json');
    assert.match(body.contents[0].parts[0].text, /0: Алуашка\n1: Саша$/);
    assert.match(body.contents[0].parts[0].text, /Не угадывай/);
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
    assert.equal(genderPending({ genderStage: 'gemini' }), false, 'все ступени пройдены — выбирает человек');
    assert.equal(genderPending({ gender: 'f', genderBy: 'names' }), false);
    assert.equal(genderPending({ genderBy: 'manual' }), false, '«Не указан» вручную');
    assert.equal(genderPending({ gender: 'm', genderBy: 'manual' }), false);
  });
});

describe('своя база — без интернета', () => {
  test('уверенные имена определяются сразу, в интернет ничего не уходит', async () => {
    const { net, phone } = setup([friend('a', 'Аня'), friend('b', 'Иван Петров'), friend('c', 'Мама'), friend('d', 'Саша Иванова'), friend('e', 'Дядя Женя')], { key: true });
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

  test('Саша, Женя, Валя сами по себе не определяются — идут в Genderize', async () => {
    const { net, phone } = setup([friend('s', 'Саша'), friend('z', 'Женя'), friend('v', 'Валя'), friend('k', 'Алуашка', { phone: '+7 707 111 22 33' })]);
    net.genderize.set('алуашка', 'f');
    await phone.launch();
    assert.deepEqual(phone.state(), {
      s: [null, null, 'genderize'],
      z: [null, null, 'genderize'],
      v: [null, null, 'genderize'],
      k: ['f', 'genderize', null],
    });
  });

  test('база пополнилась в новой версии — ждущих проверяем ею снова, без интернета', async () => {
    // «Анна» уже прошла Genderize (например, раньше база её не знала) — теперь база знает, сеть не нужна.
    const { net, phone } = setup([friend('a', 'Анна', { genderStage: 'genderize' }), friend('b', 'Иван', { genderStage: 'device-ai' })], { key: true });
    await phone.launch();
    assert.equal(net.calls.length, 0);
    assert.deepEqual(phone.state(), { a: ['f', 'names', null], b: ['m', 'names', null] });
  });

  test('ни имени, ни подписи (эмодзи, цифры) — никуда не отправляем, сразу «выбери сам»', async () => {
    const { net, device, phone } = setup([friend('x', '🙂'), friend('y', '12345'), friend('z', '—')], { key: true, device: true });
    await phone.launch();
    assert.equal(net.calls.length, 0);
    assert.equal(device.asked.length, 0);
    assert.deepEqual(phone.state(), { x: [null, null, 'gemini'], y: [null, null, 'gemini'], z: [null, null, 'gemini'] });
  });
});

describe('Genderize', () => {
  test('уходит только имя и страна по коду номера: без фамилии, роли и самого номера', async () => {
    const { net, phone } = setup([
      friend('a', 'Саша Ким', { phone: '+7 707 606 39 03' }),
      friend('b', 'Сантехник Валя', { phone: '+7 999 123-45-67' }),
      friend('c', 'Женя Шевченко', { phone: '+380501234567' }),
      friend('d', 'John Smith'),
    ]);
    await phone.launch();
    const sent = net.genderizeCalls.map((c) => [genderizeCountry(c.url), genderizeNames(c.url)]);
    assert.deepEqual(sent.sort(), [
      [null, ['John']],
      ['KZ', ['Саша']],
      ['RU', ['Валя']],
      ['UA', ['Женя']],
    ]);
    const all = net.calls.map((c) => decodeURIComponent(c.url)).join(' ');
    for (const secret of ['Ким', 'Сантехник', 'Шевченко', 'Smith', '606', '999', '50123']) assert.ok(!all.includes(secret), `«${secret}» не должно уходить`);
  });

  test('одинаковые имена — один раз; по 10 имён в запросе', async () => {
    const list = [friend('s1', 'Саша Ким'), friend('s2', 'Саша Цой'), friend('s3', 'Саша'), ...Array.from({ length: 12 }, (_, i) => friend(`l${i}`, latinName(i)))];
    const { net, phone } = setup(list);
    await phone.launch();
    assert.deepEqual(net.genderizeCalls.map((c) => genderizeNames(c.url).length), [10, 3]);
    assert.equal(net.answered.genderize.get('саша'), 1);
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
    const { net, phone } = setup([friend('s', 'Саша')]);
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
      const { net, phone } = setup([friend('s', 'Саша')]);
      net.genderizeReply = { status, body: { error: 'no' } };
      await phone.launch();
      assert.equal(phone.pause.genderize, T0 + BACKOFF_REFUSED);
      assert.deepEqual(phone.state(), { s: [null, null, 'names'] });
    });
  }

  test('сбой сервиса (5xx) — пауза на час, чтобы не дёргать его при каждом открытии', async () => {
    const { net, phone } = setup([friend('s', 'Саша')]);
    net.genderizeReply = { status: 503 };
    await phone.launch();
    assert.equal(phone.pause.genderize, T0 + BACKOFF_SERVER);
    phone.now = T0 + 30 * 60_000;
    await phone.launch();
    assert.equal(net.genderizeCalls.length, 1);
  });

  test('в ответе нет нашего имени или ответ непонятный — не считаем, что спросили', async () => {
    const { net, phone } = setup([friend('s', 'Саша')]);
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

describe('ИИ: сначала телефона, потом Gemini', () => {
  test('ИИ телефона понял — Gemini не спрашиваем', async () => {
    const { net, device, phone } = setup([friend('k', 'Алуашка')], { key: true, device: true });
    device.answers.set('алуашка', 'Женщина');
    await phone.launch();
    assert.deepEqual(phone.state(), { k: ['f', 'device-ai', null] });
    assert.equal(net.geminiCalls.length, 0);
  });

  test('ИИ телефона не понял — спрашиваем Gemini; не понял и он — больше никого не спрашиваем', async () => {
    const { net, device, phone } = setup([friend('s', 'Саша')], { key: true, device: true });
    await phone.launch();
    assert.deepEqual(phone.state(), { s: [null, null, 'gemini'] });
    assert.deepEqual(device.asked, ['Саша']);
    for (let i = 0; i < 4; i++) await phone.launch();
    assert.equal(net.calls.length, 2, 'Genderize и Gemini — по одному разу');
    assert.deepEqual(device.asked, ['Саша']);
  });

  test('ИИ телефона не понял, а Gemini понял', async () => {
    const { net, phone } = setup([friend('k', 'Алуашка')], { key: true, device: true });
    net.gemini.set('алуашка', 'f');
    await phone.launch();
    assert.deepEqual(phone.state(), { k: ['f', 'gemini', null] });
  });

  for (const state of ['unavailable', 'downloadable', 'downloading', 'broken'] as const) {
    test(`ИИ телефона ${state} — сразу Gemini, ступень ИИ телефона не отмечаем`, async () => {
      const { net, device, phone } = setup([friend('k', 'Алуашка'), friend('s', 'Саша')], { key: true, device: true });
      device.state = state;
      net.gemini.set('алуашка', 'f');
      await phone.launch();
      assert.equal(device.asked.length, 0);
      assert.deepEqual(phone.state(), { k: ['f', 'gemini', null], s: [null, null, 'gemini'] });
    });
  }

  test('ИИ телефона ещё не скачан, а Gemini на паузе — ждём, потом спросим ИИ телефона', async () => {
    const { net, device, phone } = setup([friend('k', 'Алуашка')], { key: true, device: true });
    device.state = 'downloading';
    net.geminiReply = { status: 429 };
    await phone.launch();
    assert.deepEqual(phone.state(), { k: [null, null, 'genderize'] });
    device.state = 'available';
    device.answers.set('алуашка', 'женщина');
    await phone.launch();
    assert.deepEqual(phone.state(), { k: ['f', 'device-ai', null] });
    assert.equal(net.geminiCalls.length, 1);
  });

  test('ИИ телефона сломался на человеке — не отмечаем, спрашиваем Gemini', async () => {
    const { net, device, phone } = setup([friend('k', 'Kai')], { key: true, device: true });
    device.failOn.add('Kai');
    net.gemini.set('kai', 'm');
    await phone.launch();
    assert.deepEqual(phone.state(), { k: ['m', 'gemini', null] });
  });

  test('ИИ телефона: одинаковые имена — один вопрос; в вопросе только имя', async () => {
    const { device, phone } = setup([friend('a', 'Саша Ким'), friend('b', 'Саша Цой'), friend('c', 'Саша')], { device: true });
    await phone.launch();
    assert.deepEqual(device.asked, ['Саша']);
    assert.ok(phone.friends.every((f) => f.genderStage === 'device-ai'), 'без ключа Gemini дальше не идём');
  });

  test('Gemini: только имена, ключ в заголовке (не в адресе), одинаковые — один раз', async () => {
    const { net, phone } = setup([friend('a', 'Саша Ким', { phone: '+7 707 606 39 03' }), friend('b', 'Саша Цой'), friend('c', 'Сантехник Валя')], { key: true });
    await phone.launch();
    assert.equal(net.geminiCalls.length, 1);
    const call = net.geminiCalls[0];
    assert.deepEqual(geminiNames(call.body!), ['Саша', 'Валя']);
    assert.equal(call.headers?.['x-goog-api-key'], KEY);
    assert.ok(!call.url.includes(KEY));
    for (const secret of ['Ким', 'Цой', 'Сантехник', '707']) assert.ok(!call.body!.includes(secret), secret);
  });

  test(`Gemini: не больше ${PASS_LIMITS.gemini} имён за запуск, по 25 в запросе`, async () => {
    const { net, phone } = setup(Array.from({ length: 120 }, (_, i) => friend(`n${i}`, latinName(i))), { key: true });
    await phone.launch(); // Genderize — 100, Gemini — те же 100
    assert.deepEqual(net.geminiCalls.map((c) => geminiNames(c.body!).length), [25, 25, 25, 25]);
    await phone.launch(); // Genderize — 20, Gemini — 20
    assert.deepEqual(net.geminiCalls.map((c) => geminiNames(c.body!).length), [25, 25, 25, 25, 20]);
    await phone.launch();
    assert.equal(net.calls.length, 10 + 2 + 5, 'третий запуск — никого');
    assert.equal(net.answered.gemini.size, 120);
    assert.equal(net.maxAnswered('gemini'), 1);
    assert.equal(net.maxAnswered('genderize'), 1);
    assert.ok(phone.friends.every((f) => f.genderStage === 'gemini'));
  });

  test('Gemini: модель переименовали (404) — пробуем следующую', async () => {
    const { net, phone } = setup([friend('k', 'Kai')], { key: true });
    net.gemini.set('kai', 'm');
    net.geminiByModel.set('gemini-flash-lite-latest', { status: 404, body: { error: { status: 'NOT_FOUND' } } });
    await phone.launch();
    assert.deepEqual(phone.state(), { k: ['m', 'gemini', null] });
    assert.deepEqual(net.geminiCalls.map((c) => /models\/([^:]+)/.exec(c.url)![1]), ['gemini-flash-lite-latest', 'gemini-flash-latest']);
  });

  test('Gemini: ни одной модели нет — пауза на неделю, никого не отмечаем', async () => {
    const { net, phone } = setup([friend('k', 'Kai')], { key: true });
    net.geminiReply = { status: 404 };
    await phone.launch();
    assert.equal(phone.pause.gemini, T0 + BACKOFF_REFUSED);
    assert.deepEqual(phone.state(), { k: [null, null, 'genderize'] });
  });

  test('Gemini недоступен в стране — пауза на неделю; через неделю спросим снова', async () => {
    const { net, phone } = setup([friend('k', 'Kai')], { key: true });
    net.gemini.set('kai', 'm');
    net.geminiReply = { status: 400, body: { error: { status: 'FAILED_PRECONDITION', message: 'User location is not supported for the API use.' } } };
    await phone.launch();
    assert.equal(phone.pause.gemini, T0 + BACKOFF_REFUSED);
    net.geminiReply = null;
    phone.now = T0 + 6 * DAY;
    await phone.launch();
    assert.equal(net.geminiCalls.length, 1);
    phone.now = T0 + 7 * DAY;
    await phone.launch();
    assert.deepEqual(phone.state(), { k: ['m', 'gemini', null] });
    assert.equal(net.genderizeCalls.length, 1, 'Genderize при этом не переспрашиваем');
  });

  const geminiErrors: [string, Reply, number | undefined][] = [
    ['лимит ключа (429) — сутки', { status: 429, body: { error: { status: 'RESOURCE_EXHAUSTED' } } }, BACKOFF_RATE_LIMIT],
    ['неверный ключ (400) — неделя', { status: 400, body: { error: { status: 'INVALID_ARGUMENT', message: 'API key not valid' } } }, BACKOFF_REFUSED],
    ['ключ отозван (403) — неделя', { status: 403, body: { error: { status: 'PERMISSION_DENIED' } } }, BACKOFF_REFUSED],
    ['сбой сервиса (503) — час', { status: 503 }, BACKOFF_SERVER],
    ['нет сети — без паузы', 'offline', undefined],
  ];
  for (const [title, reply, pause] of geminiErrors) {
    test(`Gemini: ${title}, никого не отмечаем`, async () => {
      const { net, phone } = setup([friend('k', 'Kai')], { key: true });
      net.geminiReply = reply;
      await phone.launch();
      assert.equal(phone.pause.gemini, pause === undefined ? undefined : T0 + pause);
      assert.deepEqual(phone.state(), { k: [null, null, 'genderize'] });
    });
  }

  test('Gemini прислал непонятное — второй раз не спрашиваем, выбирает человек', async () => {
    const { net, phone } = setup([friend('k', 'Kai')], { key: true });
    net.geminiReply = { status: 200, body: { candidates: [{ content: { parts: [{ text: 'Извините, не могу' }] } }] } };
    await phone.launch();
    await phone.launch();
    assert.deepEqual(phone.state(), { k: [null, null, 'gemini'] });
    assert.equal(net.geminiCalls.length, 1);
  });

  test('без ключа Gemini и без ИИ телефона — после Genderize никуда не ходим, ждём', async () => {
    const { net, phone } = setup([friend('s', 'Саша')]);
    for (let i = 0; i < 3; i++) await phone.launch();
    assert.equal(net.calls.length, 1);
    assert.deepEqual(phone.state(), { s: [null, null, 'genderize'] });
  });

  test('Genderize на паузе — к ИИ не перескакиваем: порядок ступеней не нарушаем', async () => {
    const { net, device, phone } = setup([friend('k', 'Алуашка')], { key: true, device: true });
    phone.backoff = JSON.stringify({ genderize: T0 + HOUR });
    await phone.launch();
    assert.equal(net.calls.length, 0);
    assert.equal(device.asked.length, 0);
    assert.deepEqual(phone.state(), { k: [null, null, 'names'] });
  });
});

describe('ручной выбор главнее всего', () => {
  test('выбран вручную — ни одна ступень его не трогает, даже если база «не согласна»', async () => {
    const { net, device, phone } = setup(
      [friend('a', 'Саша', { gender: 'f', genderBy: 'manual' }), friend('b', 'Женя', { genderBy: 'manual' }), friend('c', 'Анна', { gender: 'm', genderBy: 'manual' })],
      { key: true, device: true },
    );
    for (let i = 0; i < 3; i++) await phone.launch();
    assert.equal(net.calls.length + device.asked.length, 0);
    assert.deepEqual(phone.state(), { a: ['f', 'manual', null], b: [null, 'manual', null], c: ['m', 'manual', null] });
  });

  test('переименовали друга с ручным полом — пол остаётся', async () => {
    const { net, phone } = setup([friend('a', 'Саша', { gender: 'f', genderBy: 'manual' })]);
    phone.edit('a', (f) => ({ ...f, name: 'Иван' }));
    await phone.launch();
    assert.deepEqual(phone.state(), { a: ['f', 'manual', null] });
    assert.equal(net.calls.length, 0);
  });

  test('выбрали вручную, пока шёл проход, — результат прохода не применяется', () => {
    const f: GenderSubject = { id: 'a', name: 'Саша', phone: '', gender: 'm', genderBy: 'manual' };
    assert.equal(applyGenderUpdate(f, { id: 'a', gender: 'f', by: 'genderize' }, 'Саша'), f);
    const none: GenderSubject = { id: 'b', name: 'Женя', phone: '', genderBy: 'manual' };
    assert.equal(applyGenderUpdate(none, { id: 'b', stage: 'gemini' }, 'Женя'), none);
  });

  test('переименовали, пока шёл проход, — ответ про старое имя не применяется', () => {
    const f: GenderSubject = { id: 'a', name: 'Женя Петрова', phone: '', gender: 'f', genderBy: 'names' };
    assert.equal(applyGenderUpdate(f, { id: 'a', gender: 'm', by: 'gemini' }, 'Женя'), f);
    const g: GenderSubject = { id: 'b', name: 'Kai', phone: '', genderStage: 'names' };
    assert.equal(applyGenderUpdate(g, { id: 'b', stage: 'gemini' }, 'Саша'), g, 'и ступень от старого имени — тоже');
  });

  test('применение: пол — с источником и без ступени; ступень только растёт', () => {
    const f: GenderSubject = { id: 'a', name: 'Kai', phone: '', genderStage: 'genderize' };
    assert.deepEqual(applyGenderUpdate(f, { id: 'a', gender: 'm', by: 'gemini' }, 'Kai'), { id: 'a', name: 'Kai', phone: '', gender: 'm', genderBy: 'gemini' });
    assert.equal(applyGenderUpdate(f, { id: 'a', stage: 'names' }, 'Kai'), f);
    assert.equal(applyGenderUpdate(f, { id: 'a', stage: 'genderize' }, 'Kai'), f);
    assert.deepEqual(applyGenderUpdate(f, { id: 'a', stage: 'gemini' }, 'Kai').genderStage, 'gemini');
    assert.equal(applyGenderUpdate(f, undefined, 'Kai'), f);
    const known: GenderSubject = { id: 'b', name: 'Kai', phone: '', gender: 'f', genderBy: 'genderize' };
    assert.equal(applyGenderUpdate(known, { id: 'b', gender: 'm', by: 'gemini' }, 'Kai'), known, 'уже определённый не перезаписываем');
  });
});

describe('сохранение друга', () => {
  test('новый друг: уверенное имя — сразу по базе; сомнительное — ждёт фонового прохода', () => {
    assert.deepEqual(pick(genderOnSave(undefined, friend('a', 'Аня'))), ['f', 'names', null]);
    assert.deepEqual(pick(genderOnSave(undefined, friend('b', 'Саша'))), [null, null, 'names']);
    assert.deepEqual(pick(genderOnSave(undefined, friend('c', 'Саша', { gender: 'm', genderBy: 'gemini' }))), [null, null, 'names'], 'чужие поля из импорта не верим');
  });

  test('имя то же — пол, найденный, пока была открыта форма, не теряется', () => {
    const stored = friend('a', 'Kai', { gender: 'm', genderBy: 'genderize' });
    const fromForm = { ...friend('a', 'Kai', { genderStage: 'names' }), gifts: 'книги' };
    const saved = genderOnSave(stored, fromForm);
    assert.deepEqual(pick(saved), ['m', 'genderize', null]);
    assert.equal(saved.gifts, 'книги');
  });

  test('имя то же — дошедшая ступень не откатывается', () => {
    const stored = friend('a', 'Саша', { genderStage: 'gemini' });
    assert.deepEqual(pick(genderOnSave(stored, { ...stored, notes: 'любит чай' })), [null, null, 'gemini']);
  });

  test('другое имя — всё, что знали, забываем и начинаем сначала', () => {
    const stored = friend('a', 'Саша', { genderStage: 'gemini' });
    assert.deepEqual(pick(genderOnSave(stored, { ...stored, name: 'Саша Иванова' })), ['f', 'names', null]);
    assert.deepEqual(pick(genderOnSave(stored, { ...stored, name: 'Kai' })), [null, null, 'names']);
    const found = friend('b', 'Kai', { gender: 'm', genderBy: 'gemini' });
    assert.deepEqual(pick(genderOnSave(found, { ...found, name: 'Robin' })), [null, null, 'names']);
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
    assert.deepEqual(load({ gender: 'f', genderBy: 'genderize', genderStage: 'gemini' }), ['f', 'genderize', null], 'ступень при поле не нужна');
    assert.deepEqual(load({ genderStage: 'device-ai' }), [null, null, 'device-ai']);
    assert.deepEqual(load({ genderStage: 'later' }), [null, null, null]);
    assert.deepEqual(load({ genderBy: 'manual', genderStage: 'genderize' }), [null, 'manual', null], '«Не указан» вручную');
    assert.deepEqual(load({ gender: 'm', genderBy: 'manual' }, 'Анна'), ['m', 'manual', null], 'ручной — даже если база не согласна');
  });

  test('пол «по имени», с которым строгая база больше не согласна, — определяем заново', () => {
    const load = (name: string, gender: string) => pick(normalizeData({ friends: [{ ...friend('a', name), gender, genderBy: 'names' }] }).friends[0]);
    assert.deepEqual(load('Саша', 'm'), [null, null, null]);
    assert.deepEqual(load('Женя Ким', 'f'), [null, null, null]);
    assert.deepEqual(load('Анна', 'm'), [null, null, null]);
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
    const people = [friend('s', 'Саша')];
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
    assert.deepEqual(await sync.run([friend('a', 'Аня', { gender: 'f', genderBy: 'names' }), friend('b', 'Саша', { genderBy: 'manual' }), friend('c', 'Женя', { genderStage: 'gemini' })]), []);
    assert.equal(loads, 0);
  });

  test('паузы сохраняются, только если изменились; битое хранилище — как без пауз', async () => {
    let saves = 0;
    const net = new Net();
    const sync = createGenderSync({ deps: { fetch: net.fetch }, load: async () => Promise.reject(new Error('битое')), save: async () => void saves++, now: () => T0 });
    await sync.run([friend('s', 'Саша')]);
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
    assert.deepEqual(await sync.run([friend('s', 'Саша')]), [{ id: 's', stage: 'names' }]);
  });
});

describe('месяц жизни телефона', () => {
  test('каждый сервис спрашивает про каждое имя не больше одного раза; ручной выбор не трогается', async () => {
    const { net, device, phone } = setup(
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
      { key: true, device: true },
    );
    net.genderize.set('kai', 'm');
    net.gemini.set('алуашка', 'f');
    device.state = 'unavailable';

    // 1. Открыли без интернета: только своя база.
    net.genderizeReply = 'offline';
    await phone.launch();
    assert.deepEqual(phone.state(), {
      anna: ['f', 'names', null],
      'sasha-f': ['f', 'names', null],
      sasha: [null, null, 'names'],
      zhenya: [null, null, 'names'],
      alua: [null, null, 'names'],
      kai: [null, null, 'names'],
      manual: ['f', 'manual', null],
      emoji: [null, null, 'gemini'], // отправлять нечего — сразу «выбери сам»
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

    // 4. На следующий день: Genderize знает Kai, остальных — Gemini (ИИ телефона нет).
    net.genderizeReply = null;
    phone.now = pausedUntil;
    await phone.launch();
    assert.deepEqual(phone.state(), {
      anna: ['f', 'names', null],
      'sasha-f': ['f', 'names', null],
      sasha: [null, null, 'gemini'],
      zhenya: [null, null, 'gemini'],
      alua: ['f', 'gemini', null],
      kai: ['m', 'genderize', null],
      manual: ['f', 'manual', null],
      emoji: [null, null, 'gemini'],
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
      alua: ['f', 'gemini', null],
      kai: ['m', 'genderize', null],
      manual: ['f', 'manual', null],
      emoji: [null, null, 'gemini'],
      robin: ['m', 'device-ai', null],
    });
    assert.deepEqual(device.asked, ['Robin'], 'ИИ телефона спросили только про нового');

    assert.equal(net.maxAnswered('genderize'), 1);
    assert.equal(net.maxAnswered('gemini'), 1);
    const sentNames = [...net.genderizeCalls.flatMap((c) => genderizeNames(c.url)), ...net.geminiCalls.flatMap((c) => geminiNames(c.body!))];
    // Без сети и при лимите имена тоже уходили (ответа не было) — но наружу уходили только эти имена.
    assert.deepEqual([...new Set(sentNames)].sort(), ['Kai', 'Robin', 'Алуашка', 'Женя', 'Саша']);
    const raw = net.calls.map((c) => decodeURIComponent(c.url) + (c.body ?? '')).join(' ');
    for (const secret of ['Иванова', 'Ким', '999', '707', '🌸']) assert.ok(!raw.includes(secret), `«${secret}» не должно уходить`);
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
        { id: 's', name: 'Саша', phone: '', genderStage: 'genderize' },
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
    const r = await genderPass([{ id: 's', name: 'Саша', phone: '' }], { fetch: net.fetch }, { now: T0 });
    assert.deepEqual(r.problems, ['Genderize: лимит исчерпан']);
    assert.equal(r.backoff.genderize, T0 + BACKOFF_RATE_LIMIT);
  });
});
