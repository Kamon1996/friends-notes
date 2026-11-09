/// <reference types="node" />
// «Умный календарь»: какие напоминания — события для календаря (врач, тренировка, массаж), а какие — обычные дела.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { AiResult, AiRunner, AiTask } from '../ai/types';
import { calendarEvents } from '../calendar';
import {
  CALENDAR_TASK,
  applyCalendarUpdate,
  calendarKey,
  calendarLine,
  calendarPass,
  calendarPending,
  calendarPrompt,
  calendarSource,
  inCalendar,
  parseCalendarAnswer,
} from '../calendarAi';
import type { Reminder } from '../types';

const R = (id: string, patch: Partial<Reminder> = {}): Reminder => ({
  id,
  title: id,
  note: '',
  friendId: null,
  date: '2026-11-20',
  time: '10:00',
  repeat: null,
  advance: 0,
  done: false,
  createdAt: 0,
  ...patch,
});

/** Подставной ИИ: отвечает по названию из строки «название · …»; список вопросов — в asked. */
function fakeAi(events: Record<string, boolean>, status: 'ok' | 'unavailable' = 'ok') {
  const asked: string[][] = [];
  const ai: AiRunner = {
    async run<I, O>(task: AiTask<I, O>, input: I): Promise<AiResult<O>> {
      const lines = input as unknown as string[];
      asked.push(lines);
      if (status === 'unavailable') return { status, attempts: [] };
      const answers = lines.flatMap((l, i) => (l.split(' · ')[0] in events ? [{ i, c: events[l.split(' · ')[0]] ? 'event' : 'task' }] : []));
      const value = task.parse(JSON.stringify({ answers }), input);
      return { status: 'ok', value: value as O, provider: 'gemini', model: 'test', attempts: [] };
    },
  };
  return { ai, asked };
}

describe('вопрос и ответ', () => {
  test('в вопросе — задание, что такое событие и дело, примеры с ответами, формат и пронумерованные строки', () => {
    const p = calendarPrompt(['Стоматолог · 15:00', 'Позвонить маме · 18:00']);
    assert.match(p, /^Задание:/);
    assert.match(p, /СОБЫТИЕ —/);
    assert.match(p, /ОБЫЧНОЕ ДЕЛО —/);
    assert.match(p, /«Настольный теннис · каждую неделю · 19:00» → event/);
    assert.match(p, /«Купить лекарства в аптеке · 10:00» → task/);
    assert.match(p, /Сомневаешься — task/);
    assert.match(p, /\n0: Стоматолог · 15:00\n1: Позвонить маме · 18:00$/);
    const req = CALENDAR_TASK.request(['А']);
    assert.deepEqual([req.json, req.temperature], [true, 0]);
  });

  test('ответ: event/task по номеру; чужие номера, мусор и «не знаю» — пропускаем; непонятный ответ — null', () => {
    const m = parseCalendarAnswer('```json\n{"answers":[{"i":0,"c":"event"},{"i":1,"c":"TASK"},{"i":2,"c":"maybe"},{"i":9,"c":"event"}]}\n```', 3)!;
    assert.deepEqual([...m], [
      [0, true],
      [1, false],
    ]);
    assert.equal(parseCalendarAnswer('не знаю', 2), null);
  });

  test('строка для ИИ: название без имени друга, повтор и время; заметки не уходят', () => {
    assert.equal(calendarLine(R('a', { title: 'Позвонить — Игорь Ветров', time: '18:00' }), 'Игорь Ветров'), 'Позвонить · 18:00');
    assert.equal(calendarLine(R('b', { title: 'Теннис', repeat: { every: 1, unit: 'week' }, time: '19:00', note: 'корт 3' })), 'Теннис · каждую неделю · 19:00');
  });
});

describe('в календаре или нет', () => {
  const ai = (r: Reminder, event: boolean) => ({ ...r, calendarAi: event, calendarSeen: calendarKey(r) });
  test('«до срока» — никогда, даже если выбрать вручную', () => {
    assert.equal(inCalendar(R('a', { calendar: true })), false);
    assert.equal(calendarPending(R('a')), false);
  });
  test('без решения магии: «на дату и время» — да, повторяющееся — нет', () => {
    assert.equal(inCalendar(R('a', { kind: 'at' })), true);
    assert.equal(inCalendar(R('b', { repeat: { every: 1, unit: 'week' } })), false);
  });
  test('решение магии — пока название то же; переименовали — снова ждём', () => {
    const r = ai(R('Позвонить маме', { kind: 'at' }), false);
    assert.equal(inCalendar(r), false);
    assert.equal(calendarSource(r, true), 'ai');
    const renamed = { ...r, title: 'Стоматолог' };
    assert.equal(inCalendar(renamed), true, 'старое решение не про это название — по типу');
    assert.equal(calendarPending(renamed), true);
  });
  test('выбор человека главнее магии; магия выключена — решение не учитываем', () => {
    const r = ai(R('Теннис', { repeat: { every: 1, unit: 'week' } }), true);
    assert.equal(inCalendar(r), true);
    assert.equal(inCalendar(r, false), false);
    assert.equal(inCalendar({ ...r, calendar: false }), false);
    assert.equal(calendarSource({ ...r, calendar: false }, true), 'manual');
    assert.equal(calendarPending({ ...r, calendar: false, calendarSeen: undefined }), false, 'выбрано вручную — магию не спрашиваем');
  });
});

describe('проход', () => {
  test('спрашивает только тех, кто ждёт; решения применяются; второй раз то же не спрашиваем', async () => {
    const list = [
      R('Стоматолог', { kind: 'at', time: '15:00' }),
      R('Позвонить маме', { kind: 'at', time: '18:00' }),
      R('Теннис', { repeat: { every: 1, unit: 'week' }, time: '19:00' }),
      R('Купить корм'), // «до срока» — не спрашиваем
    ];
    const { ai, asked } = fakeAi({ Стоматолог: true, 'Позвонить маме': false, Теннис: true });
    const updates = await calendarPass(list, ai, () => undefined);
    assert.deepEqual(asked, [['Стоматолог · 15:00', 'Позвонить маме · 18:00', 'Теннис · каждую неделю · 19:00']]);
    const byId = new Map(updates.map((u) => [u.id, u]));
    const after = list.map((r) => applyCalendarUpdate(r, byId.get(r.id)));
    assert.deepEqual(after.map((r) => inCalendar(r)), [true, false, true, false]);
    assert.deepEqual(await calendarPass(after, ai, () => undefined), []);
    assert.equal(asked.length, 1);
  });

  test('ИИ недоступен — никого не отмечаем; пока шёл вопрос, название поменяли или выбрали вручную — ответ не применяем', async () => {
    const r = R('Массаж', { kind: 'at' });
    assert.deepEqual(await calendarPass([r], fakeAi({ Массаж: true }, 'unavailable').ai, () => undefined), []);
    const [u] = await calendarPass([r], fakeAi({ Массаж: false }).ai, () => undefined);
    assert.equal(applyCalendarUpdate({ ...r, title: 'Массаж спины' }, u).calendarAi, undefined);
    assert.equal(applyCalendarUpdate({ ...r, calendar: true }, u).calendarAi, undefined);
    assert.equal(applyCalendarUpdate(r, u).calendarAi, false);
  });
});

describe('в календаре', () => {
  test('событие с повтором — каждый раз; обычное дело и «до срока» — нет; магия выключена — по типу', () => {
    const tennis = { ...R('Теннис', { date: '2026-11-03', repeat: { every: 1, unit: 'week' }, time: '19:00' }), calendarAi: true };
    const data = {
      friends: [],
      reminders: [
        { ...tennis, calendarSeen: calendarKey(tennis) },
        { ...R('Позвонить маме', { kind: 'at', date: '2026-11-12' }), calendarAi: false, calendarSeen: calendarKey(R('Позвонить маме')) },
        R('Стоматолог', { kind: 'at', date: '2026-11-12', time: '15:00' }),
        R('Билеты', { date: '2026-11-11' }),
      ],
    };
    const names = (s?: boolean) =>
      calendarEvents({ ...data, settings: s === undefined ? undefined : ({ smartCalendar: s } as never) }, '2026-11-01', '2026-11-30').map(
        (e) => `${e.date} ${e.kind === 'meeting' ? e.reminder.title : ''}`,
      );
    assert.deepEqual(names(), ['2026-11-03 Теннис', '2026-11-10 Теннис', '2026-11-12 Стоматолог', '2026-11-17 Теннис', '2026-11-24 Теннис']);
    assert.deepEqual(names(false), ['2026-11-12 Позвонить маме', '2026-11-12 Стоматолог']);
  });
});
