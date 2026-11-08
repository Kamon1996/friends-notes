/// <reference types="node" />
// Синхронизация календаря «Друзья» на имитации календаря Android. Имитация ведёт себя как настоящий Calendar Provider
// (см. expo-calendar/android): события скрытого календаря в список не попадают, у событий на весь день начало —
// полночь по UTC, ежегодный повтор разворачивается в каждое повторение с id самого события, удаление календаря
// удаляет его события.
import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { CALENDAR_SIGNATURE, type ContactBirthday } from '../calendarPlan';
import {
  CALENDAR_NAME,
  calendarRange,
  calendarStatus,
  createCalendarSync,
  eventDate,
  eventFields,
  type CalendarPort,
  type CalendarState,
  type CalendarSummary,
  type EventFields,
} from '../calendarSync';
import { phoneKey } from '../messengers';
import { DEFAULT_SETTINGS, EMPTY_DATA, type AppData, type Friend } from '../types';

interface FakeCalendar {
  id: string;
  name: string;
  isVisible: boolean;
  color: string;
}
interface FakeEvent {
  id: string;
  calendarId: string;
  title: string;
  notes: string;
  start: number;
  end: number;
  allDay: boolean;
  yearly?: boolean;
}

class FakeAndroid implements CalendarPort {
  cals: FakeCalendar[] = [];
  evs: FakeEvent[] = [];
  granted = true;
  next = 100;
  log: string[] = [];
  /** Сломать запись после стольких событий (обрыв посреди синхронизации). */
  failCreatesAfter: number | null = null;
  failEventsFor = new Set<string>();

  addCalendar(patch: Partial<FakeCalendar> = {}): FakeCalendar {
    const c = { id: String(this.next++), name: 'Google', isVisible: true, color: '#000000', ...patch };
    this.cals.push(c);
    return c;
  }
  addEvent(calendarId: string, patch: Partial<FakeEvent> & { date?: string }): FakeEvent {
    const start = patch.date ? Date.UTC(+patch.date.slice(0, 4), +patch.date.slice(5, 7) - 1, +patch.date.slice(8, 10)) : (patch.start ?? 0);
    const e: FakeEvent = { id: String(this.next++), calendarId, title: '', notes: '', allDay: true, end: start + 86400000, ...patch, start };
    this.evs.push(e);
    return e;
  }
  ours() {
    return this.cals.filter((c) => c.name === CALENDAR_NAME);
  }
  /** «2026-11-07 🎂 Аня Смирнова · 31 год» для всех событий нашего календаря, по порядку. */
  titles(calendarId = this.ours()[0]?.id) {
    return this.evs
      .filter((e) => e.calendarId === calendarId)
      .map((e) => `${new Date(e.start).toISOString().slice(0, 10)} ${e.title}`)
      .sort();
  }

  permission = async () => this.granted;
  calendars = async () => this.cals.map(({ id, name, isVisible }) => ({ id, name, isVisible }));
  calendar = async (id: string) => {
    const c = this.cals.find((x) => x.id === id);
    if (!c) throw new Error('Calendar not found');
    return { id: c.id, name: c.name, isVisible: c.isVisible };
  };
  createCalendar = async (color: string) => {
    this.log.push('createCalendar');
    const c = this.addCalendar({ name: CALENDAR_NAME, color });
    return { id: c.id, name: c.name, isVisible: true };
  };
  deleteCalendar = async (id: string) => {
    if (!this.cals.some((c) => c.id === id)) throw new Error('Calendar not found');
    this.log.push(`deleteCalendar ${id}`);
    this.cals = this.cals.filter((c) => c.id !== id);
    this.evs = this.evs.filter((e) => e.calendarId !== id);
  };
  setColor = async (id: string, color: string) => {
    this.log.push(`setColor ${color}`);
    this.cals.find((c) => c.id === id)!.color = color;
  };
  events = async (calendarId: string, from: Date, to: Date) => {
    if (this.failEventsFor.has(calendarId)) throw new Error('No access');
    const cal = this.cals.find((c) => c.id === calendarId);
    if (!cal?.isVisible) return []; // Instances: VISIBLE = 1
    const out = [];
    for (const e of this.evs.filter((x) => x.calendarId === calendarId)) {
      const starts = [e.start];
      if (e.yearly) {
        const d = new Date(e.start);
        for (let y = d.getUTCFullYear() + 1; y <= to.getUTCFullYear(); y++) starts.push(Date.UTC(y, d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes()));
      }
      for (const s of starts) {
        if (s < to.getTime() && s + (e.end - e.start) > from.getTime()) {
          out.push({ id: e.id, title: e.title, notes: e.notes, startDate: new Date(s).toISOString(), allDay: e.allDay });
        }
      }
    }
    return out;
  };
  createEvent = async (calendarId: string, f: EventFields) => {
    if (this.failCreatesAfter !== null && this.failCreatesAfter-- <= 0) throw new Error('Event could not be created');
    assert.ok(this.cals.some((c) => c.id === calendarId), 'событие — в существующий календарь');
    assert.equal(f.startDate.getTime() % 86400000, 0, 'весь день — с полуночи UTC');
    assert.equal(f.endDate.getTime() - f.startDate.getTime(), 86400000, 'ровно один день');
    assert.deepEqual([f.allDay, f.timeZone, f.endTimeZone], [true, 'UTC', 'UTC']);
    return this.addEvent(calendarId, { title: f.title, notes: f.notes, start: f.startDate.getTime(), end: f.endDate.getTime() }).id;
  };
  deleteEvent = async (id: string) => {
    if (!this.evs.some((e) => e.id === id)) throw new Error('Event not found');
    this.log.push(`deleteEvent ${id}`);
    this.evs = this.evs.filter((e) => e.id !== id);
  };
}

const friend = (patch: Partial<Friend>): Friend => ({
  id: 'a',
  name: 'Аня Смирнова',
  emoji: '',
  birthday: '1995-11-07',
  phone: '+7 999 123-45-67',
  food: '',
  flowers: '',
  gifts: '',
  notes: '',
  dates: [],
  createdAt: 0,
  ...patch,
});
const appData = (friends: Friend[], settings: Partial<AppData['settings']> = {}): AppData => ({
  ...EMPTY_DATA,
  friends,
  settings: { ...DEFAULT_SETTINGS, calendarSync: true, ...settings },
});

const ANYA = friend({});
const IGOR = friend({ id: 'i', name: 'Игорь Петров', birthday: '1992-06-13', phone: '' });

/** Телефон: календарь Android, хранилище приложения, контакты и «сегодня». Движок можно «перезапустить» с тем же телефоном. */
function phone() {
  const android = new FakeAndroid();
  const env = {
    android,
    state: null as CalendarState | null,
    contacts: [] as ContactBirthday[],
    contactsGranted: true,
    contactReads: [] as boolean[],
    today: '2026-11-08',
    summaries: [] as (CalendarSummary | null)[],
    engine: null as unknown as ReturnType<typeof createCalendarSync>,
    restart() {
      env.engine = createCalendarSync({
        port: android,
        load: async () => (env.state ? structuredClone(env.state) : null),
        save: async (s) => {
          env.state = s ? structuredClone(s) : null;
        },
        contacts: async (read) => {
          env.contactReads.push(read);
          return env.contactsGranted ? env.contacts : [];
        },
        phoneKey,
        today: () => env.today,
        color: (d) => (d.settings.accentLight === 'plum' ? '#7A4E78' : '#C4502F'),
        onSummary: (s) => env.summaries.push(s),
      });
    },
    sync: (data: AppData) => env.engine.sync(data),
  };
  env.restart();
  return env;
}

const YEARS = ['2025', '2026', '2027', '2028'];
const anyaTitles = ['2025-11-07 🎂 Аня Смирнова · 30 лет', '2026-11-07 🎂 Аня Смирнова · 31 год', '2027-11-07 🎂 Аня Смирнова · 32 года', '2028-11-07 🎂 Аня Смирнова · 33 года'];
const igorTitles = ['2025-06-13 🎂 Игорь Петров · 33 года', '2026-06-13 🎂 Игорь Петров · 34 года', '2027-06-13 🎂 Игорь Петров · 35 лет', '2028-06-13 🎂 Игорь Петров · 36 лет'];

describe('включение и выключение', () => {
  test('включили: свой календарь «Друзья» и по событию на каждый год, с возрастом', async () => {
    const p = phone();
    await p.sync(appData([ANYA, IGOR]));
    assert.equal(p.android.ours().length, 1);
    assert.equal(p.android.ours()[0].color, '#C4502F');
    assert.deepEqual(p.android.titles(), [...igorTitles, ...anyaTitles].sort());
    assert.ok(p.android.evs.every((e) => e.notes.endsWith(CALENDAR_SIGNATURE)));
    assert.deepEqual(p.summaries.at(-1), { events: 8, fromContacts: 0, fromOthers: 0, hidden: false });
  });

  test('выключили: календарь удалён вместе с событиями, состояние стёрто', async () => {
    const p = phone();
    await p.sync(appData([ANYA]));
    await p.sync(appData([ANYA], { calendarSync: false }));
    assert.deepEqual([p.android.ours().length, p.android.evs.length, p.state], [0, 0, null]);
    assert.equal(p.summaries.at(-1), null);
  });

  test('выключено с самого начала — календарь не трогаем и даже не спрашиваем доступ', async () => {
    const p = phone();
    p.android.granted = false;
    await p.sync(appData([ANYA], { calendarSync: false }));
    assert.deepEqual([p.android.cals.length, p.android.log], [0, []]);
  });

  test('нет доступа к календарю — ничего не делаем и не падаем', async () => {
    const p = phone();
    await p.sync(appData([ANYA]));
    const before = structuredClone(p.android.evs);
    p.android.granted = false;
    await p.sync(appData([ANYA, IGOR]));
    assert.deepEqual(p.android.evs, before);
    p.android.granted = true;
    await p.sync(appData([ANYA, IGOR]));
    assert.equal(p.android.evs.length, 8, 'доступ вернули — досоздали');
  });

  test('календарь «Друзья» удалили вручную — при следующей синхронизации он появится снова', async () => {
    const p = phone();
    await p.sync(appData([ANYA]));
    await p.android.deleteCalendar(p.android.ours()[0].id);
    await p.sync(appData([ANYA]));
    assert.deepEqual(p.android.titles(), anyaTitles);
  });
});

describe('изменения в приложении', () => {
  let p: ReturnType<typeof phone>;
  beforeEach(async () => {
    p = phone();
    await p.sync(appData([ANYA, IGOR]));
    p.android.log = [];
  });

  test('без изменений и после перезапуска ничего не трогаем', async () => {
    await p.sync(appData([ANYA, IGOR]));
    p.restart();
    await p.sync(appData([ANYA, IGOR]));
    assert.deepEqual(p.android.log, []);
    assert.equal(p.android.evs.length, 8);
  });

  test('переименовали друга — пересоздаются только его события', async () => {
    await p.sync(appData([{ ...ANYA, name: 'Анна Смирнова' }, IGOR]));
    assert.equal(p.android.log.filter((l) => l.startsWith('deleteEvent')).length, 4);
    assert.deepEqual(p.android.titles(), [...igorTitles, ...anyaTitles.map((t) => t.replace('Аня', 'Анна'))].sort());
  });

  test('поменяли день рождения, удалили друга, добавили важную дату', async () => {
    await p.sync(appData([{ ...ANYA, birthday: '1995-11-08', dates: [{ id: 'w', title: 'Свадьба', date: '2024-08-01', yearly: true }] }]));
    assert.deepEqual(p.android.titles(), [
      '2025-08-01 ♥ Свадьба · Аня Смирнова · 1 год',
      '2025-11-08 🎂 Аня Смирнова · 30 лет',
      '2026-08-01 ♥ Свадьба · Аня Смирнова · 2 года',
      '2026-11-08 🎂 Аня Смирнова · 31 год',
      '2027-08-01 ♥ Свадьба · Аня Смирнова · 3 года',
      '2027-11-08 🎂 Аня Смирнова · 32 года',
      '2028-08-01 ♥ Свадьба · Аня Смирнова · 4 года',
      '2028-11-08 🎂 Аня Смирнова · 33 года',
    ]);
  });

  test('сменили цвет — календарь перекрашен один раз, события не тронуты', async () => {
    await p.sync(appData([ANYA, IGOR], { accentLight: 'plum' }));
    await p.sync(appData([ANYA, IGOR], { accentLight: 'plum' }));
    assert.deepEqual(p.android.log, ['setColor #7A4E78']);
  });

  test('Новый год: позапрошлый год убран, добавлен ещё один вперёд', async () => {
    p.today = '2027-01-01';
    await p.sync(appData([ANYA, IGOR]));
    assert.deepEqual(p.android.titles(), [
      '2026-06-13 🎂 Игорь Петров · 34 года',
      '2026-11-07 🎂 Аня Смирнова · 31 год',
      '2027-06-13 🎂 Игорь Петров · 35 лет',
      '2027-11-07 🎂 Аня Смирнова · 32 года',
      '2028-06-13 🎂 Игорь Петров · 36 лет',
      '2028-11-07 🎂 Аня Смирнова · 33 года',
      '2029-06-13 🎂 Игорь Петров · 37 лет',
      '2029-11-07 🎂 Аня Смирнова · 34 года',
    ]);
    assert.equal(p.android.log.filter((l) => l.startsWith('deleteEvent')).length, 2, 'удалили только 2025-й');
  });

  test('всё стёрли из приложения — календарь пустой, но остаётся', async () => {
    await p.sync(appData([]));
    assert.deepEqual([p.android.ours().length, p.android.evs.length], [1, 0]);
    assert.deepEqual(calendarStatus(true, true, p.summaries.at(-1)!)?.text, 'Пока нечего добавить: нет дней рождения и важных дат.');
  });
});

describe('что пользователь делает в самом календаре', () => {
  test('удалил наше событие — вернём при следующем запуске или возвращении в приложение', async () => {
    const p = phone();
    await p.sync(appData([ANYA]));
    const victim = p.android.evs.find((e) => e.title.includes('31 год'))!;
    await p.android.deleteEvent(victim.id);
    await p.sync(appData([ANYA]));
    assert.equal(p.android.evs.length, 3, 'посреди работы приложения календарь не перечитываем');
    p.engine.markStale();
    await p.sync(appData([ANYA]));
    assert.deepEqual(p.android.titles(), anyaTitles);
  });

  test('добавил своё событие в календарь «Друзья» — не трогаем', async () => {
    const p = phone();
    await p.sync(appData([ANYA]));
    p.android.addEvent(p.android.ours()[0].id, { title: 'Купить торт', notes: 'моё', date: '2026-11-06' });
    p.engine.markStale();
    await p.sync(appData([ANYA]));
    p.restart();
    await p.sync(appData([ANYA]));
    assert.ok(p.android.titles().includes('2026-11-06 Купить торт'));
  });

  test('скрыл календарь «Друзья» — Android не отдаёт его события, но дублей не появляется', async () => {
    const p = phone();
    await p.sync(appData([ANYA]));
    p.android.ours()[0].isVisible = false;
    for (let i = 0; i < 3; i++) {
      p.restart();
      await p.sync(appData([ANYA]));
    }
    assert.deepEqual(p.android.titles(), anyaTitles);
    assert.equal(p.summaries.at(-1)?.hidden, true);
    assert.match(calendarStatus(true, true, p.summaries.at(-1)!)!.text, /скрыт/);
    p.android.ours()[0].isVisible = true;
    p.engine.markStale();
    await p.sync(appData([ANYA, IGOR]));
    assert.deepEqual(p.android.titles(), [...igorTitles, ...anyaTitles].sort());
    assert.equal(p.summaries.at(-1)?.hidden, false);
  });
});

describe('сбои и прошлые установки', () => {
  test('запись оборвалась посередине — при следующей синхронизации досоздаём остальное без дублей', async () => {
    const p = phone();
    p.android.failCreatesAfter = 3;
    await p.sync(appData([ANYA, IGOR]));
    assert.equal(p.android.evs.length, 3);
    assert.equal(Object.keys(p.state!.events).length, 3, 'успевшие события запомнены');
    p.android.failCreatesAfter = null;
    await p.sync(appData([ANYA, IGOR]));
    assert.deepEqual(p.android.titles(), [...igorTitles, ...anyaTitles].sort());
  });

  test('приложение убили, не дав сохранить состояние, — свои потерянные события убираем', async () => {
    const p = phone();
    await p.sync(appData([ANYA]));
    const saved = structuredClone(p.state);
    await p.sync(appData([ANYA, IGOR]));
    p.state = saved; // события Игоря созданы, а состояние — старое
    p.restart();
    await p.sync(appData([ANYA, IGOR]));
    assert.deepEqual(p.android.titles(), [...igorTitles, ...anyaTitles].sort());
  });

  test('данные приложения стёрли, а календарь «Друзья» остался — старый удаляем, нового не дублируем', async () => {
    const p = phone();
    await p.sync(appData([ANYA]));
    p.state = null;
    p.restart();
    await p.sync(appData([ANYA]));
    assert.equal(p.android.ours().length, 1);
    assert.deepEqual(p.android.titles(), anyaTitles);
  });

  test('переход с версии 1.22.0: событие с повтором «каждый год» меняется на события по годам', async () => {
    const p = phone();
    const cal = p.android.addCalendar({ name: CALENDAR_NAME, color: '#C4502F' });
    const old = p.android.addEvent(cal.id, { title: '🎂 Аня Смирнова', notes: `Дата рождения: 7 ноября 1995.\n${CALENDAR_SIGNATURE}`, date: '1995-11-07', yearly: true });
    p.state = { calendarId: cal.id, color: '#C4502F', events: { 'b-a': { id: old.id, sig: 'старая' } } };
    await p.sync(appData([ANYA]));
    assert.ok(!p.android.evs.some((e) => e.id === old.id));
    assert.deepEqual(p.android.titles(), anyaTitles);
  });

  test('удаление события, которого уже нет, не мешает остальному', async () => {
    const p = phone();
    await p.sync(appData([ANYA, IGOR]));
    for (const e of p.android.evs.filter((x) => x.title.includes('Игорь'))) await p.android.deleteEvent(e.id);
    await p.sync(appData([ANYA]));
    assert.deepEqual(p.android.titles(), anyaTitles);
  });

  test('выключили и сразу включили в том же запуске — дубли с другими календарями всё равно отсеяны', async () => {
    const p = phone();
    const google = p.android.addCalendar();
    p.android.addEvent(google.id, { title: 'ДР Ани', date: '2026-11-07' });
    await p.sync(appData([ANYA]));
    await p.sync(appData([ANYA], { calendarSync: false }));
    await p.sync(appData([ANYA]));
    assert.ok(!p.android.titles().some((t) => t.startsWith('2026-11-07')));
  });
});

describe('без дублей с тем, что уже есть в телефоне', () => {
  test('день рождения записан в контактах — его показывает сам календарь, мы не добавляем', async () => {
    const p = phone();
    p.contacts = [{ name: 'Анюта', phones: ['89991234567'], month: 11, day: 7 }];
    await p.sync(appData([ANYA, IGOR]));
    assert.deepEqual(p.android.titles(), igorTitles);
    assert.deepEqual(p.summaries.at(-1), { events: 4, fromContacts: 1, fromOthers: 0, hidden: false });
    assert.equal(
      calendarStatus(true, true, p.summaries.at(-1)!)?.text,
      'В календаре 4 события. Не повторяем: 1 день рождения уже в контактах.',
    );
  });

  test('контакты читаем только при проверке (запуск, возвращение), а без доступа — не читаем', async () => {
    const p = phone();
    await p.sync(appData([ANYA]));
    await p.sync(appData([ANYA, IGOR]));
    p.engine.markStale();
    await p.sync(appData([ANYA, IGOR]));
    assert.deepEqual(p.contactReads, [true, false, true]);
    p.contactsGranted = false;
    p.contacts = [{ name: 'Аня Смирнова', phones: [], month: 11, day: 7 }];
    await p.sync(appData([ANYA, IGOR]));
    assert.equal(p.android.evs.length, 8, 'без доступа к контактам ничего не убираем');
  });

  test('день рождения появился в контактах позже — наши события убираются, пропал — возвращаются', async () => {
    const p = phone();
    await p.sync(appData([ANYA]));
    p.contacts = [{ name: 'Аня Смирнова', phones: [], month: 11, day: 7 }];
    await p.sync(appData([ANYA]));
    assert.equal(p.android.evs.length, 0);
    p.contacts = [];
    await p.sync(appData([ANYA]));
    assert.deepEqual(p.android.titles(), anyaTitles);
  });

  test('календарь «Дни рождения» Google: событие на весь день с повтором — все годы пропускаем', async () => {
    const p = phone();
    const birthdays = p.android.addCalendar({ name: 'Дни рождения' });
    p.android.addEvent(birthdays.id, { title: 'Аня Смирнова', date: '1995-11-07', yearly: true });
    await p.sync(appData([ANYA, IGOR]));
    assert.deepEqual(p.android.titles(), igorTitles);
    assert.equal(p.summaries.at(-1)?.fromOthers, 4);
    assert.match(calendarStatus(true, true, p.summaries.at(-1)!)!.text, /Не повторяем: 4 события — в других календарях\.$/);
  });

  test('наш же файл .ics, загруженный в Google Календарь, не дублируется', async () => {
    const p = phone();
    const google = p.android.addCalendar();
    p.android.addEvent(google.id, { title: '🎂 Аня Смирнова', notes: `Дата рождения: 7 ноября 1995.\n${CALENDAR_SIGNATURE}`, date: '1995-11-07', yearly: true });
    await p.sync(appData([ANYA]));
    assert.deepEqual(p.android.titles(), []);
    assert.equal(p.android.evs.length, 1, 'событие Google не тронуто, хоть и с нашей подписью');
  });

  test('скрытые чужие календари и календари, которые не читаются, не мешают', async () => {
    const p = phone();
    const hidden = p.android.addCalendar({ isVisible: false });
    p.android.addEvent(hidden.id, { title: 'ДР Ани', date: '2026-11-07' });
    const broken = p.android.addCalendar();
    p.android.failEventsFor.add(broken.id);
    const work = p.android.addCalendar({ name: 'Работа' });
    p.android.addEvent(work.id, { title: 'ДР Игоря', date: '2027-06-13' });
    await p.sync(appData([ANYA, IGOR]));
    assert.deepEqual(p.android.titles(), [...igorTitles.filter((t) => !t.startsWith('2027')), ...anyaTitles].sort());
  });

  test('новые события в чужих календарях учитываем при следующей проверке: наше дублирующее убирается', async () => {
    const p = phone();
    await p.sync(appData([ANYA]));
    const google = p.android.addCalendar();
    p.android.addEvent(google.id, { title: 'День рождения Ани', date: '2027-11-07' });
    p.engine.markStale();
    await p.sync(appData([ANYA]));
    assert.deepEqual(p.android.titles(), anyaTitles.filter((t) => !t.startsWith('2027')));
  });

  test('событие со временем в другой день по UTC, но в тот же по местному — дубль', async () => {
    const tz = process.env.TZ;
    process.env.TZ = 'Asia/Almaty';
    try {
      const p = phone();
      const google = p.android.addCalendar();
      // 7 ноября 01:00 в Алматы — это ещё 6 ноября по UTC.
      p.android.addEvent(google.id, { title: 'ДР Ани', start: Date.UTC(2026, 10, 6, 20, 0), end: Date.UTC(2026, 10, 6, 21, 0), allDay: false });
      await p.sync(appData([ANYA]));
      assert.ok(!p.android.titles().some((t) => t.startsWith('2026-11-07')));
    } finally {
      process.env.TZ = tz;
    }
  });
});

describe('даты событий и окно', () => {
  test('новое событие — весь день с полуночи до полуночи UTC', () => {
    const f = eventFields({ key: 'b-a-2026', title: 't', notes: 'n', date: '2026-12-31', yearly: false, friendId: 'a', name: 'Аня', kind: 'birthday', label: '' });
    assert.deepEqual([f.startDate.toISOString(), f.endDate.toISOString()], ['2026-12-31T00:00:00.000Z', '2027-01-01T00:00:00.000Z']);
  });

  test('дата чужого события: весь день — по UTC, со временем — по местному, в любом часовом поясе', () => {
    const tz = process.env.TZ;
    try {
      for (const zone of ['Asia/Almaty', 'America/Los_Angeles', 'Pacific/Kiritimati', 'UTC']) {
        process.env.TZ = zone;
        assert.equal(eventDate({ startDate: '2026-11-07T00:00:00.000Z', allDay: true }), '2026-11-07', zone);
      }
      process.env.TZ = 'America/Los_Angeles';
      assert.equal(eventDate({ startDate: '2026-11-07T03:00:00.000Z', allDay: false }), '2026-11-06');
      process.env.TZ = 'Asia/Almaty';
      assert.equal(eventDate({ startDate: '2026-11-06T20:00:00.000Z', allDay: false }), '2026-11-07');
      assert.equal(eventDate({ startDate: null, allDay: true }), null);
      assert.equal(eventDate({ startDate: 'мусор', allDay: true }), null);
    } finally {
      process.env.TZ = tz;
    }
  });

  test('окно чтения захватывает все годы с запасом в день', () => {
    const { from, to } = calendarRange('2026-11-08');
    assert.deepEqual([from.toISOString(), to.toISOString()], ['2024-12-31T00:00:00.000Z', '2029-01-02T00:00:00.000Z']);
  });

  test('сотни друзей: всё создаётся за один проход, повтор ничего не меняет', async () => {
    const p = phone();
    const many = Array.from({ length: 300 }, (_, i) => friend({ id: `f${i}`, name: `Друг ${i}`, phone: '', birthday: `19${50 + (i % 50)}-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}` }));
    await p.sync(appData(many));
    assert.equal(p.android.evs.length, 1200);
    p.android.log = [];
    p.restart();
    await p.sync(appData(many));
    assert.deepEqual(p.android.log, []);
  });
});

describe('строка состояния в настройках', () => {
  const summary = (patch: Partial<CalendarSummary> = {}): CalendarSummary => ({ events: 21, fromContacts: 0, fromOthers: 0, hidden: false, ...patch });

  test('выключено — ничего; нет доступа — красная строка с кнопкой; ещё не синхронизировали — «заполняю»', () => {
    assert.equal(calendarStatus(false, false, null), null);
    assert.deepEqual(calendarStatus(true, false, summary()), { text: 'Нет доступа к календарю: даты в нём не обновляются.', tone: 'danger', icon: 'warning', needsAccess: true });
    assert.deepEqual(calendarStatus(true, true, null), { text: 'Заполняю календарь…', tone: 'muted', icon: 'refresh' });
    assert.deepEqual(calendarStatus(true, null, null), { text: 'Заполняю календарь…', tone: 'muted', icon: 'refresh' }, 'пока доступ проверяется');
  });

  test('числа склоняются', () => {
    assert.equal(calendarStatus(true, true, summary())!.text, 'В календаре 21 событие.');
    assert.equal(
      calendarStatus(true, true, summary({ events: 5, fromContacts: 2, fromOthers: 1 }))!.text,
      'В календаре 5 событий. Не повторяем: 2 дня рождения уже в контактах, 1 событие — в других календарях.',
    );
    assert.match(calendarStatus(true, true, summary({ fromOthers: 5 }))!.text, /Не повторяем: 5 событий — в других/);
  });

  test('скрытый календарь — предупреждение', () => {
    assert.deepEqual([calendarStatus(true, true, summary({ hidden: true }))!.tone, calendarStatus(true, true, summary({ hidden: true }))!.icon], ['warn', 'warning']);
    assert.equal(calendarStatus(true, true, summary())!.icon, 'check');
  });
});

// Годы окна в названиях тестов выше — для читаемости; проверим, что они совпадают с настоящим окном.
test('годы в тестах совпадают с окном', () => {
  const { from, to } = calendarRange('2026-11-08');
  assert.deepEqual(YEARS, [from.getUTCFullYear() + 1, from.getUTCFullYear() + 2, from.getUTCFullYear() + 3, to.getUTCFullYear() - 1].map(String));
});
