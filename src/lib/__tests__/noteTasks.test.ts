/// <reference types="node" />
// «Из заметки — в дела»: даты и время приложение читает из слов само, выдуманное отсеивает, чего в тексте нет — не ставит.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { NOTE_MAX_ITEMS, NOTE_MAX_TEXT, NOTE_TASK, dateFromWords, draftsFromNote, missedIntents, notePrompt, parseNoteAnswer, timeFromWords, todayContext, type NoteInput } from '../noteTasks';

const TODAY = '2026-11-11'; // среда
const NOW = new Date(2026, 10, 11, 14, 30).getTime();
const answer = (items: unknown[]) => JSON.stringify({ items });
const item = (patch: Record<string, unknown>) => ({ type: 'task', title: '', quote: '', kind: 'due', date: null, time: null, repeat: null, person: null, note: '', sure: true, ...patch });
const parse = (text: string, items: unknown[]) => parseNoteAnswer(answer(items), { text, now: NOW });

describe('дата из слов', () => {
  const d = (text: string) => dateFromWords(text, TODAY);
  test('сегодня, завтра, послезавтра', () => {
    assert.equal(d('сегодня вечером'), '2026-11-11');
    assert.equal(d('завтра позвонить'), '2026-11-12');
    assert.equal(d('послезавтра'), '2026-11-13');
  });
  test('день недели — ближайший, не сегодня; «следующая» — на следующей неделе; два дня недели и «по» — не срок', () => {
    assert.equal(d('в пятницу забрать торт'), '2026-11-13');
    assert.equal(d('в среду к врачу'), '2026-11-18', 'сегодня среда — значит, следующая');
    assert.equal(d('в пн созвон'), '2026-11-16');
    assert.equal(d('в следующую пятницу'), '2026-11-20');
    assert.equal(d('по вт и чт бассейн'), null);
    assert.equal(d('каждую пятницу уборка'), null);
    assert.equal(d('встреча в среду или четверг'), null);
  });
  test('число: «20го», «5-го», «25 декабря», прошедшее — на будущий год', () => {
    assert.equal(d('стоматолог 20го в 15:30'), '2026-11-20');
    assert.equal(d('оплата 5-го'), '2026-12-05');
    assert.equal(d('11-го сдать'), '2026-11-11');
    assert.equal(d('25 декабря корпоратив'), '2026-12-25');
    assert.equal(d('3 ноября'), '2027-11-03');
    assert.equal(d('др у Кати 14 февраля'), '2027-02-14');
    assert.equal(d('1 мая 2027 свадьба'), '2027-05-01');
    assert.equal(d('31 ноября'), null, 'такого дня нет');
    assert.equal(d('счётчики передать до 25 числа'), '2026-11-25');
    assert.equal(d('5 числа каждого месяца платить за квартиру'), '2026-12-05');
    assert.equal(d('к 20-му сдать отчёт'), '2026-11-20');
  });
  test('цифрами: «20.11», «05.03», с годом; «в 15.30» — время, а не день', () => {
    assert.equal(d('сдать до 20.11'), '2026-11-20');
    assert.equal(d('к 20.11 отчёт'), '2026-11-20');
    assert.equal(d('05.03 концерт'), '2027-03-05');
    assert.equal(d('20.11.2026'), '2026-11-20');
    assert.equal(d('встреча в 15.30'), null);
    assert.equal(d('в 10.30 созвон'), null);
  });
  test('«через…»: неделю, три дня, две недели, месяц; «через день» двусмысленно', () => {
    assert.equal(d('через неделю'), '2026-11-18');
    assert.equal(d('через 3 дня'), '2026-11-14');
    assert.equal(d('через две недели'), '2026-11-25');
    assert.equal(d('через месяц'), '2026-12-11');
    assert.equal(d('через день'), null);
  });
  test('размытое не читаем: «на выходных», «в конце месяца», «в декабре», «на днях»', () => {
    for (const t of ['на выходных', 'в конце месяца', 'в декабре', 'на днях', 'как-нибудь', 'купить хлеб']) assert.equal(d(t), null, t);
  });
});

describe('время из слов', () => {
  test('«15:30», «в 15.30», «в 7 вечера», «в 9 утра», «в 2 дня», «в 12 ночи»', () => {
    assert.equal(timeFromWords('стоматолог в 15:30'), '15:30');
    assert.equal(timeFromWords('встреча в 15.30'), '15:30');
    assert.equal(timeFromWords('в 7 вечера'), '19:00');
    assert.equal(timeFromWords('бассейн в 9 утра'), '09:00');
    assert.equal(timeFromWords('в 2 дня'), '14:00');
    assert.equal(timeFromWords('в 12 дня'), '12:00');
    assert.equal(timeFromWords('в 12 ночи'), '00:00');
    assert.equal(timeFromWords('в 8 часов вечера'), '20:00');
  });
  test('просто «в 7», «до 12», дата «20.11» — не время', () => {
    for (const t of ['в 7', 'забрать до 12', '20.11 концерт', 'утром', 'купить хлеб']) assert.equal(timeFromWords(t), null, t);
  });
});

describe('вопрос', () => {
  test('сегодняшний день и две недели вперёд — готовым списком с днями недели', () => {
    const c = todayContext(NOW);
    assert.match(c, /Сегодня: среда, 11 ноября 2026 \(2026-11-11\), 14:30\./);
    assert.match(c, /Ближайшие дни: 2026-11-12 чт, 2026-11-13 пт, /);
    assert.match(c, /2026-11-25 ср\.$/);
  });
  test('текст заметки — данными в JSON; длинный обрезан; задача зарегистрирована', () => {
    const p = notePrompt({ text: 'купить "хлеб"\nи молоко', now: NOW });
    assert.ok(p.includes('{"text":"купить \\"хлеб\\"\\nи молоко"}'));
    assert.ok(!notePrompt({ text: 'x'.repeat(NOTE_MAX_TEXT + 50), now: NOW }).includes('x'.repeat(NOTE_MAX_TEXT + 1)));
    assert.equal(NOTE_TASK.id, 'noteTasks');
    assert.equal(NOTE_TASK.request({ text: 'a', now: NOW }).json, true);
    assert.ok((NOTE_TASK.request({ text: 'x'.repeat(50_000), now: NOW }).maxTokens ?? 0) <= 8000);
    assert.ok((NOTE_TASK.request({ text: 'купить хлеб', now: NOW }).maxTokens ?? 0) >= 1500, 'короткой заметке тоже нужен запас: ответ длиннее вопроса');
  });
});

describe('ответ', () => {
  const text = 'в пятницу забрать торт до 12. купить Ане цветы. стоматолог 20го в 15:30. по вт и чт бассейн в 7 утра. может съездить к родителям. др у Кати 14 февраля';
  test('пример из правил: сроки, время, повтор, человек, неуверенное, день рождения', () => {
    const got = parse(text, [
      item({ title: 'забрать торт', quote: 'в пятницу забрать торт до 12', date: '2026-11-13', time: '12:00' }),
      item({ title: 'Купить цветы', quote: 'купить Ане цветы', person: 'Аня' }),
      item({ title: 'Стоматолог', quote: 'стоматолог 20го в 15:30', kind: 'at', date: '2026-11-20', time: '15:30' }),
      item({ title: 'Бассейн', quote: 'по вт и чт бассейн в 7 утра', kind: 'repeat', date: '2026-11-12', time: '07:00', repeat: { every: 1, unit: 'week', days: [4, 2] } }),
      item({ title: 'Съездить к родителям', quote: 'может съездить к родителям', sure: false }),
      item({ type: 'birthday', quote: 'др у Кати 14 февраля', date: '2027-02-14', person: 'Катя' }),
    ]);
    assert.ok(got);
    const [cake, flowers, dentist, pool, parents, bday] = got.drafts;
    assert.deepEqual([cake.title, cake.kind, cake.date, cake.time, cake.check, cake.missing], ['Забрать торт', 'due', '2026-11-13', '12:00', [], []]);
    assert.deepEqual([flowers.date, flowers.time, flowers.person, flowers.missing], [null, null, 'Аня', ['date']], 'срока в тексте нет — не ставим, поле ждёт человека');
    assert.deepEqual([dentist.kind, dentist.date, dentist.time], ['at', '2026-11-20', '15:30']);
    assert.deepEqual([pool.kind, pool.repeat, pool.date, pool.time], ['repeat', { every: 1, unit: 'week', days: [2, 4] }, '2026-11-12', '07:00']);
    assert.deepEqual([parents.sure, parents.missing], [false, ['date']]);
    assert.deepEqual([bday.type, bday.title, bday.person, bday.date, bday.kind, bday.missing], ['birthday', '', 'Катя', '2027-02-14', 'due', []]);
    assert.deepEqual(got.rest, [], 'весь текст разошёлся по делам');
  });
  test('дату считает приложение: модель ошиблась с пятницей — ставим свою, без пометки', () => {
    const got = parse('в пятницу забрать торт', [item({ title: 'Забрать торт', quote: 'в пятницу забрать торт', date: '2026-11-14' })]);
    assert.deepEqual([got?.drafts[0].date, got?.drafts[0].check], ['2026-11-13', []]);
    const none = parse('завтра в 7 вечера ужин', [item({ title: 'Ужин', quote: 'завтра в 7 вечера ужин', kind: 'at', date: null, time: '07:00' })]);
    assert.deepEqual([none?.drafts[0].date, none?.drafts[0].time], ['2026-11-12', '19:00'], 'и время тоже');
  });
  test('чего сами прочитать не можем — берём у модели и просим проверить', () => {
    const got = parse('в конце месяца сдать отчёт. бассейн в 7', [
      item({ title: 'Сдать отчёт', quote: 'в конце месяца сдать отчёт', date: '2026-11-30' }),
      item({ title: 'Бассейн', quote: 'бассейн в 7', kind: 'at', time: '07:00' }),
    ]);
    assert.deepEqual([got?.drafts[0].date, got?.drafts[0].check], ['2026-11-30', ['date']]);
    assert.deepEqual([got?.drafts[1].time, got?.drafts[1].check, got?.drafts[1].missing], ['07:00', ['time'], ['date']], '«в 7» — утра или вечера?');
  });
  test('выдуманное не берём: дело без опоры на текст, человек не из текста, время и дата не по формату', () => {
    const got = parse('купить хлеб', [
      item({ title: 'Купить хлеб', quote: 'купить хлеб', person: 'Сергей', date: '2026-13-45', time: '25:00', note: 'в магазине у дома за углом' }),
      item({ title: 'Позвонить в банк', quote: 'позвонить в банк' }),
      item({ title: '', quote: 'купить хлеб' }),
    ]);
    assert.equal(got?.drafts.length, 1);
    assert.deepEqual([got?.drafts[0].person, got?.drafts[0].date, got?.drafts[0].time, got?.drafts[0].note], [null, null, null, '']);
  });
  test('слово в названии не из текста — пометка «проверь название»; глагол действия добавить можно', () => {
    const got = parse('гинеколог - раз в год мастхев. нужен курс массажа', [
      item({ title: 'Мазок у гинеколога', quote: 'гинеколог - раз в год', kind: 'repeat', repeat: { every: 1, unit: 'year' } }),
      item({ title: 'Записаться на массаж', quote: 'нужен курс массажа' }),
    ]);
    assert.deepEqual(got?.drafts.map((d) => d.check), [['title'], []]);
    const meet = parse('Аня: давай в субботу в 5 вечера у меня', [item({ title: 'Встреча у Ани', quote: 'давай в субботу в 5 вечера у меня', kind: 'at', person: 'Аня' })]);
    assert.deepEqual(meet?.drafts[0].check, [], '«встреча» — обычное слово для такого дела, а не выдумка');
  });
  test('название из местоимений («Дойти до этого», «Встретиться у меня») — пометка «проверь название»', () => {
    const got = parse('не прям чекап всего, но думаю я еще дойду до этого. Аня: давай у меня', [
      item({ title: 'Дойти до этого', quote: 'думаю я еще дойду до этого', sure: false }),
      item({ title: 'Встретиться у меня', quote: 'давай у меня', person: 'Аня' }),
      item({ title: 'Пройти чекап', quote: 'не прям чекап всего' }),
    ]);
    assert.deepEqual(got?.drafts.map((d) => d.check), [['title'], ['title'], []]);
  });
  test('подарок без имени рядом с чьим-то днём рождения — этому человеку, с пометкой «проверь»', () => {
    const text = 'отвезти кота к ветеринару в субботу день рождения у Игоря подарок ещё не купил надо купить и родители приезжают встретить на вокзале';
    const got = parse(text, [
      item({ title: 'Отвезти кота к ветеринару', quote: 'отвезти кота к ветеринару' }),
      item({ type: 'birthday', quote: 'в субботу день рождения у Игоря', person: 'Игорь', date: '2026-11-14' }),
      item({ title: 'Купить подарок', quote: 'подарок ещё не купил надо купить' }),
      item({ title: 'Встретить на вокзале', quote: 'родители приезжают встретить на вокзале', person: 'Родители' }),
    ]);
    assert.deepEqual(got?.drafts.map((d) => [d.person, d.check]), [[null, []], ['Игорь', []], ['Игорь', ['person']], ['Родители', []]]);
    const named = parse('др у Кати 14 февраля. купить Оле подарок', [
      item({ type: 'birthday', quote: 'др у Кати 14 февраля', person: 'Катя' }),
      item({ title: 'Купить подарок', quote: 'купить Оле подарок', person: 'Оля' }),
    ]);
    assert.deepEqual([named?.drafts[1].person, named?.drafts[1].check], ['Оля', []], 'имя названо — не трогаем');
    const far = parse('др у Кати 14 февраля. купить хлеб. к новому году купить подарки', [
      item({ type: 'birthday', quote: 'др у Кати 14 февраля', person: 'Катя' }),
      item({ title: 'Купить хлеб', quote: 'купить хлеб' }),
      item({ title: 'Купить подарки', quote: 'к новому году купить подарки' }),
    ]);
    assert.equal(far?.drafts[2].person, null, 'не рядом — не связываем');
  });
  test('цитаты нет, но название из слов текста — берём без цитаты', () => {
    const got = parse('надо бы записаться к стоматологу', [item({ title: 'Записаться к стоматологу', quote: 'запишись к зубному' })]);
    assert.deepEqual([got?.drafts[0].title, got?.drafts[0].quote], ['Записаться к стоматологу', '']);
  });
  test('прошедший день без года — тот же день в будущем с пометкой; с годом в тексте — срока нет', () => {
    const next = parse('оплатить страховку где-то в начале ноября', [item({ title: 'Оплатить страховку', quote: 'оплатить страховку где-то в начале ноября', date: '2026-11-02' })]);
    assert.deepEqual([next?.drafts[0].date, next?.drafts[0].check], ['2027-11-02', ['date']]);
    const past = parse('в 2025 году обещал вернуть книгу', [item({ title: 'Вернуть книгу', quote: 'в 2025 году обещал вернуть книгу', date: '2025-06-01' })]);
    assert.deepEqual([past?.drafts[0].date, past?.drafts[0].missing], [null, ['date']]);
  });
  test('повтор без «как часто» остаётся повтором с пустым полем: привычка «пью железо», негодный ответ модели', () => {
    const habit = parse('пью железо', [item({ title: 'Выпить железо', quote: 'пью железо', kind: 'repeat', repeat: null })]);
    assert.deepEqual([habit?.drafts[0].kind, habit?.drafts[0].repeat, habit?.drafts[0].missing], ['repeat', null, ['repeat', 'date']]);
    const bad = parse('иногда поливать цветы', [item({ title: 'Поливать цветы', quote: 'иногда поливать цветы', kind: 'repeat', repeat: { every: 0, unit: 'sometimes' } })]);
    assert.deepEqual([bad?.drafts[0].kind, bad?.drafts[0].repeat, bad?.drafts[0].missing], ['repeat', null, ['repeat', 'date']]);
    const book = parse('нужен курс массажа', [item({ title: 'Записаться на массаж', quote: 'нужен курс массажа' })]);
    assert.equal(book?.drafts[0].title, 'Записаться на массаж', '«Записаться на…» — допустимое первое действие: само дело из текста');
    const monthly = parse('каждый месяц платить за интернет', [item({ title: 'Платить за интернет', quote: 'каждый месяц платить за интернет', kind: 'repeat', repeat: { every: 1, unit: 'month' } })]);
    assert.deepEqual([monthly?.drafts[0].kind, monthly?.drafts[0].repeat, monthly?.drafts[0].missing], ['repeat', { every: 1, unit: 'month' }, ['date']]);
    const fifth = parse('каждый месяц 5-го платить за квартиру', [item({ title: 'Платить за квартиру', quote: 'каждый месяц 5-го платить за квартиру', kind: 'repeat', repeat: { every: 1, unit: 'month' }, date: '2026-11-05' })]);
    assert.deepEqual([fifth?.drafts[0].date, fifth?.drafts[0].check], ['2026-12-05', []], 'число названо — ближайшее пятое считаем сами');
  });
  test('день рождения без человека и без дня — оба поля ждут человека', () => {
    const got = parse('у кого-то др в феврале', [item({ type: 'birthday', quote: 'у кого-то др в феврале', person: null, date: null })]);
    assert.deepEqual(got?.drafts[0].missing, ['date', 'person'], 'цитата есть — черновик оставляем, кто и когда — укажет человек');
    const invented = parse('купить хлеб', [item({ type: 'birthday', quote: 'др у Пети', person: 'Петя', date: '2027-01-01' })]);
    assert.equal(invented?.drafts.length, 0, 'ни цитаты, ни человека в тексте — выдумка');
    const anna = parse('у Ани др в феврале', [item({ type: 'birthday', quote: 'у Ани др в феврале', person: 'Аня' })]);
    assert.deepEqual([anna?.drafts[0].person, anna?.drafts[0].missing], ['Аня', ['date']]);
  });
  test('повторы убираем, больше двадцати не берём, порядок — как в ответе', () => {
    const got = parse('купить хлеб, купить хлеб', [item({ title: 'Купить хлеб', quote: 'купить хлеб' }), item({ title: 'купить хлеб.', quote: 'купить хлеб' })]);
    assert.equal(got?.drafts.length, 1);
    const many = Array.from({ length: NOTE_MAX_ITEMS + 5 }, (_, k) => item({ title: `Дело ${k}`, quote: `дело ${k}` }));
    assert.equal(parse(many.map((m) => m.quote).join('. '), many)?.drafts.length, NOTE_MAX_ITEMS);
  });
  test('что не вошло в дела — отдельно; хвост длинной заметки — тоже', () => {
    const got = parse('купить хлеб\nвчера был отличный день\nпозвонить маме и записаться к врачу', [
      item({ title: 'Купить хлеб', quote: 'купить хлеб' }),
      item({ title: 'Позвонить', quote: 'позвонить маме', person: 'Мама' }),
      item({ title: 'Записаться к врачу', quote: 'записаться к врачу' }),
    ]);
    assert.deepEqual(got?.rest, ['вчера был отличный день']);
    const long = `купить хлеб. ${'я'.repeat(NOTE_MAX_TEXT)}хвост`;
    assert.equal(parse(long, [item({ title: 'Купить хлеб', quote: 'купить хлеб' })])?.rest.at(-1)?.endsWith('хвост'), true);
  });
  test('ответ в обёртке и с рассуждениями — читаем; не по формату — null; пустой список — дел нет', () => {
    const wrapped = parseNoteAnswer(`<think>хм</think>\n\`\`\`json\n${answer([item({ title: 'Купить хлеб', quote: 'купить хлеб' })])}\n\`\`\``, { text: 'купить хлеб', now: NOW });
    assert.equal(wrapped?.drafts.length, 1);
    assert.equal(parseNoteAnswer('не знаю', { text: 'купить хлеб', now: NOW }), null);
    assert.equal(parseNoteAnswer('{"foo":1}', { text: 'купить хлеб', now: NOW }), null);
    assert.deepEqual(parse('просто мысль о жизни', []), { drafts: [], rest: ['просто мысль о жизни'] });
  });
  test('ответ оборвался на полуслове — берём дела, которые успели дописаться, и помечаем, что это не всё', () => {
    const full = answer([item({ title: 'Купить хлеб', quote: 'купить хлеб' }), item({ title: 'Позвонить маме', quote: 'позвонить маме', note: 'скобки } и " в тексте' })]);
    const cut = full.slice(0, full.indexOf('Позвонить маме') + 5);
    const got = parseNoteAnswer(cut, { text: 'купить хлеб, позвонить маме', now: NOW });
    assert.deepEqual([got?.drafts.map((d) => d.title), got?.partial], [['Купить хлеб'], true]);
    assert.equal(parseNoteAnswer(full, { text: 'купить хлеб, позвонить маме', now: NOW })?.partial, undefined);
    assert.equal(parseNoteAnswer('{"items":[{"type":"task","title":"Куп', { text: 'купить хлеб', now: NOW }), null, 'ни одного целого дела — ответа нет');
  });
});

describe('второй взгляд', () => {
  const HEALTH = [
    'дерматолог - подбирали уход для этого периода.',
    'Так же наконец займусь лицом со своими прыщами, прописали крем',
    'онколог - собираюсь проверить свои родинки, еще не дошла',
    'узи сердца- раз в год',
  ].join('\n');
  const moles = item({ title: 'Проверить родинки', quote: 'собираюсь проверить свои родинки, еще не дошла' });
  const heart = item({ title: 'Узи сердца', quote: 'узи сердца- раз в год', kind: 'repeat', repeat: { every: 1, unit: 'year' } });
  const face = item({ title: 'Заняться лицом', quote: 'наконец займусь лицом со своими прыщами' });
  /** ИИ понарошку: отвечает заготовленным по очереди и запоминает, о чём спросили. */
  const fake = (answers: (unknown[] | null | Error)[]) => {
    const asked: string[] = [];
    const ask = async (input: NoteInput) => {
      asked.push(input.text);
      const a = answers.shift();
      if (a instanceof Error) throw a;
      return a ? parseNoteAnswer(answer(a), input) : null;
    };
    return { ask, asked };
  };

  test('что стоит переспросить: слово намерения вне цитат или строка, начатая с действия', () => {
    const drafts = parse(HEALTH, [moles, heart])?.drafts ?? [];
    assert.deepEqual(missedIntents(HEALTH, drafts), ['Так же наконец займусь лицом со своими прыщами, прописали крем']);
    assert.deepEqual(missedIntents(HEALTH, parse(HEALTH, [moles, heart, face])?.drafts ?? []), []);
    const list = 'Ремонт:\n✅ выбрать плитку\n[x] оплатить интернет\n⬜ заказать двери\n2. вызвать электрика\nчасть денег отдал';
    assert.deepEqual(missedIntents(list, []), ['⬜ заказать двери', '2. вызвать электрика'], 'сделанное и «часть денег» не переспрашиваем');
    for (const t of ['не надо звонить Пете', 'все никак не дойду на эту процедуру', 'Сегодня был хороший день, гуляли в парке', 'интересно, сколько стоит абонемент']) {
      assert.deepEqual(missedIntents(t, []), [], t);
    }
    for (const t of ['надо бы поменять резину', 'не забыть про страховку', 'в отпуске схожу к окулисту', 'пора менять фильтр']) assert.deepEqual(missedIntents(t, []), [t], t);
    const mixed = 'выявили остеохондроз, нужен курс массажа (не входит в страховку) и ещё много слов про шею, голову и рентген';
    assert.deepEqual(missedIntents(mixed, parse(mixed, [item({ title: 'Записаться на массаж', quote: 'нужен курс массажа' })])?.drafts ?? []), [], '«нужен» уже стало делом');
  });

  test('первый ответ пропустил дело — спрашиваем про этот кусок, находка встаёт на своё место по тексту', async () => {
    const { ask, asked } = fake([[moles, heart], [face]]);
    const got = await draftsFromNote({ text: HEALTH, now: NOW }, ask);
    assert.deepEqual(got?.drafts.map((d) => d.title), ['Заняться лицом', 'Проверить родинки', 'Узи сердца']);
    assert.deepEqual(asked, [HEALTH, 'Так же наконец займусь лицом со своими прыщами, прописали крем']);
    assert.deepEqual(got?.rest, ['дерматолог - подбирали уход для этого периода.']);
  });

  test('переспрашивать нечего — один вопрос; второй не удался или пуст — остаётся первый ответ', async () => {
    const all = fake([[moles, heart, face]]);
    assert.equal((await draftsFromNote({ text: HEALTH, now: NOW }, all.ask))?.drafts.length, 3);
    assert.equal(all.asked.length, 1);
    for (const second of [null, new Error('нет сети'), []]) {
      const { ask, asked } = fake([[moles, heart], second]);
      const got = await draftsFromNote({ text: HEALTH, now: NOW }, ask);
      assert.deepEqual([got?.drafts.map((d) => d.title), asked.length], [['Проверить родинки', 'Узи сердца'], 2]);
    }
    assert.equal(await draftsFromNote({ text: HEALTH, now: NOW }, fake([null]).ask), null, 'первого ответа нет — нет и разбора');
  });

  test('второй взгляд не дублирует: то же название или цитата из того же места — не берём', async () => {
    const text = 'так надо успеть отвезти кота к ветеринару потом ещё всякое разное про работу и отпуск и погоду и надо купить корм и больше ничего';
    const vet = item({ title: 'Отвезти кота к ветеринару', quote: 'отвезти кота к ветеринару' });
    const { ask } = fake([[vet], [item({ title: 'Отвезти кота', quote: 'надо успеть отвезти кота к ветеринару' }), item({ title: 'Отвезти кота к ветеринару', quote: '' }), item({ title: 'Купить корм', quote: 'надо купить корм' })]]);
    const got = await draftsFromNote({ text, now: NOW }, ask);
    assert.deepEqual(got?.drafts.map((d) => d.title), ['Отвезти кота к ветеринару', 'Купить корм']);
  });

  test('подарок, найденный вторым взглядом без имени, получает именинника из первого ответа', async () => {
    const text = 'в субботу день рождения у Игоря.\nподарок ещё не купил, надо купить\nв воскресенье встретить родителей';
    const { ask } = fake([
      [item({ type: 'birthday', quote: 'в субботу день рождения у Игоря', person: 'Игорь' }), item({ title: 'Встретить родителей', quote: 'в воскресенье встретить родителей' })],
      [item({ title: 'Купить подарок', quote: 'подарок ещё не купил, надо купить' })],
    ]);
    const got = await draftsFromNote({ text, now: NOW }, ask);
    assert.deepEqual(got?.drafts.map((d) => [d.title, d.person]), [['', 'Игорь'], ['Купить подарок', 'Игорь'], ['Встретить родителей', null]]);
  });
});
