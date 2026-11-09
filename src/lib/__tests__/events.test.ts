/// <reference types="node" />
// Лента «Скоро», отметка «сделано» и расписание уведомлений: крайние случаи, которых нет в dates.test.ts.
// Тесты с пометкой todo описывают правильное поведение для известных ошибок: они видны в отчёте
// и не валят сборку. Когда ошибку исправят, пометку todo нужно снять.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { addInterval, toISODate } from '../dates';
import { birthdayHint, completeReminder, countdown, notificationActions, planNotifications, reminderFuse, reminderOverdue, reopenReminder, rollReminder, upcomingItems } from '../events';
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

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

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
  // Отметили — сделано до конца дня (дата та же, можно вернуть); со следующего дня — снова активно на ближайший раз.
  const doneThenRoll = (r: Reminder, at: Date, next: Date) => rollReminder(completeReminder(r, at), next);

  test('отмеченное — сделано, дата та же; «вернуть» — как было', () => {
    const r = reminder({ date: '2027-03-10', repeat: { every: 1, unit: 'day' } });
    const done = completeReminder(r, new Date(2027, 2, 10, 12));
    assert.deepEqual([done.done, done.date, done.doneAt], [true, '2027-03-10', new Date(2027, 2, 10, 12).getTime()]);
    const back = reopenReminder(done);
    assert.deepEqual([back.done, back.date, 'doneAt' in back], [false, '2027-03-10', false]);
  });

  test('в тот же день не возвращается, назавтра — снова активно', () => {
    const done = completeReminder(reminder({ date: '2027-03-10', time: '18:00', repeat: { every: 1, unit: 'day' } }), new Date(2027, 2, 10, 12));
    assert.equal(rollReminder(done, new Date(2027, 2, 10, 23, 59)), done);
    const next = rollReminder(done, new Date(2027, 2, 11, 0, 1));
    assert.deepEqual([next.done, next.date, 'doneAt' in next], [false, '2027-03-11', false]);
  });

  test('давно просроченное после отметки уходит в будущее, а не на следующий прошедший раз', () => {
    const r = doneThenRoll(reminder({ date: '2027-01-04', repeat: { every: 1, unit: 'week' } }), new Date(2027, 2, 10, 12), new Date(2027, 2, 11, 8));
    assert.deepEqual([r.date, r.done], ['2027-03-15', false]);
  });

  test('открыли приложение через неделю — ежедневное встаёт на сегодня, даже если время уже прошло', () => {
    const r = doneThenRoll(reminder({ date: '2027-03-10', time: '09:00', repeat: { every: 1, unit: 'day' } }), new Date(2027, 2, 10, 12), new Date(2027, 2, 17, 15));
    assert.equal(r.date, '2027-03-17');
  });

  test('отмеченное заранее: следующий раз после отмеченного', () => {
    const r = doneThenRoll(reminder({ date: '2027-03-15', repeat: { every: 1, unit: 'week' } }), new Date(2027, 2, 10, 12), new Date(2027, 2, 11, 8));
    assert.equal(r.date, '2027-03-22');
  });

  test('однократное становится сделанным и сохраняет дату; назавтра так и остаётся', () => {
    const done = completeReminder(reminder({ date: '2027-03-20' }), new Date(2027, 2, 10));
    assert.deepEqual([done.done, done.date], [true, '2027-03-20']);
    assert.equal(rollReminder(done, new Date(2027, 2, 12)), done);
  });

  test('ежемесячное на 31-е после февраля возвращается на 31-е', () => {
    let r = reminder({ date: '2027-01-31', repeat: { every: 1, unit: 'month' } });
    r = doneThenRoll(r, new Date(2027, 1, 1, 12), new Date(2027, 1, 2, 8));
    assert.equal(r.date, '2027-02-28');
    r = doneThenRoll(r, new Date(2027, 2, 1, 12), new Date(2027, 2, 2, 8));
    assert.equal(r.date, '2027-03-31');
  });

  test('уведомления серии после февраля тоже идут 31-го', () => {
    const r = reminder({ date: '2027-02-28', anchor: '2027-01-31', repeat: { every: 1, unit: 'month' } });
    const plan = planNotifications(appData({ reminders: [r] }), new Date(2027, 1, 1, 12));
    assert.deepEqual(plan.slice(0, 3).map((n) => toISODate(n.at)), ['2027-02-28', '2027-03-31', '2027-04-30']);
  });

  test('якорь позже ближайшего раза (дату передвинули) не мешает: считаем от ближайшего', () => {
    const r = reminder({ date: '2027-03-05', anchor: '2027-04-10', repeat: { every: 1, unit: 'month' } });
    assert.equal(doneThenRoll(r, new Date(2027, 2, 1, 12), new Date(2027, 2, 2, 8)).date, '2027-04-05');
  });

  test('сделанное сегодня повторяющееся: этот раз без уведомления, следующие — как обычно', () => {
    const r = completeReminder(reminder({ date: '2027-03-10', time: '18:00', repeat: { every: 1, unit: 'day' } }), new Date(2027, 2, 10, 12));
    const plan = planNotifications(appData({ reminders: [r] }), new Date(2027, 2, 10, 12));
    assert.deepEqual(plan.slice(0, 2).map((n) => stamp(n.at)), ['2027-03-11 18:00', '2027-03-12 18:00']);
  });
});

describe('просрочено и фитиль', () => {
  const now = new Date(2027, 2, 10, 12, 0);
  test('«до срока» и повторяющееся просрочены, когда прошёл весь день; «на дату и время» — когда прошло время', () => {
    assert.equal(reminderOverdue(reminder({ date: '2027-03-10', time: '09:00' }), now), false);
    assert.equal(reminderOverdue(reminder({ date: '2027-03-09', time: '23:00' }), now), true);
    assert.equal(reminderOverdue(reminder({ date: '2027-03-10', time: '09:00', repeat: { every: 1, unit: 'day' } }), now), false);
    assert.equal(reminderOverdue(reminder({ date: '2027-03-10', time: '09:00', kind: 'at' }), now), true);
    assert.equal(reminderOverdue(reminder({ date: '2027-03-10', time: '15:00', kind: 'at' }), now), false);
    assert.equal(reminderOverdue(reminder({ date: '2027-03-01', done: true }), now), false);
  });

  test('фитиль: только создали — полный, середина пути — половина, срок вышел — 0, сделано — нет фитиля', () => {
    const created = new Date(2027, 2, 8, 0, 0).getTime();
    const r = reminder({ date: '2027-03-11', createdAt: created }); // срок — до конца 11-го: 4 дня
    near(reminderFuse(r, new Date(created))!, 1);
    near(reminderFuse(r, new Date(2027, 2, 10, 0, 0))!, 0.5);
    assert.equal(reminderFuse(r, new Date(2027, 2, 12, 0, 1)), 0);
    assert.equal(reminderFuse({ ...r, done: true }, now), null);
  });

  test('фитиль: до срока больше двух недель — полный, за две недели начинает гореть', () => {
    const r = reminder({ date: '2027-06-01', createdAt: new Date(2027, 0, 1).getTime() });
    near(reminderFuse(r, now)!, 1);
    const close = reminder({ date: '2027-03-16', createdAt: new Date(2027, 0, 1).getTime() }); // до конца 16-го — 6,5 дня из 14
    near(reminderFuse(close, now)!, 6.5 / 14, 1e-3);
  });

  test('фитиль: «на дату и время» — до самого времени, ежедневное — горит весь день', () => {
    const at = reminder({ date: '2027-03-10', time: '18:00', kind: 'at', createdAt: new Date(2027, 2, 10, 6, 0).getTime() });
    near(reminderFuse(at, now)!, 0.5);
    const daily = reminder({ date: '2027-03-10', repeat: { every: 1, unit: 'day' } });
    near(reminderFuse(daily, now)!, 0.5);
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

  test('у разовых напоминаний кнопка «Сделано», у повторяющихся и праздников — нет', () => {
    const plan = planNotifications(
      appData({
        friends: [friend({ birthday: '1990-03-20' })],
        reminders: [reminder({ id: 'once', date: '2027-03-21', advance: 60 }), reminder({ id: 'rep', date: '2027-03-11', repeat: { every: 1, unit: 'week' } })],
      }),
      now,
    );
    assert.deepEqual(
      plan.filter((n) => n.url.includes('once')).map((n) => n.reminderId),
      ['once', 'once'],
    );
    assert.ok(plan.filter((n) => !n.url.includes('once')).every((n) => n.reminderId === undefined));
  });

  test('«на дату и время»: за день и в само время, с кнопкой «Сделано»; «заранее» и «каждый день» не действуют', () => {
    const plan = planNotifications(appData({ reminders: [reminder({ id: 'v', title: 'Стоматолог', date: '2027-03-15', time: '15:00', kind: 'at', note: 'Клиника на Ленина', advance: 10080, daily: true })] }), now);
    assert.deepEqual(
      plan.map((n) => [stamp(n.at), n.body, n.reminderId]),
      [
        ['2027-03-14 15:00', 'Завтра в 15:00 · Клиника на Ленина', 'v'],
        ['2027-03-15 15:00', 'Клиника на Ленина', 'v'],
      ],
    );
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

describe('каждый день до срока', () => {
  // Сейчас — 10 марта 2027, 12:00.
  const now = new Date(2027, 2, 10, 12, 0);
  const daily = (patch: Partial<Reminder> = {}) => reminder({ id: 'd', title: 'Билеты на самолёт', date: '2027-03-14', time: '12:30', daily: true, ...patch });

  test('с сегодняшнего дня до срока, в выбранное время, с обратным отсчётом; в день срока — «Сегодня срок»', () => {
    const plan = planNotifications(appData({ reminders: [daily()] }), now);
    assert.deepEqual(
      plan.map((n) => [stamp(n.at), n.title, n.body]),
      [
        ['2027-03-10 12:30', 'Билеты на самолёт', 'Осталось 4 дня — до 14 мар'],
        ['2027-03-11 12:30', 'Билеты на самолёт', 'Осталось 3 дня — до 14 мар'],
        ['2027-03-12 12:30', 'Билеты на самолёт', 'Осталось 2 дня — до 14 мар'],
        ['2027-03-13 12:30', 'Билеты на самолёт', 'Завтра срок'],
        ['2027-03-14 12:30', 'Билеты на самолёт', 'Сегодня срок'],
      ],
    );
    assert.ok(plan.every((n) => n.reminderId === 'd' && n.url === '/reminder/edit?id=d'), 'везде кнопка «Сделано» и переход в напоминание');
  });

  test('сегодняшнее время уже прошло — начинаем с завтра; «заранее» не добавляется', () => {
    const plan = planNotifications(appData({ reminders: [daily({ time: '09:00', advance: 1440 })] }), now);
    assert.deepEqual(plan.map((n) => stamp(n.at)), ['2027-03-11 09:00', '2027-03-12 09:00', '2027-03-13 09:00', '2027-03-14 09:00']);
  });

  test('заметка или имя друга — после отсчёта', () => {
    const [a] = planNotifications(appData({ reminders: [daily({ note: 'Взять паспорт' })] }), now);
    assert.equal(a.body, 'Осталось 4 дня — до 14 мар · Взять паспорт');
    const [b] = planNotifications(appData({ friends: [friend({ id: 'm', name: 'Мама' })], reminders: [daily({ friendId: 'm' })] }), now);
    assert.equal(b.body, 'Осталось 4 дня — до 14 мар · Мама');
  });

  test('срок сегодня — одно уведомление; срок прошёл или сделано — ничего', () => {
    assert.deepEqual(planNotifications(appData({ reminders: [daily({ date: '2027-03-10' })] }), now).map((n) => [stamp(n.at), n.body]), [['2027-03-10 12:30', 'Сегодня срок']]);
    assert.equal(planNotifications(appData({ reminders: [daily({ date: '2027-03-09' })] }), now).length, 0);
    assert.equal(planNotifications(appData({ reminders: [daily({ done: true })] }), now).length, 0);
  });

  test('далёкий срок: ближайшие 12 дней и сам срок — остальное запланируется при следующем открытии', () => {
    const plan = planNotifications(appData({ reminders: [daily({ date: '2027-06-01' })] }), now);
    assert.equal(plan.length, 13);
    assert.equal(stamp(plan[11].at), '2027-03-21 12:30');
    assert.deepEqual([stamp(plan[12].at), plan[12].body], ['2027-06-01 12:30', 'Сегодня срок']);
  });

  test('у повторяющегося флаг не действует — обычная серия', () => {
    const plan = planNotifications(appData({ reminders: [daily({ date: '2027-03-11', repeat: { every: 1, unit: 'week' } })] }), now);
    assert.equal(plan[0].body, 'Напоминание');
  });

  test('отсчёт: склонения и «завтра»', () => {
    assert.deepEqual(
      [1, 2, 5, 11, 21, 22].map((k) => countdown(k, '2027-11-20')),
      ['Завтра срок', 'Осталось 2 дня — до 20 ноя', 'Осталось 5 дней — до 20 ноя', 'Осталось 11 дней — до 20 ноя', 'Остался 21 день — до 20 ноя', 'Осталось 22 дня — до 20 ноя'],
    );
  });
});
