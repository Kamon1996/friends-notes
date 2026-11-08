/// <reference types="node" />
// Ступени определения пола на подставном интернете: Genderize, встроенный ИИ, Gemini, ошибки и согласие.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  detectGenders,
  devicePrompt,
  geminiBody,
  genderizeUrl,
  parseDeviceAnswer,
  parseGemini,
  parseGenderize,
  type DeviceAiStatus,
  type GenderDeps,
  type GenderPerson,
} from '../genderDetect';

const person = (id: string, name: string, phone = ''): GenderPerson => ({ id, name, phone });
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

/** Подставной интернет: отвечает по адресу, запоминает запросы. */
function net(handler: (url: string, body?: string) => { status: number; body: unknown }) {
  const calls: { url: string; body?: string; headers?: Record<string, string> }[] = [];
  const fetch: GenderDeps['fetch'] = async (url, init) => {
    calls.push({ url, body: init?.body, headers: init?.headers });
    const r = handler(url, init?.body);
    return json(r.status, r.body);
  };
  return { fetch, calls };
}
const geminiAnswer = (list: unknown) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(list) }] } }] });

describe('разбор ответов', () => {
  test('Genderize: берём только уверенные ответы по многим людям', () => {
    const r = parseGenderize([
      { name: 'Алуа', gender: 'female', probability: 0.99, count: 1200 },
      { name: 'Саша', gender: 'male', probability: 0.62, count: 9000 },
      { name: 'Редкое', gender: 'female', probability: 1, count: 3 },
      { name: 'Пусто', gender: null, probability: 0, count: 0 },
      'мусор',
    ]);
    assert.deepEqual([...r], [['алуа', 'f']]);
    assert.deepEqual([...parseGenderize({ name: 'Ерлан', gender: 'male', probability: 0.98, count: 400 })], [['ерлан', 'm']]);
    assert.deepEqual([...parseGenderize(null)], []);
  });

  test('адрес Genderize: имена закодированы, страна — если знаем', () => {
    assert.equal(genderizeUrl(['Алуа', 'Саша'], 'KZ'), `https://api.genderize.io?name[]=${encodeURIComponent('Алуа')}&name[]=${encodeURIComponent('Саша')}&country_id=KZ`);
    assert.ok(!genderizeUrl(['A']).includes('country_id'));
  });

  test('Gemini: JSON по номерам строк, «u» и мусор — «не знаем»', () => {
    assert.deepEqual([...parseGemini(geminiAnswer([{ i: 0, g: 'f' }, { i: 1, g: 'u' }, { i: 2, g: 'm' }, { i: 9, g: 'f' }, { i: 'x', g: 'm' }]), 3)], [
      [0, 'f'],
      [2, 'm'],
    ]);
    assert.deepEqual([...parseGemini({ candidates: [{ content: { parts: [{ text: '```json\n[{"i":0,"g":"m"}]\n```' }] } }] }, 1)], [[0, 'm']], 'обёртка ``` не мешает');
    assert.deepEqual([...parseGemini({ candidates: [{ content: { parts: [{ text: 'не JSON' }] } }] }, 1)], []);
    assert.deepEqual([...parseGemini({}, 1)], []);
  });

  test('запрос к Gemini: имена пронумерованы, температура 0, ответ JSON', () => {
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
    assert.equal(parseDeviceAnswer('женщина или мужчина'), null, 'оба — не знаем');
    assert.equal(parseDeviceAnswer(''), null);
    assert.match(devicePrompt('Алуашка'), /«Алуашка»/);
  });
});

describe('ступени вместе', () => {
  const people = [
    person('a', 'Аня Смирнова', '+7 999 123-45-67'),
    person('b', 'Алуашка', '+7 707 606 39 03'),
    person('c', 'Саша Ким', '+7 999 000-00-00'),
    person('d', 'Мама'),
    person('e', 'Котик'),
  ];

  test('без согласия: своя база и встроенный ИИ, в интернет — ничего', async () => {
    const n = net(() => ({ status: 500, body: null }));
    const r = await detectGenders(people, { fetch: n.fetch }, { online: false });
    assert.deepEqual(r.found.map((f) => [f.id, f.gender, f.by]), [['a', 'f', 'names'], ['d', 'f', 'names']]);
    assert.deepEqual(r.unknown, ['b', 'c', 'e']);
    assert.equal(n.calls.length, 0);
  });

  test('Genderize: только имя и страна по номеру; сначала своя база', async () => {
    const n = net((url) => ({
      status: 200,
      body: url.includes('KZ') ? [{ name: 'Алуашка', gender: 'female', probability: 0.97, count: 40 }] : [{ name: 'Саша', gender: 'male', probability: 0.6, count: 5000 }, { name: 'Котик', gender: null, probability: 0, count: 0 }],
    }));
    const r = await detectGenders(people, { fetch: n.fetch }, { online: true });
    assert.deepEqual(r.found.map((f) => [f.id, f.by]), [['a', 'names'], ['d', 'names'], ['b', 'genderize']]);
    assert.deepEqual(r.unknown, ['c', 'e']);
    assert.ok(n.calls.every((c) => !/Ким|Смирнова|999|707/.test(decodeURIComponent(c.url))), 'ни фамилий, ни номеров');
    assert.ok(n.calls.some((c) => c.url.endsWith('country_id=KZ')) && n.calls.some((c) => c.url.endsWith('country_id=RU')));
  });

  test('встроенный ИИ есть — спрашиваем его, Gemini не трогаем, даже с ключом', async () => {
    const asked: string[] = [];
    const deviceAi = { status: async (): Promise<DeviceAiStatus> => 'available', generate: async (p: string) => (asked.push(p), p.includes('Котик') ? 'неизвестно' : 'мужчина') };
    const n = net((url) => (url.includes('genderize') ? { status: 200, body: [] } : { status: 200, body: geminiAnswer([]) }));
    const r = await detectGenders(people, { fetch: n.fetch, deviceAi, geminiKey: 'k' }, { online: true });
    assert.deepEqual(r.found.filter((f) => f.by === 'device-ai').map((f) => f.id), ['b', 'c']);
    assert.deepEqual(r.unknown, ['e']);
    assert.ok(!n.calls.some((c) => c.url.includes('generativelanguage')));
    assert.ok(asked.some((p) => p.includes('«Саша Ким»')), 'встроенному ИИ — запись целиком: данные не уходят с телефона');
  });

  test('встроенного ИИ нет — Gemini: только имена, ключ в заголовке, а не в адресе', async () => {
    const deviceAi = { status: async (): Promise<DeviceAiStatus> => 'unavailable', generate: async () => 'мужчина' };
    const n = net((url) => (url.includes('genderize') ? { status: 200, body: [] } : { status: 200, body: geminiAnswer([{ i: 0, g: 'f' }, { i: 1, g: 'u' }, { i: 2, g: 'u' }]) }));
    const r = await detectGenders(people, { fetch: n.fetch, deviceAi, geminiKey: 'secret' }, { online: true });
    assert.deepEqual(r.found.filter((f) => f.by === 'gemini').map((f) => f.id), ['b']);
    const call = n.calls.find((c) => c.url.includes('generativelanguage'))!;
    assert.equal(call.headers?.['x-goog-api-key'], 'secret');
    assert.ok(!call.url.includes('secret'));
    assert.ok(!/Ким/.test(call.body ?? ''), 'фамилию не отправляем');
    assert.match(call.body ?? '', /Алуашка/);
  });

  test('модель переименовали (404) — пробуем следующую', async () => {
    const n = net((url) => (url.includes('genderize') ? { status: 200, body: [] } : url.includes('lite') ? { status: 404, body: {} } : { status: 200, body: geminiAnswer([{ i: 0, g: 'f' }]) }));
    const r = await detectGenders([person('b', 'Алуашка')], { fetch: n.fetch, geminiKey: 'k' }, { online: true });
    assert.deepEqual(r.found.map((f) => f.by), ['gemini']);
  });

  test('ошибки не роняют: лимит Genderize, страна не поддерживается Gemini — остаёмся с тем, что есть', async () => {
    const n = net((url) => (url.includes('genderize') ? { status: 429, body: {} } : { status: 400, body: { error: { status: 'FAILED_PRECONDITION', message: 'User location is not supported for the API use.' } } }));
    const r = await detectGenders(people, { fetch: n.fetch, geminiKey: 'k' }, { online: true });
    assert.deepEqual(r.found.map((f) => f.id), ['a', 'd']);
    assert.deepEqual(r.problems, ['Genderize: лимит на сегодня исчерпан', 'Gemini недоступен в этой стране']);
    const down: GenderDeps['fetch'] = async () => {
      throw new Error('нет сети');
    };
    const r2 = await detectGenders(people, { fetch: down, geminiKey: 'k' }, { online: true });
    assert.deepEqual(r2.problems, ['Genderize недоступен', 'нет сети']);
  });

  test('без ключа Gemini третья ступень просто пропускается', async () => {
    const n = net(() => ({ status: 200, body: [] }));
    const r = await detectGenders(people, { fetch: n.fetch }, { online: true });
    assert.ok(!n.calls.some((c) => c.url.includes('generativelanguage')));
    assert.deepEqual(r.problems, []);
  });
});
