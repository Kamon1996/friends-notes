/// <reference types="node" />
// Лента «Скоро», отметка «сделано» и расписание уведомлений: крайние случаи, которых нет в dates.test.ts.
// Тесты с пометкой todo описывают правильное поведение для известных ошибок: они видны в отчёте
// и не валят сборку. Когда ошибку исправят, пометку todo нужно снять.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { addInterval, toISODate } from '../dates';
import { birthdayHint, completeReminder, notificationActions, planNotifications, upcomingItems } from '../events';
import { DEFAULT_SETTINGS, EMPTY_DATA, type AppData, type Friend, type Reminder, type Settings } from '../types';

const friend = (patch: Partial<Friend> = {}): Friend => ({
  id: 'f1',
  name: 'Лера',
  emoji: '',
  birthday: null,
  phone: '',
  food: '',
  flowers: '',
  gifts: '',
  notes: '',
  dates: [],
  createdAt: 0,
  ...patch,
});

const reminder = (patch: Partial<Reminder> = {}): Reminder => ({
  id: 'r1',
  title: 'Оплатить интернет',
  note: '',
  friendId: null,
  date: '2027-03-20',
  time: '10:00',
  repeat: null,
  advance: 0,
  done: false,
  createdAt: 0,
  ...patch,
});

const appData = (patch: Partial<Omit<AppData, 'settings'>> & { settings?: Partial<Settings> } = {}): AppData => ({
  ...EMPTY_DATA,
  ...patch,
  settings: { ...DEFAULT_SETTINGS, ...patch.settings },
});

/** «2027-03-09 10:00» — удобно сравнивать время уведомлений. */
const stamp = (d: Date) => `${toISODate(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

describe('лента «Скоро»', () => {
  const today = '2027-03-10';

  test('горизонт: день рождения через 60 дней в ленте, через 61 — нет', () => {
    const in60 = addInterval(today, 'day', 60);
    const in61 = addInterval(today, 'day', 61);
    const items = upcomingItems(
      appData({ friends: [friend({ id: 'a', birthday: `1990-${in60.slice(5)}` }), friend({ id: 'b', birthday: `1990-${in61.slice(5)}` })] }),
      60,
      today,
    );
    assert.deepEqual(items.map((i) => i.key), ['b-a']);
  });

  test('день рождения без года — без возраста', () => {
    const [item] = upcomingItems(appData({ friends: [friend({ birthday: '1904-04-01' })] }), 60, today);
    assert.ok(item.kind === 'birthday');
    assert.equal(item.age, null);
  });

  test('разовая важная дата: прошедшая скрыта, будущая без «лет»', () => {
    const f = friend({
      dates: [
        { id: 'past', title: 'Переезд', date: '2027-03-01', yearly: false },
        { id: 'soon', title: 'Свадьба', date: '2027-03-20', yearly: false },
      ],
    });
    const items = upcomingItems(appData({ friends: [f] }), 60, today);
    assert.deepEqual(items.map((i) => i.key), ['d-soon']);
    assert.ok(items[0].kind === 'date' && items[0].years === null);
  });

  test('в один день сначала праздники, потом дела по времени', () => {
    const items = upcomingItems(
      appData({
        friends: [friend({ birthday: '1990-03-12' })],
        reminders: [reminder({ id: 'late', date: '2027-03-12', time: '18:00' }), reminder({ id: 'early', date: '2027-03-12', time: '09:00' })],
      }),
      60,
      today,
    );
    assert.deepEqual(items.map((i) => i.key), ['b-f1', 'r-early', 'r-late']);
  });

  test('напоминание удалённого друга не роняет ленту и показывается «для себя»', () => {
    const [item] = upcomingItems(appData({ reminders: [reminder({ friendId: 'gone' })] }), 60, today);
    assert.ok(item.kind === 'reminder');
    assert.equal(item.friend, null);
  });

  test('просрочено то, что было вчера, а не то, что завтра', () => {
    const now = new Date();
    const yesterday = toISODate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
    const tomorrow = toISODate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
    const items = upcomingItems(appData({ reminders: [reminder({ id: 'y', date: yesterday }), reminder({ id: 't', date: tomorrow })] }), 60, toISODate(now));
    const overdue = Object.fromEntries(items.map((i) => [i.key, i.kind === 'reminder' && i.overdue]));
    assert.deepEqual(overdue, { 'r-y': true, 'r-t': false });
  });

  test('29 февраля в невисокосный год: праздник 28-го и возраст по годам', () => {
    const [item] = upcomingItems(appData({ friends: [friend({ birthday: '2000-02-29' })] }), 60, '2027-02-20');
    assert.equal(item.date, '2027-02-28');
    assert.ok(item.kind === 'birthday');
    assert.equal(item.age, 27);
  });
});

describe('«сделано» у повторяющегося напоминания', () => {
  test('давно просроченное переносится в будущее, а не на следующий прошедший раз', () => {
    const now = new Date(2027, 2, 10, 12, 0);
    const done = completeReminder(reminder({ date: '2027-01-04', repeat: { every: 1, unit: 'week' } }), now);
    assert.equal(done.date, '2027-03-15');
    assert.equal(done.done, false);
  });

  test('ежедневное, отмеченное заранее, уходит на завтра', () => {
    const now = new Date(2027, 2, 10, 12, 0);
    const done = completeReminder(reminder({ date: '2027-03-10', time: '18:00', repeat: { every: 1, unit: 'day' } }), now);
    assert.equal(done.date, '2027-03-11');
  });

  test('однократное становится сделанным и сохраняет дату', () => {
    const done = completeReminder(reminder({ date: '2027-03-20' }), new Date(2027, 2, 10));
    assert.deepEqual([done.done, done.date], [true, '2027-03-20']);
  });

  test('ежемесячное на 31-е после февраля возвращается на 31-е', () => {
    let r = reminder({ date: '2027-01-31', repeat: { every: 1, unit: 'month' } });
    r = completeReminder(r, new Date(2027, 1, 1, 12));
    assert.equal(r.date, '2027-02-28');
    r = completeReminder(r, new Date(2027, 2, 1, 12));
    assert.equal(r.date, '2027-03-31');
  });

  test('уведомления серии после февраля тоже идут 31-го', () => {
    const r = reminder({ date: '2027-02-28', anchor: '2027-01-31', repeat: { every: 1, unit: 'month' } });
    const plan = planNotifications(appData({ reminders: [r] }), new Date(2027, 1, 1, 12));
    assert.deepEqual(plan.slice(0, 3).map((n) => toISODate(n.at)), ['2027-02-28', '2027-03-31', '2027-04-30']);
  });

  test('якорь позже ближайшего раза (дату передвинули) не мешает: считаем от ближайшего', () => {
    const r = reminder({ date: '2027-03-05', anchor: '2027-04-10', repeat: { every: 1, unit: 'month' } });
    assert.equal(completeReminder(r, new Date(2027, 2, 1, 12)).date, '2027-04-05');
  });
});

describe('расписание уведомлений', () => {
  const now = new Date(2027, 2, 10, 12, 0);

  test('день рождения без года — без возраста в заголовке', () => {
    const plan = planNotifications(appData({ friends: [friend({ birthday: '1904-03-20' })] }), now);
    assert.equal(plan[0].title, 'Лера — день рождения');
  });

  test('уже прошедшие уведомления не планируются: сегодняшний праздник в 10:00, а сейчас 12:00', () => {
    const plan = planNotifications(appData({ friends: [friend({ birthday: '1990-03-10' })] }), now);
    assert.ok(plan.every((n) => n.at > now));
    assert.deepEqual(plan.map((n) => stamp(n.at)), ['2028-03-09 10:00', '2028-03-10 10:00']);
  });

  test('без «за день» — одно уведомление на событие, в выбранное время', () => {
    const plan = planNotifications(appData({ friends: [friend({ birthday: '1990-03-20' })], settings: { eventDayBefore: false, eventTime: '08:45' } }), now);
    assert.deepEqual(plan.map((n) => stamp(n.at)), ['2027-03-20 08:45', '2028-03-20 08:45']);
  });

  test('напоминание ведёт в свою форму; текст — заметка, иначе имя друга, иначе «Напоминание»', () => {
    const plan = planNotifications(
      appData({
        friends: [friend({ id: 'mom', name: 'Мама' })],
        reminders: [
          reminder({ id: 'a', date: '2027-03-20', note: 'Спросить про дачу', friendId: 'mom' }),
          reminder({ id: 'b', date: '2027-03-21', friendId: 'mom' }),
          reminder({ id: 'c', date: '2027-03-22' }),
        ],
      }),
      now,
    );
    assert.deepEqual(
      plan.map((n) => [n.url, n.body]),
      [
        ['/reminder/edit?id=a', 'Спросить про дачу'],
        ['/reminder/edit?id=b', 'Мама'],
        ['/reminder/edit?id=c', 'Напоминание'],
      ],
    );
  });

  test('сделанные напоминания не планируются', () => {
    assert.equal(planNotifications(appData({ reminders: [reminder({ done: true })] }), now).length, 0);
  });

  test('серия повторяющегося напоминания — не больше 12 уведомлений', () => {
    const plan = planNotifications(appData({ reminders: [reminder({ date: '2027-03-11', repeat: { every: 1, unit: 'day' } })] }), now);
    assert.equal(plan.length, 12);
    assert.equal(stamp(plan[11].at), '2027-03-22 10:00');
  });

  test('праздник ведёт в карточку друга, кнопки — позвонить и написать', () => {
    const f = friend({ birthday: '1990-03-20', phone: '+7 999 123-45-67', telegramId: 42, whatsapp: '79991234567' });
    const [n] = planNotifications(appData({ friends: [f] }), now);
    assert.equal(n.url, '/friend/f1');
    assert.equal(n.callUrl, 'tel:+79991234567');
    assert.match(n.writeUrl ?? '', /42/, 'Telegram важнее WhatsApp');
  });
});

describe('кнопки и подсказки в уведомлениях', () => {
  test('написать: Telegram, потом WhatsApp, потом Viber; без контактов — без кнопок', () => {
    assert.match(notificationActions({ phone: '', telegramId: null, whatsapp: '79990000000', viber: '79991111111' }).writeUrl ?? '', /wa\.me|whatsapp/);
    assert.match(notificationActions({ phone: '', telegramId: null, whatsapp: null, viber: '79991111111' }).writeUrl ?? '', /viber/);
    assert.deepEqual(notificationActions({ phone: '', telegramId: null, whatsapp: null, viber: null }), {});
  });

  test('подсказка: цветы и еда, а если их нет — идеи подарков; длинный текст сокращается', () => {
    assert.equal(birthdayHint({ flowers: 'Пионы', food: 'Суши', gifts: 'Книги' }), 'Цветы: Пионы. Еда: Суши.');
    assert.equal(birthdayHint({ flowers: '', food: '', gifts: 'Книги' }), 'Идеи подарков: Книги.');
    assert.equal(birthdayHint({ flowers: '', food: '', gifts: '' }), null);
    const long = birthdayHint({ flowers: 'а'.repeat(100), food: '', gifts: '' }) ?? '';
    assert.ok(long.length < 80 && long.includes('…'), long);
  });
});
