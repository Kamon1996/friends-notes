/// <reference types="node" />
// Список «Из заметки»: решение по каждой записи, неполную добавить нельзя, друга находим по имени, записи → дела и даты.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  addCounts, addedText, birthdayConflict, buildChanges, buttonLabel, canAdd, createReview, daysLeft, decide, editItem, friendsByName, itemFromRest, matchFriend, missingOf,
  sectionsOf, setDateForAll, withoutDate, type ReviewContext, type ReviewItem,
} from '../noteReview';
import type { NoteAnswer, NoteDraft } from '../noteTasks';
import type { Friend, Reminder } from '../types';

const TODAY = '2026-11-11'; // среда
const NOW = new Date(2026, 10, 11, 14, 30).getTime();
const F = (id: string, name: string, patch: Partial<Friend> = {}): Friend => ({
  id, name, emoji: '🙂', birthday: null, phone: '', food: '', flowers: '', gifts: '', notes: '', dates: [], createdAt: 0, ...patch,
});
const FRIENDS = [F('anya', 'Аня'), F('katya', 'Катя Смирнова'), F('katya2', 'Катя Белова'), F('oleg', 'Олег'), F('mama', 'Мама'), F('anna', 'Анна Петрова')];
const D = (patch: Partial<NoteDraft> = {}): NoteDraft => ({
  type: 'task', title: 'Купить цветы', quote: 'купить Ане цветы', kind: 'due', date: null, time: null, repeat: null, person: null, note: '', sure: true, check: [], missing: [], ...patch,
});
const answer = (drafts: NoteDraft[]): NoteAnswer => ({ drafts, rest: [], skipped: [] });
let n = 0;
const makeId = () => `id${++n}`;
const review = (drafts: NoteDraft[], friends = FRIENDS) => createReview(answer(drafts), friends, makeId);
const ctx = (patch: Partial<ReviewContext> = {}): ReviewContext => ({ friends: FRIENDS, reminders: [], today: TODAY, now: NOW, eventTime: '10:00', makeId, ...patch });

describe('друг по имени из заметки', () => {
  test('падеж — тот же человек; сокращение и похожее имя — нет; несколько подходящих — никто', () => {
    assert.equal(matchFriend('Аня', FRIENDS), 'anya');
    assert.equal(matchFriend('Ане', FRIENDS), 'anya');
    assert.equal(matchFriend('мама', FRIENDS), 'mama');
    assert.equal(matchFriend('Оля', FRIENDS), null, '«Оля» — не «Олег»');
    assert.equal(matchFriend('Катя', FRIENDS), null, 'Кать две — выберет человек');
    assert.deepEqual(friendsByName('Катя', FRIENDS).map((f) => f.id), ['katya', 'katya2']);
    assert.equal(matchFriend('Катя Смирнова', FRIENDS), 'katya');
    assert.equal(matchFriend('Лёша', FRIENDS), null);
    assert.equal(matchFriend(null, FRIENDS), null);
    assert.equal(matchFriend('Анна', FRIENDS), 'anna', '«Аня» и «Анна» — разные записи: сокращения не угадываем');
    const more = [F('lenya', 'Лёня'), F('igor', 'Игорь Петров'), F('sasha', 'Саша')];
    assert.equal(matchFriend('Лена', more), null, '«Лена» — не «Лёня»');
    assert.deepEqual(['Лёне', 'Игорю', 'Игоря', 'Саши', 'Олегу'].map((w) => matchFriend(w, [...more, ...FRIENDS])), ['lenya', 'igor', 'igor', 'sasha', 'oleg']);
  });
});

describe('записи и решения', () => {
  test('все записи начинают «на проверке»; друг подставлен, если он один', () => {
    const items = review([D({ person: 'Аня' }), D({ title: 'Купить подарок', person: 'Катя' }), D({ type: 'birthday', title: '', person: 'Олег', date: '2027-03-01' })]);
    assert.deepEqual(items.map((i) => [i.state, i.friendId, i.to]), [['todo', 'anya', 'friend'], ['todo', null, 'new'], ['todo', 'oleg', 'friend']]);
  });

  test('чего не хватает: у дела — срока, у привычки — «как часто», у дня рождения — дня и человека', () => {
    const [task, habit, bday, ready] = review([
      D(), D({ title: 'Пить железо', kind: 'repeat' }), D({ type: 'birthday', title: '', person: null }), D({ title: 'Забрать торт', date: '2026-11-13' }),
    ]);
    assert.deepEqual([missingOf(task), missingOf(habit), missingOf(bday), missingOf(ready)], [['date'], ['repeat', 'date'], ['date', 'person'], []]);
    assert.deepEqual([canAdd(task), canAdd(ready)], [false, true]);
  });

  test('неполную запись добавить нельзя — остаётся на проверке; убрать и вернуть можно любую', () => {
    let items = review([D(), D({ title: 'Забрать торт', date: '2026-11-13' })]);
    const [a, b] = items.map((i) => i.id);
    items = decide(decide(items, a, 'add'), b, 'add');
    assert.deepEqual(items.map((i) => i.state), ['todo', 'add']);
    items = decide(items, a, 'skip');
    assert.deepEqual(sectionsOf(items).skip.map((i) => i.id), [a]);
    assert.deepEqual(decide(items, a, 'todo').map((i) => i.state), ['todo', 'add'], '«Вернуть» — снова на проверку');
  });

  test('правка: заполненное поле больше не «проверь»; добавленная запись без срока возвращается на проверку', () => {
    let items = review([D({ title: 'Съездить к родителям', date: '2026-11-14', check: ['date'], sure: false })]);
    const id = items[0].id;
    items = decide(items, id, 'add');
    assert.equal(items[0].state, 'add');
    items = editItem(items, id, { date: '2026-11-15' });
    assert.deepEqual([items[0].draft.date, items[0].draft.check, items[0].state], ['2026-11-15', [], 'add']);
    items = editItem(items, id, { date: null });
    assert.equal(items[0].state, 'todo');
    items = editItem(items, id, { repeat: { every: 1, unit: 'week' }, date: '2026-11-14' });
    assert.deepEqual([items[0].draft.kind, canAdd(items[0])], ['repeat', true], 'выбрал повтор — дело стало повторяющимся');
    items = editItem(items, id, { repeat: null });
    assert.equal(items[0].draft.kind, 'due');
    const gift = editItem(review([D({ title: 'Купить подарок', person: 'Катя', check: ['person'] })]), `id${n}`, { friendId: 'katya' });
    assert.deepEqual([gift[0].friendId, gift[0].draft.check], ['katya', []], 'друга выбрал человек — вопроса нет');
  });

  test('«поставить всем»: срок получают записи на проверке без срока; решённые и со сроком не трогаем', () => {
    let items = review([D(), D({ title: 'Массаж' }), D({ title: 'Торт', date: '2026-11-13' }), D({ title: 'Железо', kind: 'repeat' }), D({ type: 'birthday', title: '', person: 'Олег' })]);
    items = decide(items, items[1].id, 'skip');
    assert.equal(withoutDate(items).length, 2, 'цветы и железо: массаж убран, у торта срок есть, день рождения — не дело');
    const next = setDateForAll(items, '2026-11-18');
    assert.deepEqual(next.map((i) => i.draft.date), ['2026-11-18', null, '2026-11-13', '2026-11-18', null]);
    assert.deepEqual(next.map((i) => i.state), ['todo', 'skip', 'todo', 'todo', 'todo'], 'решение остаётся за человеком');
  });

  test('кнопка: сколько осталось проверить, потом — что добавится; добавлять нечего — так и пишем', () => {
    let items = review([D({ date: '2026-11-12' }), D({ title: 'Торт', date: '2026-11-13' }), D({ type: 'birthday', title: '', person: 'Олег', date: '2027-03-01' })]);
    assert.deepEqual(buttonLabel(items), { text: 'Осталось проверить 3', ready: false });
    for (const i of items) items = decide(items, i.id, 'add');
    assert.deepEqual(addCounts(items), { tasks: 2, dates: 1 });
    assert.deepEqual(buttonLabel(items), { text: 'Добавить 2 дела и 1 дату', ready: true });
    assert.equal(addedText(items), 'Добавлены 2 дела и 1 дата');
    const none = items.map((i) => ({ ...i, state: 'skip' as const }));
    assert.deepEqual(buttonLabel(none), { text: 'Добавлять нечего', ready: false });
    assert.equal(buttonLabel(decide(none, none[0].id, 'add')).text, 'Добавить 1 дело');
    assert.equal(addedText(items.slice(0, 1)), 'Добавлено 1 дело');
  });

  test('«сделать делом» из остатка заметки: название — сам кусок, срок ждёт человека', () => {
    const item = itemFromRest('«Олег пришлёт счёт».', makeId);
    assert.deepEqual([item.draft.title, item.draft.quote, item.state, missingOf(item)], ['Олег пришлёт счёт', '«Олег пришлёт счёт».', 'todo', ['date']]);
  });
});

describe('записи → дела и даты', () => {
  const added = (items: ReviewItem[]) => items.map((i) => ({ ...i, state: 'add' as const }));

  test('дело: срок и время из записи; время не названо — привычное; встреча — «за день»; человек — друг', () => {
    const habits: Reminder[] = [1, 2, 3].map((k) => ({ id: `h${k}`, title: 'Позвонить', note: '', friendId: null, date: '2026-11-01', time: '19:00', repeat: null, advance: 0, done: true, createdAt: NOW - k }));
    const got = buildChanges(added(review([
      D({ person: 'Аня', date: '2026-11-12', note: 'пионы' }),
      D({ title: 'Стоматолог', kind: 'at', date: '2026-11-20', time: '15:30' }),
      D({ title: 'Не добавится' }),
    ])), ctx({ reminders: habits }));
    assert.equal(got.reminders.length, 2, 'запись без срока в дела не попадает, даже если её пометили');
    const [flowers, dentist] = got.reminders;
    assert.deepEqual([flowers.title, flowers.friendId, flowers.date, flowers.time, flowers.note, flowers.kind, flowers.repeat], ['Купить цветы', 'anya', '2026-11-12', '19:00', 'пионы', undefined, null]);
    assert.deepEqual([dentist.kind, dentist.date, dentist.time, dentist.advance, dentist.advances], ['at', '2026-11-20', '15:30', 0, undefined], 'встреча: «за день» — как у новой встречи в форме');
    assert.ok(got.reminders.every((r) => r.createdAt === NOW && !r.done));
    assert.equal(buildChanges(added(review([D({ date: '2026-11-12' })])), ctx()).reminders[0].time, '10:00', 'привычек нет — обычное время приложения');
  });

  test('повтор по дням недели встаёт на ближайший свой день; обычный — на выбранный', () => {
    const got = buildChanges(added(review([
      D({ title: 'Бассейн', kind: 'repeat', repeat: { every: 1, unit: 'week', days: [2, 4] }, date: '2026-11-11', time: '07:00' }),
      D({ title: 'Пить железо', kind: 'repeat', repeat: { every: 1, unit: 'day' }, date: '2026-11-12' }),
    ])), ctx());
    assert.deepEqual(got.reminders.map((r) => [r.date, r.repeat]), [['2026-11-12', { every: 1, unit: 'week', days: [2, 4] }], ['2026-11-12', { every: 1, unit: 'day' }]]);
  });

  test('день рождения: в карточку друга без года; новым другом; напоминанием на каждый год', () => {
    const items = added(review([
      D({ type: 'birthday', title: '', person: 'Олег', date: '2027-03-01' }),
      D({ type: 'birthday', title: '', person: 'Лёша', date: '2027-02-14' }),
      D({ type: 'birthday', title: '', person: 'Аня', date: '2027-05-05' }),
    ]));
    items[2] = { ...items[2], to: 'reminder' };
    const got = buildChanges(items, ctx());
    assert.deepEqual(got.updated.map((f) => [f.id, f.birthday]), [['oleg', '1904-03-01']]);
    assert.deepEqual(got.before.map((f) => [f.id, f.birthday]), [['oleg', null]], 'что было — для «Отменить»');
    assert.deepEqual(got.friends.map((f) => [f.name, f.birthday, f.dates]), [['Лёша', '1904-02-14', []]]);
    assert.deepEqual(got.reminders.map((r) => [r.title, r.date, r.repeat, r.friendId, r.time]), [['День рождения: Аня', '2027-05-05', { every: 1, unit: 'year' }, 'anya', '10:00']]);
  });

  test('у друга уже другой день рождения — не трогаем без явного решения; тот же день — нечего менять', () => {
    const friends = [F('oleg', 'Олег', { birthday: '1990-07-07' }), F('ira', 'Ира', { birthday: '1904-03-01' })];
    const items = added(review([D({ type: 'birthday', title: '', person: 'Олег', date: '2027-03-01' }), D({ type: 'birthday', title: '', person: 'Ира', date: '2027-03-01' })], friends));
    assert.deepEqual([birthdayConflict(items[0], friends), birthdayConflict(items[1], friends)], ['1990-07-07', null]);
    assert.deepEqual(buildChanges(items, ctx({ friends })).updated, []);
    const replaced = buildChanges([{ ...items[0], replace: true }], ctx({ friends }));
    assert.deepEqual([replaced.updated[0].birthday, replaced.before[0].birthday], ['1904-03-01', '1990-07-07']);
  });

  test('важная дата — в «Важные даты» друга, каждый год; та же дата второй раз не добавляется', () => {
    const items = added(review([D({ type: 'date', title: 'Годовщина свадьбы', person: 'Олег', date: '2027-06-15' }), D({ type: 'date', title: 'Годовщина свадьбы', person: 'Олег', date: '2027-06-15' })]));
    const got = buildChanges(items, ctx());
    assert.deepEqual(got.updated.map((f) => f.dates.map((x) => [x.title, x.date, x.yearly])), [[['Годовщина свадьбы', '2027-06-15', true]]]);
    assert.equal(got.before.length, 1);
  });
});

describe('подписи', () => {
  test('сколько дней до срока — для кольца', () => {
    assert.deepEqual(daysLeft('2026-11-13', TODAY), { n: 2, unit: 'дня' });
    assert.deepEqual(daysLeft('2026-11-12', TODAY), { n: 1, unit: 'день' });
    assert.deepEqual(daysLeft('2026-11-20', TODAY), { n: 9, unit: 'дн' });
    assert.deepEqual(daysLeft(TODAY, TODAY), { n: 0, unit: 'дн' });
  });
});
