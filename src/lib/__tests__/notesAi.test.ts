/// <reference types="node" />
// Соцсети и подсказки из заметок и «О себе» силами ИИ: ответу не верим на слово — ник и адрес должны быть в тексте,
// подсказки опираются на текст. Сама заметка при разборе не меняется.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { AiResult, AiRunner, AiTask } from '../ai/types';
import {
  NOTES_BATCH,
  NOTES_MAX_TEXT,
  NOTES_TASK,
  applyNotesUpdate,
  notesBatches,
  notesChanges,
  notesHash,
  notesPass,
  notesPending,
  notesPrompt,
  notesSummary,
  parseNotesAnswer,
  toSocialLink,
  type NotesSubject,
} from '../notesAi';

const friend = (patch: Partial<NotesSubject> = {}): NotesSubject => ({ id: 'a', notes: '', food: '', flowers: '', gifts: '', ...patch });
const ids = () => {
  let n = 0;
  return () => `l${n++}`;
};
const answer = (items: unknown[]) => JSON.stringify({ items });

describe('вопрос', () => {
  test('правила, каталог сетей и тексты — JSON, длинный текст обрезан', () => {
    const p = notesPrompt(['Фотограф. inst: anya', 'x'.repeat(NOTES_MAX_TEXT + 50)]);
    assert.match(p, /Сети: telegram, instagram, /);
    assert.match(p, /ok \(Одноклассники\)/, 'неочевидные id — с названием');
    assert.match(p, /"i":0,"text":"Фотограф\. inst: anya"/);
    assert.ok(!p.includes('x'.repeat(NOTES_MAX_TEXT + 1)));
    assert.equal(NOTES_TASK.id, 'notes');
    assert.equal(NOTES_TASK.request(['a']).json, true);
  });
  test('текст обратно не просим: заметку не переписываем, ответ короткий', () => {
    const p = notesPrompt(['Фотограф. inst: anya']);
    assert.ok(!/\brest\b/.test(p), 'в вопросе нет «очищенного текста»');
    assert.match(p, /Сам текст не пересказывай и не возвращай/);
    const long = Array.from({ length: 15 }, () => 'x'.repeat(NOTES_MAX_TEXT));
    assert.ok((NOTES_TASK.request(long).maxTokens ?? 0) < 4000, 'ответ не растёт вместе с длиной заметок');
  });
});

describe('ответ', () => {
  const bio = 'Фотограф из Казани. inst: anya.photo, vk.com/anya_s, @anya_channel. Пишите на anya@mail.ru';
  test('ссылки — только те, что буквально есть в тексте; почта — не соцсеть', () => {
    const got = parseNotesAnswer(
      answer([
        {
          i: 0,
          links: [
            { network: 'instagram', handle: 'anya.photo' },
            { network: 'vk', url: 'vk.com/anya_s' },
            { network: 'telegram', handle: 'anya_channel' },
            { network: 'tiktok', handle: 'anya_dance' }, // выдумала
            { network: 'site', url: 'mail.ru' }, // хвост почты
            { network: 'telegram', handle: 'anya' }, // это почта anya@mail.ru
            { network: 'instagram', url: 'instagram.com/anya.real' }, // нет в тексте
          ],
          rest: 'Фотограф из Казани.',
        },
      ]),
      [bio],
    );
    assert.deepEqual(got?.get(0)?.links, [
      { network: 'instagram', handle: 'anya.photo' },
      { network: 'vk', url: 'vk.com/anya_s' },
      { network: 'telegram', handle: 'anya_channel' },
    ]);
  });
  test('подсказки — только опирающиеся на текст; ответ не по формату — null', () => {
    const text = 'Обожаю пионы и кофе, собираю виниловые пластинки';
    const got = parseNotesAnswer(answer([{ i: 0, links: [], rest: text, facts: { flowers: 'пионы', food: 'кофе', gifts: 'виниловые пластинки', cake: 'торт' } }]), [text]);
    assert.deepEqual(got?.get(0)?.facts, { flowers: 'пионы', food: 'кофе', gifts: 'виниловые пластинки' });
    const made = parseNotesAnswer(answer([{ i: 0, links: [], rest: text, facts: { gifts: 'духи и сертификат в спа' } }]), [text]);
    assert.deepEqual(made?.get(0)?.facts, {}, 'выдуманная подсказка');
    assert.equal(parseNotesAnswer('не знаю', [text]), null);
    assert.equal(parseNotesAnswer('{"foo":1}', [text]), null);
  });
  test('ответ в обёртке и с рассуждениями, номера строкой; чужие и повторные номера пропускаем', () => {
    const got = parseNotesAnswer(`<think>хм</think>\n\`\`\`json\n${answer([{ i: '1', links: [], rest: 'Б' }, { i: 1, rest: 'дубль' }, { i: 7, rest: 'x' }])}\n\`\`\``, ['А', 'Б']);
    assert.deepEqual([...(got?.keys() ?? [])], [1]);
  });
  test('старый ответ с «очищенным текстом» не мешает: поле rest просто не берём', () => {
    const got = parseNotesAnswer(answer([{ i: 0, links: [{ network: 'instagram', handle: 'anya' }], rest: 'Фотограф' }]), ['Фотограф. inst: anya']);
    assert.deepEqual(got?.get(0), { links: [{ network: 'instagram', handle: 'anya' }], facts: {} });
  });
  test('длинный текст: ссылки из отправленного начала берём', () => {
    const text = `inst: anya ${'слово '.repeat(NOTES_MAX_TEXT / 5)}`;
    const got = parseNotesAnswer(answer([{ i: 0, links: [{ network: 'instagram', handle: 'anya' }] }]), [text]);
    assert.equal(got?.get(0)?.links.length, 1);
  });
});

describe('ссылки для приложения', () => {
  test('адрес разбирается по каталогу: домен главнее названия сети', () => {
    const l = toSocialLink({ network: 'instagram', url: 'https://www.tiktok.com/@shameless66613' }, 'x');
    assert.deepEqual([l?.network, l?.handle, l?.source], ['tiktok', 'shameless66613', 'notes']);
  });
  test('ник, положенный в поле адреса («anya.photo» у Instagram), — всё равно ник, а не сайт', () => {
    const l = toSocialLink({ network: 'instagram', handle: 'anya.photo', url: 'anya.photo' }, 'x');
    assert.deepEqual([l?.network, l?.handle, l?.url], ['instagram', 'anya.photo', 'https://instagram.com/anya.photo']);
    const b = toSocialLink({ network: 'bluesky', handle: 'katty.bsky.social', url: 'katty.bsky.social' }, 'x');
    assert.deepEqual([b?.network, b?.handle], ['bluesky', 'katty.bsky.social']);
    const vk = toSocialLink({ network: 'vk', handle: 'anya_s', url: 'anya_s' }, 'x');
    assert.deepEqual([vk?.network, vk?.handle], ['vk', 'anya_s']);
  });
  test('ник — по сети; сайт — по адресу; ник без сети или сайт без адреса — ничего', () => {
    assert.deepEqual(toSocialLink({ network: 'vk', handle: 'anya_s' }, 'x'), { id: 'x', network: 'vk', url: 'https://vk.com/anya_s', handle: 'anya_s', source: 'notes' });
    const site = toSocialLink({ network: 'site', url: 'kattysings.ru' }, 'x');
    assert.deepEqual([site?.network, site?.label], ['site', 'kattysings.ru']);
    assert.equal(toSocialLink({ network: 'site', handle: 'anya' }, 'x'), null);
    assert.equal(toSocialLink({ network: 'nope', handle: 'anya' }, 'x'), null);
  });
});

/** ИИ для тестов: отвечает по правилу на каждый вопрос и запоминает вопросы. */
function fakeAi(reply: (texts: string[]) => AiResult<unknown> | string): AiRunner & { asked: string[][] } {
  const asked: string[][] = [];
  return {
    asked,
    async run<I, O>(task: AiTask<I, O>, input: I): Promise<AiResult<O>> {
      const texts = input as unknown as string[];
      asked.push(texts);
      const r = reply(texts);
      if (typeof r !== 'string') return r as AiResult<O>;
      const value = task.parse(r, input);
      return value === null ? { status: 'unusable', attempts: [] } : { status: 'ok', value, provider: 'gemini', model: 'm', attempts: [] };
    },
  };
}

describe('проход', () => {
  const tg = friend({ id: 'tg', notes: 'О себе: Фотограф. inst: anya.photo', notesQueue: true });
  const own = friend({ id: 'own', notes: 'Любит пионы' });
  const empty = friend({ id: 'empty', notes: '   ', notesQueue: true });
  const seen = friend({ id: 'seen', notes: 'Уже разобрано', notesSeen: notesHash('Уже разобрано') });
  const echo = (texts: string[]) =>
    answer(
      texts.map((t, i) =>
        t.includes('inst:')
          ? { i, links: [{ network: 'instagram', handle: 'anya.photo' }], rest: 'О себе: Фотограф.' }
          : { i, links: [], rest: t, ...(t.includes('пионы') && { facts: { flowers: 'пионы' } }) },
      ),
    );

  test('в фоне — только из очереди (импорт), из меню — все неразобранные; пустые и разобранные не трогаем', async () => {
    assert.deepEqual([tg, own, empty, seen].filter((f) => notesPending(f, 'queued')).map((f) => f.id), ['tg']);
    assert.deepEqual([tg, own, empty, seen].filter((f) => notesPending(f, 'all')).map((f) => f.id), ['tg', 'own']);
    const ai = fakeAi(echo);
    const r = await notesPass([tg, own, empty, seen], ai, { mode: 'all', idFor: ids() });
    assert.equal(ai.asked.length, 1, 'одним вопросом');
    assert.deepEqual(ai.asked[0], [tg.notes, own.notes]);
    assert.equal(r.unavailable, false);
    assert.deepEqual(
      r.updates.map((u) => [u.id, u.before, u.links.map((l) => `${l.network}:${l.handle}`), u.facts]),
      [
        ['tg', tg.notes, ['instagram:anya.photo'], {}],
        ['own', 'Любит пионы', [], { flowers: 'пионы' }],
      ],
    );
  });
  test('ИИ недоступен — остановились, разобранное до этого сохраняется; ответил не по делу — заметка считается разобранной', async () => {
    const many = Array.from({ length: NOTES_BATCH.items + 2 }, (_, k) => friend({ id: `f${k}`, notes: `Заметка ${k}` }));
    let calls = 0;
    const r = await notesPass(many, fakeAi((t) => (calls++ === 0 ? echo(t) : { status: 'unavailable', attempts: [] })), { mode: 'all', idFor: ids() });
    assert.equal(r.unavailable, true);
    assert.equal(r.updates.length, NOTES_BATCH.items);
    const bad = await notesPass([own], fakeAi(() => 'ерунда'), { mode: 'all', idFor: ids() });
    assert.deepEqual(bad.updates.map((u) => [u.id, u.before, u.links.length]), [['own', 'Любит пионы', 0]]);
  });
  test('текст, который модель пропустила, — спросим в следующий раз', async () => {
    const r = await notesPass([tg, own], fakeAi(() => answer([{ i: 1, links: [], rest: 'Любит пионы' }])), { mode: 'all', idFor: ids() });
    assert.deepEqual(r.updates.map((u) => u.id), ['own']);
  });
  test('пачки — по числу текстов и символов', () => {
    const list = Array.from({ length: 40 }, (_, k) => ({ notes: k < 3 ? 'x'.repeat(2500) : 'короткая' }));
    const sizes = notesBatches(list).map((b) => b.length);
    assert.equal(sizes.reduce((a, b) => a + b, 0), 40);
    assert.ok(sizes.every((n) => n <= NOTES_BATCH.items));
    assert.ok(notesBatches(list).every((b) => b.reduce((n, f) => n + Math.min(f.notes.length, NOTES_MAX_TEXT), 0) <= Math.max(NOTES_BATCH.chars, NOTES_MAX_TEXT)));
  });
});

describe('применение', () => {
  const f = friend({
    notes: 'О себе: Фотограф. inst: anya.photo',
    food: 'суши',
    notesQueue: true,
    socials: [{ id: 'm', network: 'instagram', url: 'https://instagram.com/anya.photo', handle: 'anya.photo', source: 'manual' }],
  });
  const u = {
    id: 'a',
    before: f.notes,
    links: [
      { id: 'n1', network: 'instagram', url: 'https://instagram.com/anya.photo', handle: 'anya.photo', source: 'notes' as const },
      { id: 'n2', network: 'vk', url: 'https://vk.com/anya_s', handle: 'anya_s', source: 'notes' as const },
    ],
    facts: { food: 'кофе', flowers: 'пионы' },
  };
  test('заметка остаётся как была, ссылки добавляются без дублей (ручные главнее), подсказки — только в пустые поля', () => {
    const next = applyNotesUpdate(f, u);
    assert.equal(next.notes, 'О себе: Фотограф. inst: anya.photo', 'ссылку из заметки не вырезаем');
    assert.deepEqual(next.socials?.map((l) => l.id), ['m', 'n2']);
    assert.equal(next.food, 'суши', 'своё не перезаписываем');
    assert.equal(next.flowers, 'пионы');
    assert.equal(next.notesSeen, notesHash(f.notes));
    assert.equal('notesQueue' in next, false);
    assert.equal(notesPending(next, 'all'), false, 'разобранное второй раз не отправляем');
    assert.deepEqual(notesChanges(f, next), { links: 1, facts: 1 });
  });
  test('заметку поменяли, пока ИИ думал, — ничего не трогаем', () => {
    const edited = { ...f, notes: 'Новая заметка' };
    assert.equal(applyNotesUpdate(edited, u), edited);
  });
  test('поменял разобранную заметку — её снова можно разобрать из меню', () => {
    const next = applyNotesUpdate(f, u);
    assert.equal(notesPending({ ...next, notes: `${next.notes} tg: @anya` }, 'all'), true);
    assert.equal(notesPending({ ...next, notes: `${next.notes} tg: @anya` }, 'queued'), false);
  });
});

describe('итог', () => {
  test('сколько друзей, соцсетей, подсказок и сколько ещё ждут', async () => {
    const list = [
      friend({ id: 'a', notes: 'inst: anya.photo' }),
      friend({ id: 'b', notes: 'Обожаю пионы' }),
      friend({ id: 'c', notes: 'Просто заметка' }),
      friend({ id: 'd', notes: 'Не успели' }),
    ];
    const ai = fakeAi((texts) =>
      texts.length === 4
        ? answer([
            { i: 0, links: [{ network: 'instagram', handle: 'anya.photo' }], rest: '' },
            { i: 1, links: [], rest: 'Обожаю пионы', facts: { flowers: 'пионы' } },
            { i: 2, links: [], rest: 'Просто заметка' },
          ])
        : 'x',
    );
    const r = await notesPass(list, ai, { mode: 'all', idFor: ids() });
    assert.deepEqual(notesSummary(list, r, 'all'), { status: 'done', friends: 2, withLinks: 1, links: 1, facts: 1, left: 1 });
    const after = list.map((f) => applyNotesUpdate(f, r.updates.find((u) => u.id === f.id)));
    assert.deepEqual(after.map((f) => f.notes), list.map((f) => f.notes), 'ни одна заметка не изменилась');
    assert.equal(notesSummary(list, { updates: [], unavailable: true }, 'all').status, 'unavailable');
  });
});
