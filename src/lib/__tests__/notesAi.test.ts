/// <reference types="node" />
// Соцсети и подсказки из заметок и «О себе» силами ИИ: ответу не верим на слово — ник и адрес должны быть в тексте,
// очищенная заметка не добавляет слов и не выкидывает живой текст, подсказки опираются на текст.
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
  restIsSafe,
  retidySeen,
  tidyRest,
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
  test('очищенный текст: можно только убрать ссылки и подписи, но не дописать и не выкинуть живой текст', () => {
    const links = [{ network: 'instagram', handle: 'anya.photo' }];
    assert.ok(restIsSafe('Фотограф. Пишите в директ: inst anya.photo', 'Фотограф.', links));
    assert.ok(!restIsSafe('Фотограф', 'Фотограф и путешественница', links), 'добавила слово');
    const long = 'Люблю горы, кофе и старые фильмы. Работаю в школе учителем музыки уже десять лет, играю на скрипке и пианино по вечерам. inst: anya.photo';
    assert.ok(!restIsSafe(long, 'Люблю горы.', links), 'выкинула живой текст');
    assert.ok(restIsSafe(long, long.replace(' inst: anya.photo', ''), links));
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
    assert.equal(got?.get(1)?.rest, 'Б');
  });
  test('текст длиннее предела не чистим — конец ИИ не видел', () => {
    const text = `${'слово '.repeat(NOTES_MAX_TEXT / 5)}inst: anya`;
    const got = parseNotesAnswer(answer([{ i: 0, links: [{ network: 'instagram', handle: 'anya' }], rest: 'слово' }]), [text]);
    assert.equal(got?.get(0)?.rest, null);
    assert.equal(got?.get(0)?.links.length, 1);
  });
  test('подпись, висящая после ссылки («Донаты:»), и тире в конце строки уходят; пустые строки — только где были', () => {
    const text = 'Мой канал о путешествиях — t.me/travel_kat\nДонаты: boosty.to/kat';
    const links = [
      { network: 'telegram', url: 't.me/travel_kat' },
      { network: 'boosty', url: 'boosty.to/kat' },
    ];
    assert.equal(tidyRest('Мой канал о путешествиях —\nДонаты:', text, links), 'Мой канал о путешествиях');
    assert.equal(tidyRest('Важно:\nне опаздывать', 'Важно:\nне опаздывать', []), 'Важно:\nне опаздывать', 'обычный заголовок в заметке не трогаем');
    assert.equal(tidyRest('Пою и рисую\n\nМосква', 'Пою и рисую\n📸 inst: a\nМосква', []), 'Пою и рисую\nМосква');
    assert.equal(tidyRest('Абзац\n\nЕщё', 'Абзац\n\nЕщё inst: a', []), 'Абзац\n\nЕщё');
  });
  test('подпись сети без ссылки в конце строки («О себе: инст:», «мой тг —») уходит — баг с телефона', () => {
    const links = [{ network: 'instagram', handle: 'dianka' }];
    assert.equal(tidyRest('О себе: инст:', 'О себе: инст: dianka', links), '');
    assert.equal(tidyRest('Фотограф. инст:', 'Фотограф. инст: dianka', links), 'Фотограф.');
    assert.equal(tidyRest('Фотограф, мой тг —', 'Фотограф, мой тг — @dianka', [{ network: 'telegram', handle: 'dianka' }]), 'Фотограф');
    assert.equal(tidyRest('Пою · inst', 'Пою · inst @dianka', links), 'Пою', 'без двоеточия — если за подписью шла ссылка');
    assert.equal(tidyRest('Смотрит youtube', 'Смотрит youtube', []), 'Смотрит youtube', 'название сети в тексте без ссылки — живой текст');
    assert.equal(tidyRest('Люблю фото', 'Люблю фото instagram.com/dianka', [{ network: 'instagram', url: 'instagram.com/dianka' }]), 'Люблю фото', 'слово перед ссылкой — не подпись');
    assert.equal(tidyRest('О себе: Донаты:', 'О себе: Донаты: boosty.to/kat', [{ network: 'boosty', url: 'boosty.to/kat' }]), '');
  });
  test('заметки, разобранные прошлой версией, доочищаются без ИИ и остаются разобранными', () => {
    const old = friend({ notes: 'О себе: инст:', notesSeen: notesHash('О себе: инст:') });
    const fixed = retidySeen(old);
    assert.equal(fixed.notes, '');
    assert.equal(fixed.notesSeen, notesHash(''));
    const fine = friend({ notes: 'О себе: Фотограф', notesSeen: notesHash('О себе: Фотограф') });
    assert.equal(retidySeen(fine), fine);
    const own = friend({ notes: 'Мой тг:', notesSeen: undefined });
    assert.equal(retidySeen(own), own, 'неразобранные заметки не трогаем');
  });
  test('наша подпись «О себе:» без текста после неё уходит вместе со ссылками', () => {
    assert.equal(tidyRest('О себе: \nДругое'), 'Другое');
    assert.equal(tidyRest('О себе: Фотограф'), 'О себе: Фотограф');
    const got = parseNotesAnswer(answer([{ i: 0, links: [{ network: 'instagram', url: 'instagram.com/katty.sh' }], rest: 'О себе:' }]), ['О себе: instagram.com/katty.sh']);
    assert.equal(got?.get(0)?.rest, '');
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
      r.updates.map((u) => [u.id, u.notes, u.links.map((l) => `${l.network}:${l.handle}`), u.facts]),
      [
        ['tg', 'О себе: Фотограф.', ['instagram:anya.photo'], {}],
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
    assert.deepEqual(bad.updates.map((u) => [u.id, u.notes, u.links.length]), [['own', 'Любит пионы', 0]]);
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
    notes: 'О себе: Фотограф.',
    links: [
      { id: 'n1', network: 'instagram', url: 'https://instagram.com/anya.photo', handle: 'anya.photo', source: 'notes' as const },
      { id: 'n2', network: 'vk', url: 'https://vk.com/anya_s', handle: 'anya_s', source: 'notes' as const },
    ],
    facts: { food: 'кофе', flowers: 'пионы' },
  };
  test('заметка чистится, ссылки добавляются без дублей (ручные главнее), подсказки — только в пустые поля', () => {
    const next = applyNotesUpdate(f, u);
    assert.equal(next.notes, 'О себе: Фотограф.');
    assert.deepEqual(next.socials?.map((l) => l.id), ['m', 'n2']);
    assert.equal(next.food, 'суши', 'своё не перезаписываем');
    assert.equal(next.flowers, 'пионы');
    assert.equal(next.notesSeen, notesHash('О себе: Фотограф.'));
    assert.equal('notesQueue' in next, false);
    assert.equal(notesPending(next, 'all'), false, 'разобранное второй раз не отправляем');
    assert.deepEqual(notesChanges(f, next), { links: 1, facts: 1, cleaned: true });
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
    assert.deepEqual(notesSummary(list, r, 'all'), { status: 'done', friends: 2, withLinks: 1, links: 1, facts: 1, cleaned: 1, left: 1 });
    assert.equal(notesSummary(list, { updates: [], unavailable: true }, 'all').status, 'unavailable');
  });
});
