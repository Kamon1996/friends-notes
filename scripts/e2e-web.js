// Сквозные тесты на веб-сборке (npx expo export --platform web): каждый сценарий — в чистом браузере
// со своими данными и замороженными часами, поэтому сценарии не зависят друг от друга и порядка запуска.
//
//   node scripts/e2e-web.js <папка веб-сборки> <папка для снимков сбоев> [--grep текст] [--workers N]
//
// Сценарий с пометкой `known` описывает правильное поведение для известной ошибки: пока ошибка есть,
// он отмечается как «известная ошибка» и не валит прогон; когда начнёт проходить — прогон упадёт,
// чтобы пометку сняли и тест стал обычным.
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { chromium, devices } = require('playwright');

const args = process.argv.slice(2);
const root = args[0];
const out = args[1] || 'e2e-results';
const grep = args.includes('--grep') ? args[args.indexOf('--grep') + 1].toLowerCase() : '';
const WORKERS = args.includes('--workers') ? Number(args[args.indexOf('--workers') + 1]) : 3;
if (!root || !fs.existsSync(path.join(root, 'index.html'))) {
  console.error('Укажи папку веб-сборки: node scripts/e2e-web.js dist-web e2e-results');
  process.exit(2);
}
fs.mkdirSync(out, { recursive: true });

const KEY = 'friends-notes/data/v1';
const VERSION = require('../app.json').expo.version;

// ---------- Замороженное время: среда, 10 июня 2026, 12:00 по Москве ----------
const TZ = 'Europe/Moscow';
const NOW = new Date('2026-06-10T12:00:00+03:00');
const TODAY = '2026-06-10';
/** Дата через n дней от «сегодня» (n может быть отрицательным). */
const d = (n) => {
  const [y, m, dd] = TODAY.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10);
};
/** День рождения: тот же день, что через n дней, но в году y. */
const bday = (n, y) => `${y}-${d(n).slice(5)}`;

// ---------- Данные ----------
const F = (o) => ({ emoji: '', phone: '', food: '', flowers: '', gifts: '', notes: '', dates: [], createdAt: 1, birthday: null, ...o });
const R = (o) => ({ note: '', friendId: null, time: '12:00', repeat: null, advance: 0, done: false, createdAt: 1, ...o });
const SETTINGS = { eventTime: '10:00', eventDayBefore: true, theme: 'light', accentLight: 'terracotta', accentDark: 'terracotta', crashReports: true, lastSeenVersion: VERSION, newReminderForm: 'quick' };
const ANYA = F({
  id: 'a', name: 'Аня Смирнова', birthday: bday(0, 1995), phone: '+7 999 123-45-67', telegramId: 123456789, whatsapp: '79991234567',
  food: 'Суши, тирамису', flowers: 'Пионы', gifts: 'Керамика', notes: 'Любит настолки',
  dates: [{ id: 'd1', title: 'Познакомились', date: bday(12, 2018), yearly: true }],
  socials: [{ id: 's1', network: 'tiktok', url: 'https://www.tiktok.com/@anya', handle: 'anya', source: 'tg' }, { id: 's2', network: 'site', url: 'https://anya.design', label: 'anya.design', source: 'manual' }],
});
const IGOR = F({ id: 'b', name: 'Игорь Ветров', birthday: bday(3, 1992), phone: '+375 29 111-22-33', viber: '375291112233', food: 'Стейк' });
const MAMA = F({ id: 'c', name: 'Мама', birthday: bday(40, 1966), flowers: 'Тюльпаны' });
const seed = (patch = {}) => ({
  version: 1,
  settings: { ...SETTINGS, ...(patch.settings || {}) },
  friends: patch.friends || [ANYA, IGOR, MAMA],
  reminders: patch.reminders || [
    R({ id: 'r1', title: 'Купить цветы — Аня', friendId: 'a', date: d(0), time: '18:00', repeat: { every: 2, unit: 'month' } }),
    R({ id: 'r3', title: 'Написать Диме', date: d(-1), time: '20:00', advance: 1440 }),
    R({ id: 'r4', title: 'Сдать отчёт', date: d(-3), time: '09:00', done: true }),
  ],
});
const MORE_FRIENDS = ['Дима Петров', 'Алина', 'Борис', 'Вера', 'Женя'].map((name, i) => F({ id: `m${i}`, name, birthday: bday(100 + i * 20, 1990) }));

// ---------- Сценарии ----------
const scenarios = [];
const scenario = (name, fn, opts = {}) => scenarios.push({ name, fn, ...opts });

// ===== Лента «Скоро» =====
scenario('Напоминание на дату прошлого года показывает год', async ({ ui }) => {
  await ui.go('/');
  await ui.see('Старое дело');
  await ui.see('1 янв 2025');
}, { data: seed({ reminders: [R({ id: 'old', title: 'Старое дело', date: '2025-01-01' })] }) });

scenario('Напоминания: свайп влево только открывает «Удалить» — дата и «сделано» не меняются; «Удалить» спрашивает и удаляет', async ({ ui }) => {
  await ui.go('/');
  await ui.see('Подстаканник купить');
  await ui.swipe('Подстаканник купить', -160);
  await ui.see('Удалить', { label: true });
  await ui.pause(400);
  let r = (await ui.data()).reminders.find((x) => x.id === 'daily');
  assert.deepEqual([r.date, r.done], [d(1), false], 'свайп влево ничего не отмечает и не переносит');
  await ui.tap('Удалить');
  await ui.waitData((x) => !x.reminders.some((x) => x.id === 'daily'), 'не удалилось');
  assert.match(ui.dialogs.join('\n'), /Удалить/);
}, { data: seed({ reminders: [R({ id: 'daily', title: 'Подстаканник купить', date: d(1), repeat: { every: 1, unit: 'day' } })] }) });

scenario('Напоминания: свайп вправо — сделано (и повторяющееся тоже), внизу «Сделано сегодня»; ещё раз вправо — вернуть', async ({ ui }) => {
  await ui.go('/');
  await ui.swipe('Билеты на самолёт', 160);
  let data = await ui.waitData((x) => x.reminders.find((r) => r.id === 'once').done, 'разовое не отмечено');
  assert.equal(data.reminders.find((r) => r.id === 'once').date, d(2));
  await ui.swipe('Подстаканник купить', 160);
  data = await ui.waitData((x) => x.reminders.find((r) => r.id === 'daily').done, 'повторяющееся не отмечено');
  assert.equal(data.reminders.find((r) => r.id === 'daily').date, d(1), 'дата та же — вернуть можно как было');
  await ui.see('Сделано сегодня');
  await ui.see('Сделано · сегодня');
  await ui.see('Сделано · снова', { exact: false });
  // Передумал — ещё раз вправо.
  await ui.swipe('Подстаканник купить', 160);
  data = await ui.waitData((x) => !x.reminders.find((r) => r.id === 'daily').done, 'не вернулось');
  assert.deepEqual([data.reminders.find((r) => r.id === 'daily').date, 'doneAt' in data.reminders.find((r) => r.id === 'daily')], [d(1), false]);
}, {
  data: seed({
    reminders: [R({ id: 'daily', title: 'Подстаканник купить', date: d(1), repeat: { every: 1, unit: 'day' } }), R({ id: 'once', title: 'Билеты на самолёт', date: d(2) })],
  }),
});

scenario('Напоминания: без кружков; первая строка один раз «подглядывает» вправо и влево, после своего свайпа — больше нет', async ({ ui, page }) => {
  await ui.go('/');
  await ui.see('Написать Диме');
  assert.equal(await page.locator('[role="checkbox"]').count(), 0, 'кружков в строках быть не должно');
  // Следим за первой строкой (просроченное — наверху «Сегодня»): сначала вправо, потом влево, потом на место.
  const h = await page.getByText('Написать Диме', { exact: true }).last().elementHandle();
  const x0 = (await h.boundingBox()).x;
  let max = 0;
  let min = 0;
  for (let i = 0; i < 110; i++) {
    const dx = (await h.boundingBox()).x - x0;
    max = Math.max(max, dx);
    min = Math.min(min, dx);
    await page.waitForTimeout(40);
  }
  assert.ok(max > 30 && min < -30, `строка не подглядывала: ${min}…${max}`);
  assert.ok(Math.abs((await h.boundingBox()).x - x0) < 1, 'строка не вернулась на место');
  assert.equal(await page.evaluate(() => localStorage.getItem('friends-notes/swipe-hint')), '1', 'показ подсказки не засчитан');
  assert.ok((await ui.data()).reminders.every((r) => !r.done || r.id === 'r4'), 'подсказка ничего не отметила');
  // Провёл сам — подсказка больше не нужна.
  await ui.swipe('Написать Диме', -160);
  await ui.see('Удалить', { label: true });
  await page.waitForFunction(() => localStorage.getItem('friends-notes/swipe-hint') === '3', null, { timeout: 3000 }).catch(() => {});
  assert.equal(await page.evaluate(() => localStorage.getItem('friends-notes/swipe-hint')), '3', 'после своего свайпа подсказка осталась');
}, { storage: { 'friends-notes/swipe-hint': '0' } });

scenario('Напоминания: подсказка не больше трёх раз — на четвёртый строка стоит', async ({ ui, page }) => {
  await ui.go('/');
  await ui.see('Написать Диме');
  const h = await page.getByText('Написать Диме', { exact: true }).last().elementHandle();
  const x0 = (await h.boundingBox()).x;
  let moved = 0;
  for (let i = 0; i < 60; i++) {
    moved = Math.max(moved, Math.abs((await h.boundingBox()).x - x0));
    await page.waitForTimeout(40);
  }
  assert.equal(moved, 0, 'подсказка показалась в четвёртый раз');
}, { storage: { 'friends-notes/swipe-hint': '3' } });

scenario('Карточка друга: напоминание без кружка, свайп вправо — «сделано»', async ({ ui, page }) => {
  await ui.go('/friend/a');
  await ui.see('Купить цветы — Аня');
  assert.equal(await page.locator('[role="checkbox"]').count(), 0, 'кружков в строках быть не должно');
  await ui.swipe('Купить цветы — Аня', 160);
  const data = await ui.waitData((x) => x.reminders.find((r) => r.id === 'r1').done, 'не отмечено');
  assert.equal(data.reminders.find((r) => r.id === 'r1').date, d(0));
  await ui.see('Сделано · снова пн, 10 авг');
});

scenario('Напоминания: повторяющееся, сделанное вчера, сегодня снова активно — на ближайший раз', async ({ ui }) => {
  await ui.go('/');
  const data = await ui.waitData((x) => !x.reminders.find((r) => r.id === 'pills').done, 'не вернулось в активные');
  assert.equal(data.reminders.find((r) => r.id === 'pills').date, d(0));
  await ui.see('Таблетки');
  await ui.notSee('Сделано сегодня');
}, {
  data: seed({
    reminders: [R({ id: 'pills', title: 'Таблетки', date: d(-1), time: '09:00', repeat: { every: 1, unit: 'day' }, done: true, doneAt: new Date(`${d(-1)}T21:00:00+03:00`).getTime() })],
  }),
});

// ===== Друзья =====
scenario('Друзья: поиск по имени, латиницей, в другой раскладке и без совпадений', async ({ ui }) => {
  await ui.go('/friends');
  await ui.see('3 человека');
  const search = async (q) => { await ui.fill('Поиск по имени', q); };
  await search('мам'); await ui.see('Мама'); await ui.notSee('Игорь Ветров');
  await search('smirnova'); await ui.see('Аня Смирнова'); await ui.notSee('Мама');
  await search('bujhm'); await ui.see('Игорь Ветров'); await ui.notSee('Аня Смирнова');
  await search('тюльп'); await ui.see('Никого не нашлось'); // по цветам и заметкам не ищем
  await search('ззз'); await ui.see('Никого не нашлось');
  await search(''); await ui.see('Мама');
});

scenario('Друзья: сортировка по ближайшему дню рождения', async ({ ui }) => {
  await ui.go('/friends');
  await ui.tap('Скоро день рождения');
  const t = await ui.text();
  const at = (s) => t.indexOf(s);
  assert.ok(at('Аня Смирнова') < at('Игорь Ветров') && at('Игорь Ветров') < at('Мама'), t.slice(0, 300));
});

scenario('Друзья: выбор долгим нажатием и удаление вместе с напоминаниями этих друзей', async ({ ui }) => {
  await ui.go('/friends');
  const before = await ui.box('Аня Смирнова');
  await ui.longPress('Аня Смирнова');
  await ui.see('Выбрано: 1', { label: true });
  const after = await ui.box('Аня Смирнова');
  assert.ok(Math.abs(after.y - before.y) < 2, `список прыгнул при входе в выбор: ${before.y} → ${after.y}`);
  await ui.tap('Игорь Ветров');
  await ui.see('Выбрано: 2', { label: true });
  await ui.tap('Удалить выбранных');
  const data = await ui.waitData((x) => x.friends.length === 1, 'друзья не удалились');
  assert.deepEqual(data.friends.map((f) => f.name), ['Мама']);
  assert.deepEqual(data.reminders.map((r) => r.id).sort(), ['r3', 'r4'], 'напоминание удалённой Ани должно уйти, личные — остаться');
  await ui.see('1 человек');
});

scenario('Друзья: колокольчик в режиме выбора выключает уведомления о событиях', async ({ ui }) => {
  await ui.go('/friends');
  await ui.longPress('Мама');
  await ui.tap('Выключить уведомления');
  await ui.waitData((x) => x.friends.find((f) => f.id === 'c').muted === true, 'уведомления не выключились');
  await ui.notSee('Выбрано: 1', { label: true });
});

// ===== Карточка друга =====
scenario('Карточка: связь только через то, что есть; предпочтения, даты, напоминания', async ({ ui }) => {
  await ui.go('/friends');
  await ui.tap('Аня Смирнова');
  for (const s of ['31 год', 'сегодня', 'Позвонить', 'Telegram', 'WhatsApp', 'Суши, тирамису', 'Пионы', 'Керамика', 'Любит настолки', 'Познакомились', 'Купить цветы — Аня', 'TikTok', 'anya.design']) await ui.see(s);
  await ui.notSee('Viber');
  await ui.notSee('Добавить день рождения'); // дата есть — подсказка не нужна
});

scenario('Карточка: знак зодиака чипом рядом с отсчётом; без дня рождения — без знака', async ({ ui }) => {
  await ui.go('/friend/c');
  await ui.see('Знак зодиака: Рак', { label: true });
  await ui.see('Рак');
  await ui.go('/friend/a');
  await ui.see('Знак зодиака: Близнецы', { label: true });
  await ui.go('/friend/x');
  await ui.see('Добавить день рождения');
  await ui.notSee('Знак зодиака', { label: true });
}, { data: seed({ friends: [ANYA, IGOR, MAMA, F({ id: 'x', name: 'Без даты' })] }) });

scenario('Знаки зодиака: маленький знак в списке и в карточке; переключатель в настройках прячет их везде', async ({ ui }) => {
  await ui.go('/friends');
  await ui.see('Знак зодиака: Рак', { label: true }); // Мама, 20 июля
  await ui.go('/friend/a');
  await ui.see('Близнецы');
  await ui.go('/settings');
  await ui.see('Знаки зодиака');
  await ui.tap('Показывать знаки зодиака');
  await ui.waitData((x) => x.settings.showZodiac === false, 'переключатель не сохранился');
  for (const path of ['/friends', '/friend/c']) {
    await ui.go(path);
    await ui.notSee('Знак зодиака', { label: true });
  }
});

scenario('Карточка: звезда поднимает друга в «Избранные»', async ({ ui, page }) => {
  await ui.go('/friends');
  await ui.tap('Мама');
  await ui.tap('В избранное');
  await ui.waitData((x) => x.friends.find((f) => f.id === 'c').favorite === true, 'звезда не сохранилась');
  await ui.see('Убрать из избранного', { label: true });
  await page.goBack();
  await ui.see('Избранные');
  const t = await ui.text();
  assert.ok(t.indexOf('Избранные') < t.indexOf('Мама') && t.indexOf('Мама') < t.indexOf('Аня Смирнова'), t.slice(0, 300));
});

scenario('Карточка: «Добавить» в напоминаниях создаёт напоминание для этого друга', async ({ ui }) => {
  await ui.go('/friends');
  await ui.tap('Игорь Ветров');
  await ui.tap('Добавить');
  await ui.see('Новое напоминание');
  await ui.fill('Например, сдать отчёт', 'Вернуть книгу', { orPlaceholder: /^Например, / });
  await ui.tap('Сохранить');
  const data = await ui.waitData((x) => x.reminders.some((r) => r.title === 'Вернуть книгу'), 'не сохранилось');
  assert.equal(data.reminders.find((r) => r.title === 'Вернуть книгу').friendId, 'b');
});

scenario('Карточка: нажал на «Подарки» — шторка с текстом, курсор в конце; дописал и сохранил', async ({ ui, page }) => {
  await ui.go('/friend/a');
  await ui.see('Подарки: Керамика. Изменить', { label: true });
  await ui.tap('Керамика');
  await ui.see('Каждая идея с новой строки — в карточке будет список.');
  const caret = await page.evaluate(() => { const el = document.activeElement; return el && 'selectionStart' in el ? [el.value, el.selectionStart] : null; });
  assert.deepEqual(caret, ['Керамика', 'Керамика'.length], 'поле в фокусе, курсор в конце');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Настолки  ', { delay: 10 });
  await ui.tap('Сохранить');
  await ui.notSee('Каждая идея с новой строки');
  await ui.see('Настолки');
  await ui.waitData((x) => x.friends.find((f) => f.id === 'a').gifts === 'Керамика\nНастолки', 'подарки не сохранились (или с хвостом пробелов)');
  assert.equal(ui.dialogs.length, 0, 'при сохранении ничего не спрашиваем');
});

scenario('Карточка: закрыл шторку с правками — спросим; «Не сохранять» ничего не меняет, без правок — без вопроса', async ({ ui }) => {
  await ui.go('/friend/a');
  await ui.tap('Пионы');
  await ui.fill('Пионы, белые розы…', 'Тюльпаны');
  ui.dismissNextDialog();
  await ui.tap('Закрыть');
  assert.match(ui.dialogs.join('\n'), /Сохранить изменения\?/);
  await ui.notSee('Пионы, белые розы…');
  await ui.see('Пионы');
  assert.equal((await ui.data()).friends.find((f) => f.id === 'a').flowers, 'Пионы');

  await ui.tap('Пионы');
  await ui.tap('Закрыть');
  assert.equal(ui.dialogs.length, 1, 'без правок закрываем молча');

  await ui.tap('Пионы');
  await ui.fill('Пионы, белые розы…', 'Тюльпаны');
  await ui.tap('Закрыть'); // вопрос подтверждён — сохраняем
  await ui.waitData((x) => x.friends.find((f) => f.id === 'a').flowers === 'Тюльпаны', 'по «Сохранить» в вопросе правка не сохранилась');
  await ui.see('Тюльпаны');
});

scenario('Карточка: стёр текст блока — блок пропал, а без предпочтений — подсказка «Дополнить»', async ({ ui }) => {
  await ui.go('/friend/c');
  await ui.tap('Тюльпаны');
  await ui.see('Цветы');
  await ui.fill('Пионы, белые розы…', '   ');
  await ui.tap('Сохранить');
  await ui.see('Еда, цветы, подарки');
  await ui.see('Дополнить');
  await ui.waitData((x) => x.friends.find((f) => f.id === 'c').flowers === '', 'пустой блок не очистился');
});

scenario('Друг не найден: удалённый друг по старой ссылке', async ({ ui }) => {
  await ui.go('/friend/gone');
  await ui.see('Друг не найден');
});

// ===== Форма друга =====
scenario('Новый друг: дата тремя полями, телефон, важная дата — и он сразу в списке по дню рождения', async ({ ui, page }) => {
  await ui.go('/friends');
  await ui.tap('Добавить друга');
  await ui.fill('Например, Аня', 'Пётр Тестов');
  await ui.typeInto('ДД', '1506');
  assert.equal(await page.getByPlaceholder('ММ').first().inputValue(), '06', 'курсор не перешёл в месяц');
  await page.keyboard.type('1990');
  await ui.fill('+7…', '+375 29 111-00-11');
  await ui.fill('Любит суши, не ест острое…', 'Пицца');
  await ui.tap('Свадьба');
  await ui.see('Повторять каждый год');
  await ui.typeInto('ДД', '01092015'); // у новой важной даты поля пустые — заполняем
  await ui.tap('Сохранить');
  const data = await ui.waitData((x) => x.friends.some((f) => f.name === 'Пётр Тестов'), 'друг не сохранился');
  const f = data.friends.find((x) => x.name === 'Пётр Тестов');
  assert.equal(f.birthday, '1990-06-15');
  assert.equal(f.phone, '+375 29 111-00-11');
  assert.equal(f.food, 'Пицца');
  assert.deepEqual(f.dates.map((x) => [x.title, x.date]), [['Свадьба', '2015-09-01']]);
  await ui.tap('Скоро день рождения');
  await ui.see('Пётр Тестов');
  await ui.see('через 5 дней');
});

scenario('Новый друг: год рождения можно не указывать', async ({ ui }) => {
  await ui.go('/friends');
  await ui.tap('Добавить друга');
  await ui.fill('Например, Аня', 'Без Года');
  await ui.typeInto('ДД', '0109');
  await ui.tap('Сохранить');
  const data = await ui.waitData((x) => x.friends.some((f) => f.name === 'Без Года'), 'друг не сохранился');
  const f = data.friends.find((x) => x.name === 'Без Года');
  assert.match(f.birthday, /^1904-09-01$/, 'без года хранится с годом-меткой 1904');
});

scenario('Новый друг: без имени не сохраняется', async ({ ui }) => {
  await ui.go('/friends');
  await ui.tap('Добавить друга');
  await ui.tap('Сохранить');
  await ui.see('Новый друг');
  assert.equal((await ui.data()).friends.length, 3);
});

scenario('Новый друг: несуществующая дата рождения не сохраняется молча', async ({ ui }) => {
  await ui.go('/friends');
  await ui.tap('Добавить друга');
  await ui.fill('Например, Аня', 'Тест Даты');
  await ui.typeInto('ДД', '31021990');
  await ui.see('Такой даты нет');
  await ui.tap('Сохранить');
  await ui.pause(800);
  const saved = (await ui.data()).friends.find((f) => f.name === 'Тест Даты');
  assert.ok(!saved, `друг сохранён без даты: ${JSON.stringify(saved && saved.birthday)}`);
  await ui.see('Такой даты нет');
  assert.match(ui.dialogs.join('\n'), /Проверь даты/);
  // Поправили — сохраняется.
  await ui.typeInto('ДД', '28', { clear: true });
  await ui.tap('Сохранить');
  const data = await ui.waitData((x) => x.friends.some((f) => f.name === 'Тест Даты'), 'исправленная дата не сохранилась');
  assert.equal(data.friends.find((f) => f.name === 'Тест Даты').birthday, '1990-02-28');
});

scenario('Новый друг: недописанный год не сохраняется как «год неизвестен»', async ({ ui, page }) => {
  await ui.go('/friends');
  await ui.tap('Добавить друга');
  await ui.fill('Например, Аня', 'Тест Года');
  await ui.typeInto('ДД', '0109');
  await page.keyboard.type('19');
  await ui.tap('Сохранить');
  await ui.pause(800);
  assert.ok(!(await ui.data()).friends.some((f) => f.name === 'Тест Года'), 'сохранено с недописанным годом');
  await ui.see('Год — четыре цифры');
});

scenario('Важная дата впереди (свадьба через год) сохраняется; разовой дате без года — нужен год', async ({ ui }) => {
  await ui.go('/friend/edit?id=c');
  await ui.tap('Свадьба');
  await ui.typeInto('ДД', '14022027'); // часы стоят на июне 2026-го: это будущее
  await ui.notSee('Проверь год');
  await ui.tap('Сохранить');
  let data = await ui.waitData((x) => x.friends.find((f) => f.id === 'c').dates.length === 1, 'дата с годом впереди не сохранилась');
  assert.deepEqual(data.friends.find((f) => f.id === 'c').dates.map((d) => [d.title, d.date, d.yearly]), [['Свадьба', '2027-02-14', true]]);
  // Разовая дата без года никогда не наступит — просим год, а не сохраняем молча.
  await ui.go('/friend/edit?id=b');
  await ui.tap('Годовщина знакомства');
  await ui.typeInto('ДД', '0503');
  await ui.tap('Повторять каждый год');
  await ui.tap('Сохранить');
  await ui.see('Дата не повторяется — укажи год.');
  assert.equal((await ui.data()).friends.find((f) => f.id === 'b').dates.length, 0, 'сохранено без года');
  await ui.typeInto('Год', '2027');
  await ui.tap('Сохранить');
  data = await ui.waitData((x) => x.friends.find((f) => f.id === 'b').dates.length === 1, 'с годом должно сохраниться');
  assert.deepEqual(data.friends.find((f) => f.id === 'b').dates.map((d) => [d.date, d.yearly]), [['2027-03-05', false]]);
});

scenario('Новый друг: важная дата без числа не пропадает молча', async ({ ui }) => {
  await ui.go('/friends');
  await ui.tap('Добавить друга');
  await ui.fill('Например, Аня', 'Тест Свадьбы');
  await ui.tap('Свадьба');
  await ui.tap('Сохранить');
  await ui.pause(800);
  assert.ok(!(await ui.data()).friends.some((f) => f.name === 'Тест Свадьбы'), 'сохранено без даты свадьбы');
  await ui.see('Укажи дату');
  await ui.tap('Удалить дату');
  await ui.tap('Сохранить');
  const data = await ui.waitData((x) => x.friends.some((f) => f.name === 'Тест Свадьбы'), 'без пустой даты должно сохраниться');
  assert.deepEqual(data.friends.find((f) => f.name === 'Тест Свадьбы').dates, []);
});

scenario('Карточка друга без дня рождения подсказывает его добавить', async ({ ui }) => {
  await ui.go('/friends');
  await ui.tap('Дима');
  await ui.tap('Добавить день рождения');
  await ui.see('Редактировать');
  await ui.typeInto('ДД', '0503');
  await ui.tap('Сохранить');
  await ui.waitData((x) => x.friends.find((f) => f.id === 'nb').birthday === '1904-03-05', 'дата не сохранилась');
}, { data: seed({ friends: [ANYA, F({ id: 'nb', name: 'Дима' })] }) });

scenario('Друг: переименование, затем удаление вместе с его напоминаниями', async ({ ui }) => {
  await ui.go('/friends');
  await ui.tap('Аня Смирнова');
  await ui.tap('Изменить');
  await ui.fill('Например, Аня', 'Анна Смирнова');
  await ui.tap('Сохранить');
  await ui.see('Анна Смирнова');
  await ui.tap('Изменить');
  await ui.tap('Удалить друга');
  const data = await ui.waitData((x) => !x.friends.some((f) => f.id === 'a'), 'друг не удалился');
  assert.ok(!data.reminders.some((r) => r.friendId === 'a'), 'напоминания удалённого друга остались');
  assert.match(ui.dialogs.join('\n'), /Удалить «Анна Смирнова»\?/);
});

// ===== Соцсети =====
scenario('Соцсети: ссылка, ник с выбором сети, сайт, ошибка и дубликат', async ({ ui }) => {
  await ui.go('/friends');
  await ui.tap('Аня Смирнова');
  const field = 'instagram.com/… или @ник';
  await ui.tap('Добавить соцсеть');
  await ui.fill(field, 'https://www.youtube.com/@anyasings');
  await ui.see('Похоже на YouTube');
  await ui.tap('Добавить YouTube');
  await ui.waitData((x) => x.friends.find((f) => f.id === 'a').socials.some((s) => s.network === 'youtube'), 'YouTube не сохранился');
  await ui.tap('Добавить соцсеть');
  await ui.fill(field, '@anya.ig');
  await ui.see('Хороший ник');
  await ui.tap(/^Все сети/);
  await ui.fill('Найти сеть', 'жж');
  await ui.see('LiveJournal');
  await ui.fill('Найти сеть', 'инста');
  await ui.tap('Instagram');
  await ui.notSee('Помогите');
  await ui.tap('Добавить Instagram');
  const data = await ui.waitData((x) => x.friends.find((f) => f.id === 'a').socials.some((s) => s.network === 'instagram'), 'Instagram не сохранился');
  assert.equal(data.friends.find((f) => f.id === 'a').socials.find((s) => s.network === 'instagram').url, 'https://instagram.com/anya.ig');
  await ui.tap('Добавить соцсеть');
  await ui.fill(field, 'аня певица');
  await ui.see('Ник без пробелов или ссылка');
  await ui.fill(field, 'kattysings.ru/about');
  await ui.see('Такую сеть не узнаём');
  await ui.fill(field, 'https://www.tiktok.com/@anya');
  await ui.see('уже есть');
});

scenario('Соцсети: нажатие на чип открывает профиль по его ссылке', async ({ ui, page }) => {
  await ui.go('/friends');
  await ui.tap('Аня Смирнова');
  // В браузере нативного модуля нет: ссылка открывается обычным способом, в новой вкладке. На Android — сначала в приложении сети.
  // Внешний сайт не грузим: тесты не должны зависеть от сети, проверяем только адрес.
  await page.context().route(/tiktok\.com/, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: 'tiktok' }));
  const popup = page.waitForEvent('popup', { timeout: 5000 });
  await ui.tap('TikTok');
  const opened = await popup;
  await opened.waitForLoadState('commit').catch(() => {});
  assert.equal(opened.url(), 'https://www.tiktok.com/@anya');
});

scenario('Соцсети: убрать сеть в форме друга', async ({ ui }) => {
  await ui.go('/friends');
  await ui.tap('Аня Смирнова');
  await ui.tap('Изменить');
  await ui.tap('Убрать TikTok');
  await ui.tap('Сохранить');
  const data = await ui.waitData((x) => x.friends.find((f) => f.id === 'a').socials.length === 1, 'сеть не убралась');
  assert.deepEqual(data.friends.find((f) => f.id === 'a').socials.map((s) => s.network), ['site']);
});

// ===== Напоминания =====
scenario('Напоминание: шаблон, друг, срок в календаре и своё время, каждую неделю', async ({ ui }) => {
  await ui.go('/');
  await ui.tap('Новое напоминание');
  await ui.tap('Оплатить счета');
  // «Для кого» раскрывается на месте; выбрал друга — шаблоны стали «для друга».
  await ui.tap('Для кого');
  await ui.tap('Игорь Ветров');
  await ui.tap('Позвонить');
  await ui.pickDate('2026-06-20');
  await ui.pickTime('09:30');
  await ui.tap('Повторять');
  await ui.tap('Каждую неделю');
  await ui.tap('Сохранить');
  const data = await ui.waitData((x) => x.reminders.some((r) => r.title === 'Позвонить — Игорь Ветров'), 'не сохранилось');
  const r = data.reminders.find((x) => x.title === 'Позвонить — Игорь Ветров');
  assert.deepEqual([r.date, r.time, r.friendId], ['2026-06-20', '09:30', 'b']);
  assert.deepEqual(r.repeat, { every: 1, unit: 'week' });
  await ui.see('каждую неделю');
});

scenario('Напоминание: свой интервал и «за 3 дня»', async ({ ui }) => {
  await ui.go('/');
  await ui.tap('Новое напоминание');
  await ui.fill('Например, сдать отчёт', 'Сдать проект');
  await ui.tap('За 3 дня');
  await ui.tap('Повторять');
  await ui.tap('Свой…');
  await ui.tap('недели');
  await ui.tap('Сохранить');
  const data = await ui.waitData((x) => x.reminders.some((r) => r.title === 'Сдать проект'), 'не сохранилось');
  const r = data.reminders.find((x) => x.title === 'Сдать проект');
  // «Заранее» теперь есть и у повторяющихся — оно записано списком.
  assert.deepEqual([r.advance, r.advances], [0, [4320]]);
  assert.deepEqual(r.repeat, { every: 3, unit: 'week' });
  await ui.see('каждые 3 недели');
});

scenario('Напоминание: «каждые N» — стёр число и набрал новое: получается оно, а не «15»', async ({ ui, page }) => {
  await ui.go('/');
  await ui.tap('Новое напоминание');
  await ui.fill('Например, сдать отчёт', 'Полить цветы');
  await ui.tap('Повторять');
  await ui.tap('Свой…');
  const every = page.getByLabel('Каждые сколько');
  await every.click();
  // Курсор — в конец: число стоит по центру поля, и нажатие мышью может поставить курсор перед цифрой.
  await page.keyboard.press('End');
  await page.keyboard.press('Backspace');
  assert.equal(await every.inputValue(), '', 'пустое поле не должно само превращаться в единицу');
  await page.keyboard.type('5');
  assert.equal(await every.inputValue(), '5');
  await ui.tap('Сохранить');
  const data = await ui.waitData((x) => x.reminders.some((r) => r.title === 'Полить цветы'), 'не сохранилось');
  assert.deepEqual(data.reminders.find((r) => r.title === 'Полить цветы').repeat, { every: 5, unit: 'day' });
});

scenario('Напоминание: «каждый день до срока» — подпись в форме и в списке; «за день» и повтор его снимают', async ({ ui }) => {
  await ui.go('/');
  await ui.tap('Новое напоминание');
  await ui.fill('Например, сдать отчёт', 'Билеты на самолёт');
  await ui.pickDate('2026-06-20');
  await ui.pickTime('12:00');
  await ui.tap('Каждый день до срока');
  await ui.see('Напомню каждый день в 12:00 до сб, 20 июн — пока не отметишь «Сделано».');
  await ui.tap('Сохранить');
  let data = await ui.waitData((x) => x.reminders.some((r) => r.title === 'Билеты на самолёт'), 'не сохранилось');
  let r = data.reminders.find((x) => x.title === 'Билеты на самолёт');
  assert.deepEqual([r.date, r.time, r.repeat, r.advance, r.daily], ['2026-06-20', '12:00', null, 0, true]);
  // Строка: «до срока», дата справа, звенящий колокольчик — «каждый день».
  await ui.see('до срока');
  await ui.see('сб, 20 июн');
  await ui.see('Напоминаю каждый день', { label: true });
  // «За день» вместо ежедневных — флаг снимается.
  // Готовое дело открывается строками: «Напомнить» правится в шторке.
  await ui.tap('Билеты на самолёт');
  await ui.see('Напомнить: в 12:00 · каждый день', { label: true });
  await ui.tap('Напомнить');
  await ui.tap('За день');
  await ui.tap('Готово');
  await ui.notSee('пока не отметишь «Сделано»');
  await ui.see('Напомнить: в 12:00 · за день', { label: true });
  await ui.tap('Сохранить');
  data = await ui.waitData((x) => x.reminders.find((y) => y.id === r.id).advance === 1440, '«за день» не сохранилось');
  assert.ok(!('daily' in data.reminders.find((y) => y.id === r.id)), 'флаг остался');
  // Снова ежедневно, но потом «Повторять» → «Каждый день»: у повторяющегося своего «до срока» нет.
  await ui.tap('Билеты на самолёт');
  await ui.tap('Напомнить');
  await ui.tap('Каждый день до срока');
  await ui.tap('Готово');
  await ui.tap('Повторять');
  await ui.tap('Повтор');
  await ui.tap('Каждый день');
  await ui.tap('Готово');
  await ui.notSee('пока не отметишь «Сделано»');
  await ui.see('Повтор: каждый день', { label: true });
  await ui.tap('Сохранить');
  data = await ui.waitData((x) => !!x.reminders.find((y) => y.id === r.id).repeat, 'повтор не сохранился');
  r = data.reminders.find((y) => y.id === r.id);
  assert.deepEqual([r.repeat, 'daily' in r], [{ every: 1, unit: 'day' }, false]);
});

scenario('Напоминания: разделы по сроку, при одинаковом сроке важное выше; детали значками (не задано — не видно), кольцо-фитиль; «Быстрые» и «Важные»', async ({ ui, page }) => {
  await ui.go('/');
  await ui.see('Продлить страховку');
  for (const t of ['Сегодня', 'На неделе', 'В течение месяца', 'Позже']) await ui.see(t);
  const order = ['Оплатить интернет', 'Стоматолог', 'Билеты на самолёт', 'Купить косметику', 'Сдать проект', 'Подарок Ане', 'Продлить страховку'];
  const ys = [];
  for (const t of order) ys.push((await ui.box(t)).y);
  assert.deepEqual([...ys].sort((a, b) => a - b), ys, `порядок: ${order.map((t, i) => `${t} ${Math.round(ys[i])}`).join(', ')}`);
  await ui.see('просрочено');
  await ui.see('в 15:00');
  await ui.see('Сколько займёт: 30 мин', { label: true });
  await ui.see('Важность: Важно', { label: true });
  await ui.see('Важность: Низкая', { label: true });
  // Не задано — значка нет, прочерков тоже.
  await ui.notSee('не задано', { label: true });
  // В кольце — сколько осталось: «сег.» у сегодняшних, «!» у просроченного, «2 дня», «60 дней».
  await ui.see('Просрочено', { label: true });
  await ui.see('Осталось 2 дня', { label: true });
  await ui.see('Осталось 60 дней', { label: true });
  assert.equal(await page.locator('[data-testid="fuse"]').count(), 6, 'фитиль у всех, кроме догоревшего просроченного');
  await ui.tap('Быстрые');
  await ui.see('Оплатить интернет'); await ui.see('Билеты на самолёт');
  await ui.notSee('Стоматолог'); await ui.notSee('Сдать проект');
  await ui.tap('Важные');
  await ui.see('Оплатить интернет'); await ui.see('Билеты на самолёт');
  await ui.notSee('Купить косметику'); await ui.notSee('Подарок Ане');
}, {
  data: seed({
    reminders: [
      R({ id: 'g', title: 'Продлить страховку', date: d(60) }),
      R({ id: 'f', title: 'Подарок Ане', date: d(20) }),
      R({ id: 'e', title: 'Сдать проект', date: d(5), minutes: 120, priority: 2 }),
      R({ id: 'd', title: 'Купить косметику', date: d(2), priority: 1 }),
      R({ id: 'c', title: 'Билеты на самолёт', date: d(2), priority: 3, minutes: 30 }),
      R({ id: 'b', title: 'Стоматолог', kind: 'at', date: d(0), time: '15:00', minutes: 60 }),
      R({ id: 'a', title: 'Оплатить интернет', date: d(-1), priority: 3, minutes: 5 }),
    ],
  }),
});

scenario('Напоминание: «Дата и время», важность и «Сколько займёт» — сохраняются и видны в строке', async ({ ui }) => {
  await ui.go('/');
  await ui.tap('Новое напоминание');
  await ui.fill('Например, сдать отчёт', 'Стоматолог');
  await ui.tap('Дата и время');
  await ui.pickDate('2026-06-20');
  await ui.pickTime('15:00');
  // У встречи «заранее» по умолчанию — за день; его можно поменять, как и у остальных дел.
  await ui.see('Напомню пт, 19 июн и сб, 20 июн в 15:00.');
  await ui.see('Заранее');
  // Детали раскрываются на месте: выбрал — строка закрылась и показывает значение.
  await ui.tap('Важность');
  await ui.tap('Важно');
  await ui.see('Важность: Важно', { label: true });
  await ui.tap('Сколько займёт');
  await ui.tap('1 ч');
  await ui.see('Сколько займёт: 1 ч', { label: true });
  await ui.tap('Сохранить');
  const data = await ui.waitData((x) => x.reminders.some((r) => r.title === 'Стоматолог'), 'не сохранилось');
  const r = data.reminders.find((x) => x.title === 'Стоматолог');
  assert.deepEqual([r.kind, r.date, r.time, r.priority, r.minutes, r.advance, r.repeat], ['at', '2026-06-20', '15:00', 3, 60, 0, null]);
  await ui.see('в 15:00');
  await ui.see('сб, 20 июн');
  await ui.see('Важность: Важно', { label: true });
  await ui.see('Сколько займёт: 1 ч', { label: true });
});

scenario('Напоминание: без текста не сохраняется', async ({ ui }) => {
  await ui.go('/');
  await ui.tap('Новое напоминание');
  await ui.tap('Сохранить');
  await ui.see('Новое напоминание');
  assert.equal((await ui.data()).reminders.length, 3);
});

scenario('Напоминание: без названия — подсказка у поля; дальний срок — календарь в строке; своё время — через часы', async ({ ui }) => {
  await ui.go('/');
  await ui.tap('Новое напоминание');
  // Без названия не сохраняем и не спрашиваем окном — подсказка прямо у поля.
  await ui.tap('Сохранить');
  await ui.see('Напиши, что нужно сделать.');
  assert.equal(ui.dialogs.length, 0, 'окна с вопросом быть не должно');
  await ui.fill('Например, сдать отчёт', 'Продлить страховку');
  await ui.notSee('Напиши, что нужно сделать.');
  // Новое дело: завтра в 10:00, важность и «сколько займёт» не заданы.
  await ui.see('Напомню завтра в 10:00.');
  await ui.see('Важность: Не задана', { label: true });
  await ui.see('Сколько займёт: Не задано', { label: true });
  // Срок дальше недели: календарь раскрывается в строке, листается по месяцам и закрывается после выбора.
  await ui.tap('Открыть календарь');
  await ui.see('Июнь 2026');
  await ui.tap('Следующий месяц');
  await ui.see('Июль 2026');
  await ui.tap('Среда, 15 июля');
  await ui.notSee('Июль 2026');
  await ui.see('ср, 15 июл');
  // Своего времени в ленте нет — выбираем на часах; оно появляется в ленте выбранным.
  await ui.pickTime('07:45');
  await ui.see('Напомню ср, 15 июл в 7:45.');
  await ui.tap('Сохранить');
  const data = await ui.waitData((x) => x.reminders.some((r) => r.title === 'Продлить страховку'), 'не сохранилось');
  const r = data.reminders.find((x) => x.title === 'Продлить страховку');
  assert.deepEqual([r.date, r.time, r.advance, 'priority' in r, 'minutes' in r], ['2026-07-15', '07:45', 0, false, false], JSON.stringify(r));
});

scenario('Форма «строками»: готовое дело правится в шторках; новое дело по умолчанию — тоже строками, в настройках можно выбрать быструю', async ({ ui }) => {
  await ui.go('/');
  // Готовое дело — строки со значениями; лент и календаря в строке нет.
  await ui.tap('Написать Диме');
  await ui.see('Срок: вчера', { label: true });
  await ui.see('Напомнить: в 20:00 · за день', { label: true });
  assert.equal(await ui.quickForm(), false, 'готовое дело должно открываться строками');
  // Нажал на строку — шторка; выбрал — закрылась, значение в строке.
  await ui.tap('Срок');
  await ui.tap('Завтра');
  await ui.see('Срок: завтра', { label: true });
  await ui.tap('Важность');
  await ui.tap('Важно');
  await ui.see('Важность: Важно', { label: true });
  await ui.tap('Заметка');
  await ui.fill('Детали, ссылка, адрес…', 'Про отпуск');
  await ui.tap('Готово');
  await ui.see('Заметка: Про отпуск', { label: true });
  // Шторка закрывается и свайпом вниз.
  await ui.tap('Сколько займёт');
  await ui.see('Не задано');
  await ui.swipeDown('Сколько займёт', 220);
  await ui.notSee('15 мин');
  await ui.tap('Сохранить');
  let data = await ui.waitData((x) => x.reminders.find((r) => r.id === 'r3').priority === 3, 'правка не сохранилась');
  const r3 = data.reminders.find((r) => r.id === 'r3');
  assert.deepEqual([r3.date, r3.note, r3.time, r3.advance], [d(1), 'Про отпуск', '20:00', 1440]);
  // Новое дело по умолчанию — тоже строками.
  await ui.tap('Новое напоминание');
  assert.equal(await ui.quickForm(), false, 'новое дело по умолчанию — строками');
  await ui.fill('Например, сдать отчёт', 'Купить билеты');
  await ui.see('Срок: завтра', { label: true });
  await ui.pickTime('19:00');
  // «Заранее» — несколько сразу: за час и за день.
  await ui.tap('Напомнить');
  await ui.tap('За час');
  await ui.see('Напомню завтра в 18:00 и в 19:00.');
  await ui.tap('За день');
  await ui.see('Напомню сегодня в 19:00, завтра в 18:00 и в 19:00.');
  await ui.tap('Готово');
  await ui.see('Напомнить: в 19:00 · за день и за час', { label: true });
  await ui.tap('Сохранить');
  data = await ui.waitData((x) => x.reminders.some((r) => r.title === 'Купить билеты'), 'новое дело не сохранилось');
  const r = data.reminders.find((x) => x.title === 'Купить билеты');
  assert.deepEqual([r.date, r.time, r.advance, r.advances, 'priority' in r], [d(1), '19:00', 0, [60, 1440], false]);
  // В настройках выбираем «Быстрая» — новое дело открывается лентами; готовое — по-прежнему строками.
  await ui.go('/settings');
  await ui.see('Форма нового дела');
  await ui.tap('Быстрая');
  await ui.waitData((x) => x.settings.newReminderForm === 'quick', 'выбор формы не сохранился');
  await ui.go('/');
  await ui.tap('Новое напоминание');
  assert.equal(await ui.quickForm(), true, 'после выбора в настройках новое дело — быстрой формой');
  await ui.go('/');
  await ui.tap('Купить билеты');
  assert.equal(await ui.quickForm(), false, 'готовое дело — всегда строками');
  // И обратно.
  await ui.go('/settings');
  await ui.tap('Строками');
  await ui.waitData((x) => x.settings.newReminderForm === 'rows', 'обратный выбор не сохранился');
}, { data: seed({ settings: { newReminderForm: undefined } }) });

scenario('Повтор с прошедшего дня (быстрая форма): сначала день, потом «Каждый год» — годовщина встаёт на следующий год, а не «просрочено»', async ({ ui }) => {
  await ui.go('/');
  await ui.tap('Новое напоминание');
  await ui.fill('Например, сдать отчёт', 'Годовщина знакомства');
  await ui.pickDate('2026-05-18');
  await ui.tap('Повторять');
  // Серия идёт от выбранного дня, какой бы повтор ни стоял: у «каждую неделю» ближайший раз — понедельник.
  await ui.see('Каждую неделю в 10:00. Ближайший раз — пн, 15 июн.');
  await ui.tap('Каждый год');
  await ui.see('Каждый год в 10:00. Ближайший раз — вт, 18 мая 2027.');
  await ui.tap('Сохранить');
  const data = await ui.waitData((x) => x.reminders.some((r) => r.title === 'Годовщина знакомства'), 'не сохранилось');
  const r = data.reminders.find((x) => x.title === 'Годовщина знакомства');
  assert.deepEqual([r.date, r.anchor, r.repeat, r.done], ['2027-05-18', '2026-05-18', { every: 1, unit: 'year' }, false]);
  await ui.see('Годовщина знакомства');
  await ui.notSee('просрочено');
}, { data: seed({ reminders: [] }) });

scenario('Повтор с прошедшего дня (форма строками): «Каждый год», потом прошедший день — в строке сразу следующий год', async ({ ui }) => {
  await ui.go('/');
  await ui.tap('Новое напоминание');
  await ui.fill('Например, сдать отчёт', 'Годовщина знакомства');
  await ui.tap('Повторять');
  await ui.tap('Повтор');
  await ui.tap('Каждый год');
  await ui.tap('Готово');
  await ui.pickDate('2026-05-18');
  await ui.see('Ближайший раз: вт, 18 мая 2027', { label: true });
  await ui.tap('Сохранить');
  const data = await ui.waitData((x) => x.reminders.some((r) => r.title === 'Годовщина знакомства'), 'не сохранилось');
  const r = data.reminders.find((x) => x.title === 'Годовщина знакомства');
  assert.deepEqual([r.date, r.anchor], ['2027-05-18', '2026-05-18']);
  await ui.notSee('просрочено');
}, { data: seed({ settings: { newReminderForm: undefined }, reminders: [] }) });

scenario('Повтор, уже сохранённый с прошедшим днём (старая форма), сам встаёт на ближайший раз; пропущенное по-настоящему — остаётся', async ({ ui }) => {
  await ui.go('/');
  await ui.see('Годовщина знакомства');
  const data = await ui.waitData((x) => x.reminders.find((r) => r.id === 'y').date === '2027-05-18', 'дело не переехало на ближайший раз');
  assert.equal(data.reminders.find((r) => r.id === 'y').anchor, '2026-05-18');
  assert.equal(data.reminders.find((r) => r.id === 'm').date, d(-3), 'пропущенный срок никуда не делся');
  await ui.see('Полить цветы');
  await ui.see('просрочено');
}, { data: seed({ reminders: [
  R({ id: 'y', title: 'Годовщина знакомства', date: '2026-05-18', repeat: { every: 1, unit: 'year' }, createdAt: Date.UTC(2026, 5, 10, 9) }),
  R({ id: 'm', title: 'Полить цветы', date: d(-3), repeat: { every: 1, unit: 'week' }, createdAt: Date.UTC(2026, 5, 1, 9) }),
] }) });

scenario('Повтор по дням недели и несколько «заранее»: тренировка по пн, ср и пт, напомнить за день и за 2 часа', async ({ ui }) => {
  await ui.go('/');
  await ui.tap('Новое напоминание');
  await ui.fill('Например, сдать отчёт', 'Тренировка');
  await ui.tap('Повторять');
  // «По дням» начинает с дня недели уже выбранной даты (завтра — четверг).
  await ui.tap('По дням');
  await ui.see('По чт в 10:00. Ближайший раз — завтра.');
  await ui.tap('Понедельник');
  await ui.tap('Среда');
  await ui.tap('Пятница');
  await ui.tap('Четверг');
  // Четверг сняли — ближайший раз переехал на пятницу.
  await ui.see('По пн, ср и пт в 10:00. Ближайший раз — пт, 12 июн.');
  await ui.pickTime('19:00');
  await ui.tap('За день');
  await ui.tap('За 2 часа');
  await ui.see('По пн, ср и пт в 19:00, заранее — за день и за 2 часа. Ближайший раз — пт, 12 июн.');
  await ui.tap('Сохранить');
  const data = await ui.waitData((x) => x.reminders.some((r) => r.title === 'Тренировка'), 'не сохранилось');
  const r = data.reminders.find((x) => x.title === 'Тренировка');
  assert.deepEqual([r.repeat, r.date, r.time, r.advances], [{ every: 1, unit: 'week', days: [1, 3, 5] }, '2026-06-12', '19:00', [120, 1440]]);
  // В списке — «по пн, ср и пт»; в форме строками — то же самое.
  await ui.see('по пн, ср и пт в 19:00');
  await ui.tap('Тренировка');
  await ui.see('Повтор: по пн, ср и пт', { label: true });
  await ui.see('Время: 19:00 · за день и за 2 часа', { label: true });
  // Дни правятся в шторке «Повтор»: добавили воскресенье.
  await ui.tap('Повтор');
  await ui.tap('Воскресенье');
  await ui.tap('Готово');
  await ui.see('Повтор: по пн, ср, пт и вс', { label: true });
  await ui.tap('Сохранить');
  await ui.waitData((x) => x.reminders.find((y) => y.id === r.id).repeat.days.join() === '1,3,5,7', 'дни не сохранились');
});

scenario('Умные подсказки: частое время — в ленте и выбрано сразу; свой шаблон подставляет время, «заранее» и друга', async ({ ui }) => {
  await ui.go('/');
  await ui.tap('Новое напоминание');
  // Дела «до срока» чаще всего стоят на 21:30 — оно в ленте с пометкой и уже выбрано.
  await ui.see('21:30, как обычно', { label: true });
  await ui.see('Напомню завтра в 21:30.');
  // «Позвонить маме» заводили дважды — это свой шаблон: одно нажатие ставит всё привычное.
  await ui.tap('Позвонить маме, как обычно');
  await ui.see('Напомню завтра в 18:00 и в 19:00.');
  await ui.see('Для кого: Мама', { label: true });
  await ui.tap('Сохранить');
  const data = await ui.waitData((x) => x.reminders.filter((r) => r.title === 'Позвонить маме').length === 3, 'не сохранилось');
  const r = data.reminders.find((x) => x.title === 'Позвонить маме' && !['h1', 'h2'].includes(x.id));
  assert.deepEqual([r.time, r.advance, r.friendId, r.date], ['19:00', 60, 'c', d(1)]);
}, {
  data: seed({
    reminders: [
      R({ id: 'h1', title: 'Позвонить маме', friendId: 'c', date: d(-3), time: '19:00', advance: 60, done: true, createdAt: NOW.getTime() - 4 * 86400000 }),
      R({ id: 'h2', title: 'Позвонить маме', friendId: 'c', date: d(-9), time: '19:00', advance: 60, done: true, createdAt: NOW.getTime() - 10 * 86400000 }),
      R({ id: 'h3', title: 'Полить цветы', date: d(2), time: '21:30', createdAt: NOW.getTime() - 1 * 86400000 }),
      R({ id: 'h4', title: 'Вынести мусор', date: d(1), time: '21:30', createdAt: NOW.getTime() - 2 * 86400000 }),
      R({ id: 'h5', title: 'Разобрать почту', date: d(1), time: '21:30', createdAt: NOW.getTime() - 3 * 86400000 }),
    ],
  }),
});

scenario('Напоминания: фильтры, выбор нескольких — сделать, вернуть и удалить', async ({ ui }) => {
  await ui.go('/');
  await ui.tap('Сделанные'); await ui.see('Сдать отчёт'); await ui.notSee('Написать Диме');
  await ui.tap('Для себя'); await ui.see('Написать Диме'); await ui.notSee('Купить цветы — Аня');
  await ui.tap('Друзья', { nth: 'first' }); await ui.see('Купить цветы — Аня'); await ui.notSee('Написать Диме');
  await ui.tap('Все'); await ui.see('Сегодня'); await ui.notSee('Сдать отчёт'); // сделанное раньше — только в «Сделанных»
  const before = await ui.box('Написать Диме');
  await ui.longPress('Написать Диме');
  await ui.see('Выбрано: 1', { label: true });
  assert.ok(Math.abs((await ui.box('Написать Диме')).y - before.y) < 2, 'список прыгнул при входе в выбор');
  await ui.tap('Отметить сделанными');
  await ui.waitData((x) => x.reminders.find((r) => r.id === 'r3').done, 'не отмечено');
  await ui.see('Сделано сегодня');
  await ui.longPress('Купить цветы — Аня');
  await ui.tap('Отметить сделанными');
  await ui.waitData((x) => x.reminders.find((r) => r.id === 'r1').done && x.reminders.find((r) => r.id === 'r1').date === d(0), 'повторяющееся должно отметиться, дата та же');
  await ui.tap('Сделанные');
  await ui.longPress('Сдать отчёт');
  await ui.tap('Вернуть в активные');
  await ui.waitData((x) => !x.reminders.find((r) => r.id === 'r4').done, 'не вернулось');
  await ui.tap('Все');
  await ui.longPress('Написать Диме');
  await ui.tap('Удалить выбранные');
  await ui.waitData((x) => !x.reminders.some((r) => r.id === 'r3'), 'не удалилось');
});

scenario('Напоминание: удаление из формы с подтверждением', async ({ ui }) => {
  await ui.go('/');
  await ui.tap('Написать Диме');
  await ui.see('Напоминание');
  await ui.tap('Удалить');
  await ui.waitData((x) => !x.reminders.some((r) => r.id === 'r3'), 'не удалилось');
  assert.match(ui.dialogs.join('\n'), /Удалить напоминание/);
});

scenario('Напоминание по старой ссылке после удаления — «не найдено», а не пустая форма', async ({ ui }) => {
  await ui.go('/');
  await ui.go('/reminder/edit?id=gone');
  await ui.see('Напоминание не найдено');
  await ui.notSee('Новое напоминание');
  await ui.tap('К напоминаниям');
  await ui.see('Написать Диме');
});

scenario('Напоминание: выбор друга через окно с поиском, когда друзей много', async ({ ui }) => {
  await ui.go('/');
  await ui.tap('Новое напоминание');
  await ui.fill('Например, сдать отчёт', 'Поздравить');
  // Друзей больше, чем кружков: «Найти» открывает окно с поиском.
  await ui.tap('Для кого');
  await ui.tap('Найти друга');
  await ui.fill('Имя', 'дим');
  await ui.see('Дима Петров');
  await ui.notSee('Алина');
  await ui.tap('Дима Петров');
  await ui.see('Для кого: Дима Петров', { label: true });
  await ui.tap('Сохранить');
  const data = await ui.waitData((x) => x.reminders.some((r) => r.title === 'Поздравить'), 'не сохранилось');
  assert.equal(data.reminders.find((r) => r.title === 'Поздравить').friendId, 'm0');
}, { data: seed({ friends: [ANYA, IGOR, MAMA, ...MORE_FRIENDS] }) });

// ===== Импорт =====
scenario('Импорт: дубликат не выбирается, добавляются 7, повторный импорт не плодит дублей', async ({ ui }) => {
  await ui.go('/friends');
  await ui.tap('Импорт друзей');
  for (const s of ['Это пример', 'Все · 8', 'С днём рождения · 5', 'Уже есть: Аня Смирнова']) await ui.see(s);
  await ui.tap('Выбрать все');
  await ui.see('Выбрано 7 из 8');
  await ui.tap(/^Добавить 7/);
  const data = await ui.waitData((x) => x.friends.length === 10, 'друзья не добавились');
  const dima = data.friends.find((f) => f.name === 'Дима Петров');
  assert.ok(dima && dima.birthday === '1993-12-30' && dima.dates.length === 1, 'даты из контактов не перенесены');
  const serg = data.friends.find((f) => f.name === 'Серёжа Волков');
  assert.ok(serg && serg.telegramId === 444 && serg.viber === '79253334455', 'мессенджеры не перенесены');
  const katya = data.friends.find((f) => f.name === 'Катя Орлова');
  assert.equal(katya.socials[0].network, 'instagram', 'сайт из контактов должен стать соцсетью');
  await ui.tap('Импорт друзей');
  await ui.see('Уже есть: Дима Петров');
  await ui.see('Отметь, кого добавить');
  await ui.notSee('Выбрать все');
  assert.equal((await ui.data()).friends.length, 10);
});

scenario('Импорт: заметка контакта встаёт в очередь к магии (соцсети и подсказки) и сама не меняется', async ({ ui }) => {
  await ui.go('/friends');
  await ui.tap('Импорт друзей');
  await ui.tap('Выбрать все');
  await ui.tap(/^Добавить 7/);
  const note = 'Любит рыбалку. inst: boris.kim';
  let data = await ui.waitData((x) => x.friends.length === 10, 'друзья не добавились');
  const boris = () => data.friends.find((f) => f.name === 'Борис Ким');
  assert.equal(boris().notes, note);
  assert.equal(boris().notesQueue, true, 'заметку из контактов должна прочитать магия — сама, после импорта');
  assert.equal(data.friends.find((f) => f.name === 'Дима Петров').notesQueue, undefined, 'без заметки читать нечего');
  // Магии в этой сборке нет: разбор не вышел — заметка ждёт следующего раза и остаётся слово в слово.
  await ui.pause(4500);
  data = await ui.data();
  assert.equal(boris().notes, note, 'заметку не трогаем');
  assert.equal(boris().notesQueue, true);
});

scenario('Импорт: число на кнопке согласовано — «Добавить 2 друзей», «Добавить 1 друга»', async ({ ui }) => {
  await ui.go('/friends');
  await ui.tap('Импорт друзей');
  await ui.tap('Выбрать все');
  await ui.tap('Снять все');
  await ui.tap('Алина Смирнова');
  await ui.tap('Борис Ким');
  await ui.see('Добавить 2 друзей'); // «добавить двух друзей»
  await ui.tap('Борис Ким');
  await ui.see('Добавить 1 друга');
});

// ===== Настройки =====
scenario('Оформление: тёмная тема и свои цвета применяются ко всему приложению', async ({ ui, page }) => {
  await ui.go('/settings');
  await ui.see('Тема и цвет');
  await ui.tap('Тема и цвет');
  await ui.see('Цвет тёмной темы');
  assert.equal(await page.getByLabel('Предпросмотр светлой темы').getAttribute('aria-selected'), 'true');
  await ui.tap('Тёмная');
  await ui.waitData((x) => x.settings.theme === 'dark', 'тема не сохранилась');
  await page.getByLabel('Слива').last().click();
  await ui.waitData((x) => x.settings.accentDark === 'plum', 'цвет не сохранился');
  await page.getByLabel('Индиго').first().click();
  await ui.waitData((x) => x.settings.accentLight === 'indigo', 'цвет светлой не сохранился');
  assert.equal(await page.getByLabel('Предпросмотр светлой темы').getAttribute('aria-selected'), 'true', 'цвет светлой темы переключает предпросмотр');
  await ui.go('/');
  const bg = await page.getByLabel('Новое напоминание').evaluate((el) => getComputedStyle(el).backgroundColor);
  assert.equal(bg, 'rgb(184, 138, 181)', 'кнопка должна стать «сливой» тёмной темы');
});

scenario('Настройки: время уведомлений и «за день» сохраняются', async ({ ui, page }) => {
  await ui.go('/settings');
  await ui.typeInto('ЧЧ:ММ', '0845', { clear: true });
  await ui.waitData((x) => x.settings.eventTime === '08:45', 'время не сохранилось');
  await page.getByRole('switch').first().click();
  await ui.waitData((x) => x.settings.eventDayBefore === false, '«за день» не выключилось');
});

scenario('Настройки: отчёты о сбоях включены по умолчанию и выключаются', async ({ ui, page }) => {
  await ui.go('/settings');
  await ui.see('Отправлять отчёты о сбоях');
  await page.getByRole('switch').last().click();
  await ui.waitData((x) => x.settings.crashReports === false, 'переключатель не сработал');
});

scenario('Календарь: выгрузка всех дат в файл .ics', async ({ ui, page }) => {
  await ui.go('/settings');
  await ui.see('Календарь');
  // Свой календарь телефона есть только в Android-приложении: в браузере переключателя нет.
  await ui.notSee('Дни рождения в календаре');
  const download = page.waitForEvent('download', { timeout: 5000 });
  await ui.tap('Выгрузить даты');
  const file = await download;
  assert.equal(file.suggestedFilename(), 'druzya-dni-rozhdeniya.ics');
  const text = require('fs').readFileSync(await file.path(), 'utf8');
  for (const s of ['BEGIN:VCALENDAR', 'SUMMARY:🎂 Аня Смирнова', 'SUMMARY:♥ Познакомились · Аня Смирнова', 'RRULE:FREQ=YEARLY', 'SUMMARY:🎂 Мама']) assert.ok(text.includes(s), `в файле нет «${s}»`);
});

scenario('Календарь: без дат выгружать нечего', async ({ ui }) => {
  await ui.go('/settings');
  await ui.tap('Выгрузить даты');
  await ui.pause(400);
  assert.match(ui.dialogs.join('\n'), /Пока нечего выгружать/);
}, { data: seed({ friends: [F({ id: 'x', name: 'Маша' })], reminders: [] }) });

// ===== Пол друзей =====
// Определяется сам при запуске, без вопросов; Genderize и облачные ИИ по умолчанию «без интернета» (см. run), сценарий подставляет ответ.
const GENDER_FRIENDS = [ANYA, IGOR, MAMA, F({ id: 's', name: 'Саша' }), F({ id: 'k', name: 'Алуашка', phone: '+7 707 606 39 03' })];
const genderOf = (f) => [f.id, f.gender ?? null, f.genderBy ?? null, f.genderStage ?? null];

/** Подставной Genderize: уверенно знает только имена из known, остальных — «не знаю»; запросы записываются. */
async function genderizeStub(page, known = {}) {
  const asked = [];
  await page.context().route(/api\.genderize\.io/, (route) => {
    const url = new URL(route.request().url());
    const names = url.searchParams.getAll('name[]');
    asked.push({ names, country: url.searchParams.get('country_id'), raw: decodeURIComponent(url.href) });
    const body = names.map((name) => (known[name] ? { name, gender: known[name], probability: 0.98, count: 300 } : { name, gender: null, probability: 0, count: 0 }));
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  });
  return asked;
}

scenario('Пол сам при запуске: своя база, в Genderize — только имя и страна, второй раз не спрашиваем', async ({ ui, page }) => {
  const asked = await genderizeStub(page, { 'Алуашка': 'female' });
  await ui.go('/');
  const data = await ui.waitData((x) => x.friends.find((f) => f.id === 'k').gender === 'f', 'Genderize не помог');
  assert.deepEqual(data.friends.map(genderOf), [
    ['a', 'f', 'names', null],
    ['b', 'm', 'names', null],
    ['c', 'f', 'names', null],
    ['s', null, null, 'ai'], // Саша бывает у обоих — сразу «загадка», наружу не уходит
    ['k', 'f', 'genderize', null],
  ]);
  assert.deepEqual(asked.map((a) => [a.country, a.names]).sort(), [['KZ', ['Алуашка']]]);
  assert.ok(!asked.some((a) => /Смирнова|Ветров|707|606|999/.test(a.raw)), 'ни фамилий, ни номеров');
  // Перезапуск: всех уже спросили — запросов нет, ничего не поменялось.
  await page.reload();
  await ui.pause(4000);
  assert.equal(asked.length, 1, 'никого не переспросили');
  assert.deepEqual((await ui.data()).friends.map(genderOf), data.friends.map(genderOf));
  // Пол нигде не показывается, кроме формы друга: в настройках его нет.
  await ui.go('/settings');
  await ui.notSee('Пол друзей');
}, { data: seed({ friends: GENDER_FRIENDS }) });

scenario('Пол без интернета: своя база сразу, остальных никто не отмечает — спросим, когда сеть будет', async ({ ui, page }) => {
  await ui.go('/');
  await ui.waitData((x) => x.friends.find((f) => f.id === 'a').gender === 'f', 'своя база не сработала');
  await ui.pause(1500);
  assert.deepEqual((await ui.data()).friends.map(genderOf).slice(3), [['s', null, null, 'ai'], ['k', null, null, 'names']]);
  // Сеть появилась — при следующем открытии спрашиваем (Сашу — нет: имя бывает у обоих).
  const asked = await genderizeStub(page, { 'Алуашка': 'female' });
  await page.reload();
  await ui.waitData((x) => x.friends.find((f) => f.id === 'k').genderBy === 'genderize', 'при следующем запуске не спросили');
  assert.equal(asked.length, 1);
}, { data: seed({ friends: GENDER_FRIENDS }) });

scenario('Пол в форме: угаданное — без подписи, сомнительное — «подскажешь?»; ручной выбор главнее, и после переименования', async ({ ui }) => {
  await ui.go('/friend/edit?id=k');
  await ui.notSee('подскажешь');
  await ui.go('/friend/edit?id=s');
  await ui.see('подскажешь?');
  await ui.tap('Мужчина');
  await ui.notSee('подскажешь');
  await ui.fill('Например, Аня', 'Саша Иванова'); // фамилия «женская», но пол выбран вручную
  await ui.notSee('подскажешь');
  await ui.tap('Сохранить');
  const data = await ui.waitData((x) => x.friends.find((f) => f.id === 's').name === 'Саша Иванова', 'не сохранилось');
  assert.deepEqual(genderOf(data.friends.find((f) => f.id === 's')), ['s', 'm', 'manual', null]);
  await ui.pause(3500);
  assert.deepEqual(genderOf((await ui.data()).friends.find((f) => f.id === 's')), ['s', 'm', 'manual', null], 'фоновый проход не тронул ручной');
}, { data: seed({ friends: [ANYA, F({ id: 's', name: 'Саша', genderStage: 'ai' }), F({ id: 'k', name: 'Алуашка', gender: 'f', genderBy: 'genderize' })] }) });

scenario('Переименование: не определился — пробуем заново по новому имени; определённый пол остаётся', async ({ ui }) => {
  await ui.go('/friend/edit?id=s');
  await ui.see('подскажешь?');
  await ui.fill('Например, Аня', 'Саша Иванова');
  await ui.notSee('подскажешь');
  await ui.tap('Сохранить');
  let data = await ui.waitData((x) => x.friends.find((f) => f.id === 's').name === 'Саша Иванова', 'не сохранилось');
  assert.deepEqual(genderOf(data.friends.find((f) => f.id === 's')), ['s', 'f', 'names', null]);
  await ui.go('/friend/edit?id=k');
  await ui.fill('Например, Аня', 'Саша');
  await ui.notSee('подскажешь');
  await ui.tap('Сохранить');
  data = await ui.waitData((x) => x.friends.find((f) => f.id === 'k').name === 'Саша', 'не сохранилось');
  assert.deepEqual(genderOf(data.friends.find((f) => f.id === 'k')), ['k', 'f', 'genderize', null], 'определённый пол переименование не трогает');
}, { data: seed({ friends: [ANYA, F({ id: 's', name: 'Саша', genderStage: 'ai' }), F({ id: 'k', name: 'Алуашка', gender: 'f', genderBy: 'genderize' })] }) });

scenario('ИИ: значок → «Пол друзей» → список крутится → загадки → «Помочь» → карточка; выбор сохраняется', async ({ ui }) => {
  await ui.go('/friends');
  await ui.tap('Магия для друзей');
  await ui.see('Пол друзей');
  await ui.see('Идеи подарков');
  await ui.notSee('Поздравления');
  await ui.tap('Пол друзей — поехали');
  await ui.see('Разобралась с');
  await ui.pause(5200);
  // Саша — загадка: шторка с выбором.
  await ui.see('Оставить так');
  await ui.tap('Помочь');
  await ui.see('Александр или Александра?');
  await ui.tap('Саша: мужчина');
  const data = await ui.waitData((x) => x.friends.find((f) => f.id === 's').gender === 'm', 'выбор не сохранился');
  assert.deepEqual(genderOf(data.friends.find((f) => f.id === 's')), ['s', 'm', 'manual', null]);
  // Загадок больше нет — экран сам возвращается к списку.
  await ui.pause(2800);
  await ui.notSee('Разобралась с');
  await ui.see('Аня Смирнова');
  const text = await ui.text();
  assert.ok(!/gemini|openrouter|genderize|hugging|google/i.test(text), 'в интерфейсе не называем, как это устроено');
}, { data: seed({ settings: { aiMenu: true }, friends: [ANYA, IGOR, MAMA, F({ id: 's', name: 'Саша', genderStage: 'ai' }), F({ id: 'k', name: 'Карина' })] }) });

scenario('ИИ: всё определилось — «Готово» и сам возвращается; «Оставить так» — тоже', async ({ ui }) => {
  await ui.go('/friends');
  await ui.tap('Магия для друзей');
  await ui.tap('Пол друзей — поехали');
  await ui.pause(5200);
  await ui.see('Оставить так');
  await ui.tap('Оставить так');
  await ui.pause(2600);
  await ui.notSee('Разобралась с');
  assert.equal((await ui.data()).friends.find((f) => f.id === 's').gender, undefined, '«оставить так» ничего не меняет');
}, { data: seed({ settings: { aiMenu: true }, friends: [ANYA, IGOR, F({ id: 's', name: 'Саша', genderStage: 'ai' })] }) });

scenario('ИИ: «Соцсети из заметок» — счётчик заметок; без магии в сборке честно говорит, что не вышло, заметки не трогает', async ({ ui }) => {
  await ui.go('/friends');
  await ui.tap('Магия для друзей');
  await ui.see('Соцсети из заметок');
  await ui.see('И подсказки к подаркам · 2 заметки');
  await ui.tap('Соцсети из заметок — поехали');
  const fail = /Не получилось дочитать|Магия на перерыве/;
  for (let k = 0; k < 25 && !fail.test(await ui.text()); k++) await ui.pause(200);
  assert.match(await ui.text(), fail);
  const data = await ui.data();
  assert.equal(data.friends.find((f) => f.id === 'n').notes, 'О себе: Фотограф. inst: anya.photo', 'заметка на месте');
  assert.equal(data.friends.find((f) => f.id === 'n').socials, undefined);
}, { data: seed({ settings: { aiMenu: true }, friends: [F({ id: 'n', name: 'Аня', notes: 'О себе: Фотограф. inst: anya.photo', notesQueue: true }), F({ id: 'm', name: 'Маша', notes: 'Любит пионы' }), F({ id: 'e', name: 'Без заметок' })] }) });

scenario('ИИ: значок магии пока спрятан — на экране друзей его нет; включённый флагом, без друзей он тоже не нужен', async ({ ui }) => {
  await ui.go('/friends');
  await ui.see('Аня Смирнова');
  await ui.see('Импорт друзей', { label: true });
  await ui.notSee('Магия для друзей', { label: true });
});

scenario('ИИ: без друзей значка нет', async ({ ui }) => {
  await ui.go('/friends');
  await ui.see('Пока никого');
  await ui.notSee('Магия для друзей', { label: true });
}, { data: seed({ settings: { aiMenu: true }, friends: [], reminders: [] }) });

scenario('Пол: Валя и Ника бывают у обоих — наружу не уходят, сразу «загадка»; угаданное раньше снимаем', async ({ ui, page }) => {
  const asked = await genderizeStub(page, { 'Валя': 'female', 'Ника': 'female' });
  await ui.go('/');
  const data = await ui.waitData((x) => x.friends.find((f) => f.id === 'n').genderStage === 'ai' && !x.friends.find((f) => f.id === 'v').gender, 'не стали загадками');
  assert.deepEqual(data.friends.map(genderOf), [
    ['a', 'f', 'names', null],
    ['v', null, null, 'ai'],
    ['n', null, null, 'ai'],
    ['m', 'f', 'manual', null],
  ]);
  await ui.pause(1500);
  assert.equal(asked.length, 0, 'Валю и Нику никуда не отправляли');
}, {
  data: seed({
    friends: [ANYA, F({ id: 'v', name: 'Валя', gender: 'f', genderBy: 'genderize' }), F({ id: 'n', name: 'Ника' }), F({ id: 'm', name: 'Валя', gender: 'f', genderBy: 'manual' })],
  }),
});

scenario('Новый друг: пол по имени сразу; сомнительное имя — в фон, один раз; «Не указан» вручную не перезаписывается', async ({ ui, page }) => {
  const asked = await genderizeStub(page);
  await ui.go('/friend/edit');
  await ui.fill('Например, Аня', 'Вероника');
  await ui.notSee('подскажешь');
  await ui.tap('Сохранить');
  let data = await ui.waitData((x) => x.friends.some((f) => f.name === 'Вероника'), 'друг не сохранился');
  const v = data.friends.find((f) => f.name === 'Вероника');
  assert.deepEqual([v.gender, v.genderBy], ['f', 'names']);

  await ui.go('/friend/edit');
  await ui.fill('Например, Аня', 'Ардак');
  await ui.notSee('подскажешь');
  await ui.tap('Сохранить');
  await ui.waitData((x) => x.friends.find((f) => f.name === 'Ардак')?.genderStage === 'genderize', 'Ардака не отправили в Genderize');
  assert.deepEqual(asked.map((a) => a.names), [['Ардак']]);

  // Женя бывает у обоих — никуда не отправляем, сразу «загадка».
  await ui.go('/friend/edit');
  await ui.fill('Например, Аня', 'Женя');
  await ui.tap('Сохранить');
  await ui.waitData((x) => x.friends.find((f) => f.name === 'Женя')?.genderStage === 'ai', 'Женя должна стать загадкой');
  assert.deepEqual(asked.map((a) => a.names), [['Ардак']], 'Женю не спрашивали');

  await ui.go(`/friend/edit?id=${v.id}`);
  await ui.tap('Не указан');
  await ui.notSee('подскажешь');
  await ui.tap('Сохранить');
  data = await ui.waitData((x) => x.friends.find((f) => f.id === v.id).genderBy === 'manual', 'ручной выбор не сохранился');
  assert.equal(data.friends.find((f) => f.id === v.id).gender, undefined);
  await page.reload();
  await ui.pause(3500);
  data = await ui.data();
  assert.deepEqual(genderOf(data.friends.find((f) => f.id === v.id)), [v.id, null, 'manual', null], '«Не указан» вручную — база имён его не перезаписывает');
  assert.equal(asked.length, 1, 'никого не переспросили');
}, { data: seed({ friends: [ANYA] }) });

// ===== Резервная копия =====
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const backupFile = (patch = {}) => Buffer.from(JSON.stringify({
  kind: 'friends-notes-backup', format: 1, createdAt: '2026-11-08T09:00:00.000Z', appVersion: '1.24.0',
  data: { version: 1, settings: { ...SETTINGS, accentLight: 'plum' }, friends: [F({ id: 'v', name: 'Вера Новая', birthday: '1990-06-20', gifts: 'Книги' })], reminders: [R({ id: 'rv', title: 'Позвонить Вере', friendId: 'v', date: d(2) })] },
  photos: { v: PNG_1PX },
  ...patch,
}));

scenario('Резервная копия: сохранить — в файле друзья, напоминания и фото; в настройках дата последней копии', async ({ ui, page }) => {
  await ui.go('/settings');
  await ui.see('Друзья, даты, напоминания и фото');
  const download = page.waitForEvent('download', { timeout: 10000 });
  await ui.tap('Сохранить копию');
  const file = await download;
  assert.equal(file.suggestedFilename(), 'druzya-kopiya-2026-06-10.json');
  const backup = JSON.parse(require('fs').readFileSync(await file.path(), 'utf8'));
  assert.equal(backup.kind, 'friends-notes-backup');
  assert.deepEqual(backup.data.friends.map((f) => f.name), ['Аня Смирнова', 'Игорь Ветров', 'Мама']);
  assert.equal(backup.data.reminders.length, 3);
  assert.ok(backup.data.friends.every((f) => !('photoUri' in f)), 'пути к фото в файл не попадают');
  assert.match(backup.photos.a || '', /^\/9j\//, 'фото Ани — JPEG внутри файла');
  assert.deepEqual(Object.keys(backup.photos), ['a']);
  await ui.see('Последняя — 10 июня');
  await ui.waitData((x) => typeof x.settings.lastBackupAt === 'string', 'дата копии не запомнилась');
}, { data: seed({ friends: [{ ...ANYA, photoUri: `data:image/png;base64,${PNG_1PX}`, thumbUri: `data:image/png;base64,${PNG_1PX}` }, IGOR, MAMA] }) });

scenario('Резервная копия: восстановить — вопрос с содержимым, данные заменены, прежние отложены', async ({ ui, page }) => {
  await ui.go('/settings');
  const chooser = page.waitForEvent('filechooser', { timeout: 5000 });
  await ui.tap('Восстановить из копии');
  await (await chooser).setFiles({ name: 'druzya-kopiya-2026-11-08.json', mimeType: 'application/json', buffer: backupFile() });
  await ui.waitData((x) => x.friends.length === 1, 'данные не заменились');
  assert.match(ui.dialogs.join('\n'), /Восстановить копию\?\n\nКопия от 8 ноября 2026: 1 друг, 1 напоминание и 1 фото\.\nВсё, что сейчас в приложении, заменится\./);
  await ui.pause(300);
  assert.match(ui.dialogs.join('\n'), /Копия восстановлена/);
  const data = await ui.data();
  assert.deepEqual([data.friends[0].name, data.reminders[0].title, data.settings.accentLight, data.settings.lastSeenVersion], ['Вера Новая', 'Позвонить Вере', 'plum', VERSION]);
  assert.match(data.friends[0].photoUri, /^data:image\/png;base64,iVBOR/);
  const before = JSON.parse(await page.evaluate((k) => localStorage.getItem(`${k}.before-restore`), KEY));
  assert.equal(before.friends.length, 3, 'прежние данные отложены');
  await ui.go('/friends');
  await ui.see('Вера Новая');
  await ui.notSee('Аня Смирнова');
});

scenario('Резервная копия: туда и обратно — сохранил, поменял, восстановил тот же файл — всё как было', async ({ ui, page }) => {
  await ui.go('/settings');
  // Сначала дождёмся фонового определения пола, чтобы копия и «как было» описывали одно и то же состояние.
  await ui.waitData((x) => x.friends.every((f) => f.gender), 'пол не определился');
  const download = page.waitForEvent('download', { timeout: 10000 });
  await ui.tap('Сохранить копию');
  const saved = await (await download).path();
  const original = await ui.waitData((x) => !!x.settings.lastBackupAt, 'копия не сохранилась');
  // Меняем данные: удаляем друга через карточку.
  await ui.go('/friend/c');
  await ui.tap('Изменить');
  await ui.tap('Удалить друга');
  await ui.waitData((x) => x.friends.length === 2, 'друг не удалился');
  await ui.go('/settings');
  const chooser = page.waitForEvent('filechooser', { timeout: 5000 });
  await ui.tap('Восстановить из копии');
  await (await chooser).setFiles(saved);
  const restored = await ui.waitData((x) => x.friends.length === 3, 'копия не восстановилась');
  const strip = (x) => ({ friends: x.friends.map(({ photoUri, thumbUri, ...f }) => f), reminders: x.reminders });
  assert.deepEqual(strip(restored), strip(original));
  assert.match(restored.friends.find((f) => f.id === 'a').photoUri, /^data:image\/jpeg;base64,\/9j\//, 'фото вернулось');
}, { data: seed({ friends: [{ ...ANYA, photoUri: `data:image/png;base64,${PNG_1PX}`, thumbUri: `data:image/png;base64,${PNG_1PX}` }, IGOR, MAMA] }) });

scenario('Резервная копия: чужой файл — понятная ошибка, данные не тронуты', async ({ ui, page }) => {
  await ui.go('/settings');
  const chooser = page.waitForEvent('filechooser', { timeout: 5000 });
  await ui.tap('Восстановить из копии');
  await (await chooser).setFiles({ name: 'calendar.ics', mimeType: 'text/calendar', buffer: Buffer.from('BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n') });
  await ui.pause(600);
  assert.match(ui.dialogs.join('\n'), /Не получилось восстановить\n\nЭто не копия «Друзей»: файл не читается\./);
  assert.ok(!ui.dialogs.some((x) => /Восстановить копию\?/.test(x)), 'до вопроса дело не дошло');
  assert.equal((await ui.data()).friends.length, 3);
});

scenario('Резервная копия: отказался в вопросе — ничего не меняется', async ({ ui, page }) => {
  await ui.go('/settings');
  const chooser = page.waitForEvent('filechooser', { timeout: 5000 });
  ui.dismissNextDialog();
  await ui.tap('Восстановить из копии');
  await (await chooser).setFiles({ name: 'kopiya.json', mimeType: 'application/json', buffer: backupFile() });
  await ui.pause(600);
  assert.match(ui.dialogs.join('\n'), /Восстановить копию\?/);
  assert.ok(!ui.dialogs.some((x) => /Копия восстановлена/.test(x)));
  assert.deepEqual((await ui.data()).friends.map((f) => f.name), ['Аня Смирнова', 'Игорь Ветров', 'Мама']);
});

scenario('Резервная копия: без друзей и напоминаний сохранять нечего', async ({ ui }) => {
  await ui.go('/settings');
  await ui.tap('Сохранить копию');
  await ui.pause(300);
  assert.match(ui.dialogs.join('\n'), /Пока нечего сохранять/);
}, { data: seed({ friends: [], reminders: [] }) });

scenario('Резервная копия: пять друзей и ни одной копии — подсказка сохранить', async ({ ui }) => {
  await ui.go('/settings');
  await ui.see('Ещё ни разу — стоит сохранить');
}, { data: seed({ friends: [ANYA, IGOR, MAMA, ...MORE_FRIENDS.slice(0, 2)] }) });

scenario('Экраны Telegram и «Сообщить о проблеме»', async ({ ui }) => {
  await ui.go('/telegram');
  await ui.see('Вход доступен только в Android-приложении');
  await ui.go('/diagnostics');
  await ui.see('Напиши мне в Telegram');
  await ui.see(`Друзья ${VERSION}`);
  await ui.see('Написать в Telegram');
});

// ===== «Что нового» и первый запуск =====
scenario('«Что нового» после обновления: только пропущенные версии, второй раз не показывается', async ({ ui, page }) => {
  await ui.go('/');
  await ui.see(`обновилось до версии ${VERSION}`);
  await ui.see('Резервная копия'); // 1.24.0
  await ui.notSee('Экран «Оформление»'); // 1.21.0 уже видели
  await ui.tap('Понятно');
  await ui.waitData((x) => x.settings.lastSeenVersion === VERSION, 'версия не запомнилась');
  await page.reload();
  await ui.see('Напоминания');
  await ui.pause(800);
  await ui.notSee(`обновилось до версии ${VERSION}`);
}, { data: seed({ settings: { lastSeenVersion: '1.21.0' } }) });

scenario('Шторки закрываются свайпом вниз: «Что нового», поле в карточке, шторка дня; короткое движение — остаётся', async ({ ui }) => {
  await ui.go('/');
  await ui.see(`обновилось до версии ${VERSION}`);
  // Чуть потянул и отпустил — шторка вернулась.
  await ui.swipeDown('Что нового', 40);
  await ui.see(`обновилось до версии ${VERSION}`);
  // Потянул как следует — закрылась, версия запомнилась, как по «Понятно».
  await ui.swipeDown('Что нового', 220);
  await ui.notSee(`обновилось до версии ${VERSION}`);
  await ui.waitData((x) => x.settings.lastSeenVersion === VERSION, 'после свайпа версия не запомнилась');
  // Шторка поля в карточке друга: без правок закрывается молча; с правками — спрашивает и остаётся на месте.
  await ui.go('/friend/a');
  await ui.tap('Пионы');
  await ui.see('Закрыть', { label: true });
  await ui.swipeDown('Цветы', 220);
  await ui.notSee('Закрыть', { label: true });
  assert.equal(ui.dialogs.length, 0, 'без правок вопросов быть не должно');
  // Шторка дня в календаре: тянется за шапку, за кнопку внизу и за само событие.
  await ui.go('/calendar');
  await ui.tap('Понедельник, 22 июня, 1 событие');
  await ui.see('Понедельник, 22 июня');
  await ui.swipeDown('Понедельник, 22 июня', 30);
  await ui.see('Понедельник, 22 июня');
  await ui.swipeDown('Понедельник, 22 июня', 160);
  await ui.notSee('Понедельник, 22 июня');
  await ui.tap('Понедельник, 22 июня, 1 событие');
  await ui.see('Понедельник, 22 июня');
  await ui.swipeDown(/Новое событие/, 160);
  await ui.notSee('Понедельник, 22 июня');
  await ui.tap('Понедельник, 22 июня, 1 событие');
  await ui.see('Понедельник, 22 июня');
  await ui.swipeDown('Познакомились · 8 лет', 160);
  await ui.notSee('Понедельник, 22 июня');
}, { data: seed({ settings: { lastSeenVersion: '1.21.0' } }) });

scenario('«Что нового»: «Вся история изменений» открывает экран истории', async ({ ui }) => {
  await ui.go('/');
  await ui.tap(/Вся история изменений/);
  await ui.see(`Установлена версия ${VERSION}`);
  await ui.see('1.21.0');
}, { data: seed({ settings: { lastSeenVersion: '1.21.0' } }) });

scenario('Календарь: дни рождения, годовщины и встречи; дел «до срока» и повторяющихся нет; листание месяцев', async ({ ui, page }) => {
  await ui.go('/calendar');
  await ui.see('Июнь 2026');
  // Ближайшие — с выбранного дня: сегодняшний день рождения Ани первым, дальше годовщина и встреча.
  await ui.see('Ближайшие');
  await ui.see('День рождения · 31 год');
  await ui.see('Познакомились · 8 лет');
  // Под «через N дней» — день недели и число: Аня сегодня, годовщина — через 12 дней.
  await ui.see('ср, 10 июн');
  await ui.see('пн, 22 июн');
  await ui.see('Стоматолог');
  await ui.notSee('Написать Диме'); // дело «до срока»
  await ui.notSee('Купить цветы — Аня'); // повторяющееся
  await ui.see('Важные даты');
  // Неделя — ровно семь клеток: понедельники одним столбцом, воскресенье — последним.
  const cols = await page.evaluate(() => {
    const x = (label) => [...document.querySelectorAll(`[aria-label^="${label}"]`)].find((e) => !e.closest('[aria-hidden="true"]')).getBoundingClientRect().x;
    return { mon15: x('Понедельник, 15 июня'), mon22: x('Понедельник, 22 июня'), sat20: x('Суббота, 20 июня'), sun21: x('Воскресенье, 21 июня') };
  });
  assert.ok(Math.abs(cols.mon15 - cols.mon22) < 1 && cols.sun21 > cols.sat20, `дни недели съехали: ${JSON.stringify(cols)}`);
  // Точки в днях: у 22 июня — событие. Нажал — шторка дня; другой день с событием — она же, другое содержимое;
  // пустой день — шторка закрылась.
  await ui.see('Понедельник, 22 июня, 1 событие', { label: true });
  await ui.tap('Понедельник, 22 июня, 1 событие');
  await ui.see('Понедельник, 22 июня');
  await ui.see('через 12 дней');
  await ui.tap('Понедельник, 15 июня, 1 событие');
  await ui.see('Понедельник, 15 июня');
  await ui.notSee('Понедельник, 22 июня');
  await ui.tap('Вторник, 23 июня');
  await ui.notSee('Понедельник, 15 июня');
  // Название месяца — кнопка: выбор месяца сеткой; июль — день рождения Мамы.
  await ui.tap('Июнь 2026');
  await ui.see('2026');
  await ui.tap('Июль 2026');
  await ui.see('Июль 2026');
  await ui.see('Мама');
  await ui.tap('Вернуться к сегодня');
  await ui.see('Июнь 2026');
  // Обозначения со счётчиками за месяц; «Скрыть» убирает, вернуть — в настройках.
  await ui.see('Скрыть обозначения', { label: true });
  await ui.tap('Скрыть обозначения');
  await ui.notSee('Скрыть обозначения', { label: true });
  await ui.waitData((x) => x.settings.calendarLegend === false, 'обозначения не скрылись');
  await ui.tap('Настройки');
  await ui.see('Уведомления');
  void page;
}, {
  data: seed({
    reminders: [
      R({ id: 'r1', title: 'Купить цветы — Аня', friendId: 'a', date: d(0), time: '18:00', repeat: { every: 2, unit: 'month' } }),
      R({ id: 'r3', title: 'Написать Диме', date: d(1), time: '20:00' }),
      R({ id: 'v', title: 'Стоматолог', kind: 'at', date: d(5), time: '15:00' }),
    ],
  }),
});

scenario('Свайп по экрану листает вкладки; свайп по карточке и по фильтрам — нет', async ({ ui, page }) => {
  const path = () => new URL(page.url()).pathname;
  await ui.go('/');
  await ui.see('Написать Диме');
  // По карточке влево — открывается «Удалить», вкладка та же.
  await ui.swipe('Написать Диме', -160);
  await ui.see('Удалить', { label: true });
  assert.equal(path(), '/', 'свайп по карточке не должен менять вкладку');
  await page.reload();
  await ui.see('Написать Диме');
  // По шапке влево — «Друзья», ещё раз — «Календарь», вправо — обратно.
  await ui.swipeAt(300, 30, -220);
  await page.waitForURL(/\/friends$/, { timeout: 3000 });
  await ui.see('Игорь Ветров');
  await ui.swipeAt(300, 30, -220);
  await page.waitForURL(/\/calendar$/, { timeout: 3000 });
  await ui.see('Июнь 2026');
  await ui.swipeAt(300, 300, -220); // дальше «Календаря» некуда
  assert.equal(path(), '/calendar');
  await ui.swipeAt(80, 30, 220);
  await page.waitForURL(/\/friends$/, { timeout: 3000 });
  await ui.swipeAt(80, 30, 220);
  await page.waitForURL((u) => new URL(u).pathname === '/', { timeout: 3000 });
  // Строка фильтров листается сама, вкладка не меняется.
  const chips = await ui.box('Быстрые');
  await ui.swipeAt(chips.x + chips.width / 2, chips.y + chips.height / 2, -150);
  assert.equal(path(), '/', 'свайп по фильтрам не должен менять вкладку');
});

scenario('Нижняя панель: «ниточка» — волна только между вкладками перехода, от той, с которой ушли', async ({ ui, page }) => {
  await ui.go('/');
  await ui.see('Написать Диме');
  // Высота середины каждого отрезка нитки (меньше — выше), снимаем по ходу перехода.
  const mids = () => page.evaluate(() => [...document.querySelectorAll('[data-testid="tab-rope"] path:nth-of-type(odd)')].map((p) => Number(p.getAttribute('d').split('L')[12].split(' ')[1])));
  const sample = async () => {
    const out = [];
    for (let i = 0; i < 24; i++) { out.push(await mids()); await page.waitForTimeout(40); }
    return out;
  };
  const rest = await mids();
  assert.equal(rest.length, 2, 'два отрезка нитки');
  // 1 → 2: вздрагивает только первый отрезок.
  await page.getByRole('tab').nth(1).click();
  let s = await sample();
  assert.ok(Math.min(...s.map((m) => m[0])) < rest[0] - 5, 'первый отрезок должен подпрыгнуть');
  assert.ok(Math.min(...s.map((m) => m[1])) > rest[1] - 0.5, 'второй отрезок должен остаться на месте');
  await page.waitForTimeout(600);
  // 2 → 3: только второй.
  await page.getByRole('tab').nth(2).click();
  s = await sample();
  assert.ok(Math.min(...s.map((m) => m[1])) < rest[1] - 5, 'второй отрезок должен подпрыгнуть');
  assert.ok(Math.min(...s.map((m) => m[0])) > rest[0] - 0.5, 'первый отрезок должен остаться на месте');
  await page.waitForTimeout(600);
  // 3 → 1: оба, и сначала второй (от «Календаря»).
  await page.getByRole('tab').nth(0).click();
  s = await sample();
  const peak = (k) => s.findIndex((m) => m[k] < rest[k] - 5);
  assert.ok(peak(1) >= 0 && peak(0) >= 0, 'оба отрезка должны подпрыгнуть');
  assert.ok(peak(1) < peak(0), 'волна должна начаться от «Календаря»');
});

scenario('Режим выбора на одной вкладке не мешает листать другие; на ней самой листание выключено', async ({ ui, page }) => {
  await ui.go('/');
  await ui.longPress('Написать Диме');
  await ui.see('Выбрано: 1', { label: true });
  // На «Напоминаниях» в режиме выбора свайп по шапке вкладку не меняет.
  await ui.swipeAt(300, 30, -220);
  await ui.pause(500);
  assert.equal(new URL(page.url()).pathname, '/', 'в режиме выбора вкладка не должна листаться');
  // Переходим на «Календарь» кнопкой — там листать можно.
  await page.getByRole('tab').nth(2).click();
  await page.waitForURL(/\/calendar$/, { timeout: 5000 });
  await ui.see('Июнь 2026');
  // Вкладка ещё доезжает на место: свайп посреди перехода не считается, а под нагрузкой переход дольше.
  await ui.pause(700);
  await ui.swipeAt(80, 30, 220);
  await page.waitForURL(/\/friends$/, { timeout: 5000 });
});

scenario('Календарь: подробности дня «в календаре» — гармошка под неделей, недели ниже отъезжают; переключается в настройках', async ({ ui, page }) => {
  await ui.go('/settings');
  await ui.tap('В календаре');
  await ui.waitData((x) => x.settings.calendarDayView === 'inline', 'настройка не сохранилась');
  await ui.go('/calendar');
  await ui.see('Июнь 2026');
  const y = (label) => page.evaluate((l) => [...document.querySelectorAll(`[aria-label^="${l}"]`)].find((e) => !e.closest('[aria-hidden="true"]')).getBoundingClientRect().y, label);
  const before = await y('Понедельник, 29 июня');
  await ui.tap('Понедельник, 22 июня, 1 событие');
  await ui.see('Понедельник, 22 июня · через 12 дней');
  await ui.pause(400);
  assert.ok((await y('Понедельник, 29 июня')) > before + 40, 'неделя под раскрытым днём должна отъехать вниз');
  // Другой день с событием — гармошка переехала к нему; тот же день ещё раз — свернулась.
  await ui.tap('Понедельник, 15 июня, 1 событие');
  await ui.see('Понедельник, 15 июня · через 5 дней');
  await ui.notSee('Понедельник, 22 июня · через 12 дней');
  await ui.tap('Понедельник, 15 июня, 1 событие');
  await ui.notSee('Понедельник, 15 июня · через 5 дней');
  await ui.pause(400);
  assert.ok(Math.abs((await y('Понедельник, 29 июня')) - before) < 2, 'после сворачивания недели должны вернуться');
}, {
  data: seed({
    reminders: [R({ id: 'v', title: 'Стоматолог', kind: 'at', date: d(5), time: '15:00' })],
  }),
});

scenario('Календарь: в подробностях дня — «Поздравить» у именинника (есть куда написать), «Новое событие» снизу; много событий — по группам', async ({ ui, page }) => {
  await ui.go('/calendar');
  // Сегодня у Ани день рождения, у неё есть Telegram — кнопка прямо в её строке.
  await ui.tap('Среда, 10 июня, сегодня, 1 событие');
  await ui.see('Поздравить в Telegram', { label: true });
  await ui.see('Новое событие');
  // У Мамы нет ни мессенджера, ни соцсетей — кнопки нет.
  await ui.tap('Июнь 2026');
  await ui.tap('Июль 2026');
  const mama = await page.evaluate(() => [...document.querySelectorAll('[aria-label*=", 20 июля"]')].find((e) => !e.closest('[aria-hidden="true"]'))?.getAttribute('aria-label'));
  await ui.tap(mama);
  await ui.see('Мама');
  await ui.notSee('Поздравить в', { label: true });
  // 20 июня — двенадцать дней рождения: шторка группирует и прокручивается.
  await ui.tap('Июль 2026');
  await ui.tap('Июнь 2026');
  await ui.tap('Суббота, 20 июня, 12 событий');
  await ui.see('Дни рождения · 12');
}, {
  data: seed({
    friends: [ANYA, MAMA, ...Array.from({ length: 12 }, (_, i) => F({ id: `x${i}`, name: `Друг ${i + 1}`, birthday: bday(10, 1990 + i), whatsapp: i % 2 ? '79990000000' : '' }))],
    reminders: [],
  }),
});

scenario('Календарь: шторка дня не двигает страницу, пока сетка видна; много событий — подкатывает ровно до сетки', async ({ ui, page }) => {
  await ui.go('/calendar');
  await ui.see('Июнь 2026');
  const scrollTop = () =>
    page.evaluate(() => Math.max(0, ...[...document.querySelectorAll('div')]
      .filter((d) => !d.closest('[aria-hidden="true"]') && d.scrollHeight > d.clientHeight + 50 && /(auto|scroll)/.test(getComputedStyle(d).overflowY))
      .map((d) => d.scrollTop)));
  // Одно событие — шторка невысокая, сетку не накрывает: страница стоит.
  await ui.tap('Среда, 10 июня, сегодня, 1 событие');
  await ui.see('Поздравить в Telegram', { label: true });
  await ui.pause(500);
  assert.equal(await scrollTop(), 0, 'страница не должна прокручиваться, если шторка не накрывает сетку');
  // Двенадцать событий — шторка до половины экрана и накрыла бы низ сетки: страница подкатывается, последняя неделя
  // сетки остаётся над шторкой, её можно нажать.
  await ui.tap('Суббота, 20 июня, 12 событий');
  await ui.see('Дни рождения · 12');
  await ui.pause(600);
  const free = await page.evaluate(() => {
    const cell = [...document.querySelectorAll('[aria-label^="Воскресенье, 12 июля"]')].find((e) => !e.closest('[aria-hidden="true"]'));
    const r = cell.getBoundingClientRect();
    return !!document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('[aria-label^="Воскресенье, 12 июля"]');
  });
  assert.ok(free, 'последняя неделя сетки должна выглядывать над шторкой');
  assert.ok((await scrollTop()) > 0, 'страница должна была подкатиться — иначе шторка накрыла бы низ сетки');
  // Закрыли высокую шторку, вернулись наверх, открыли день с одним событием — по старой высоте страница не уезжает.
  await ui.tap('Закрыть');
  await page.evaluate(() => { for (const d of document.querySelectorAll('div')) if (d.scrollTop > 0) d.scrollTop = 0; });
  await ui.pause(300);
  await ui.tap('Среда, 10 июня, сегодня, 1 событие');
  await ui.see('Поздравить в Telegram', { label: true });
  await ui.pause(600);
  assert.equal(await scrollTop(), 0, 'после высокой шторки низкая не должна двигать страницу');
}, {
  viewport: { width: 412, height: 915 },
  data: seed({
    friends: [ANYA, ...Array.from({ length: 12 }, (_, i) => F({ id: `x${i}`, name: `Друг ${i + 1}`, birthday: bday(10, 1990 + i) }))],
    reminders: [],
  }),
});

scenario('Календарь: «в календаре» много событий — первые пять и «Ещё N»', async ({ ui }) => {
  await ui.go('/calendar');
  await ui.tap('Суббота, 20 июня, 12 событий');
  await ui.see('Дни рождения · 12');
  await ui.see('Ещё 7 событий');
  // По алфавиту первые пять — «Друг 1», «Друг 10», «Друг 11», «Друг 12», «Друг 2»; «Друг 9» — под «Ещё».
  await ui.notSee('Друг 9');
  await ui.tap('Ещё 7 событий');
  await ui.see('Друг 9');
}, {
  data: seed({
    settings: { calendarDayView: 'inline' },
    friends: [ANYA, ...Array.from({ length: 12 }, (_, i) => F({ id: `x${i}`, name: `Друг ${i + 1}`, birthday: bday(10, 1990 + i) }))],
    reminders: [],
  }),
});

scenario('Календарь: сетка листается каруселью — месяцы, а не вкладки; выбранный день — кружок', async ({ ui, page }) => {
  const path = () => new URL(page.url()).pathname;
  await ui.go('/calendar');
  await ui.see('Июнь 2026');
  const grid = await ui.box('Среда, 17 июня', { label: true }).catch(() => null);
  const y = grid ? grid.y + grid.height / 2 : 330;
  await ui.swipeAt(300, y, -200);
  await ui.see('Июль 2026');
  assert.equal(path(), '/calendar', 'свайп по сетке — месяц, а не вкладка');
  await ui.swipeAt(80, y, 200);
  await ui.see('Июнь 2026');
  // Выбранный день — кружок (скругление), а не квадрат.
  await ui.tap('Четверг, 18 июня');
  const radius = await page.evaluate(() => {
    const el = [...document.querySelectorAll('[aria-label^="Четверг, 18 июня"]')].find((e) => !e.closest('[aria-hidden="true"]'));
    const circle = el && [...el.querySelectorAll('div')].find((d) => getComputedStyle(d).borderRadius !== '0px' && getComputedStyle(d).backgroundColor !== 'rgba(0, 0, 0, 0)');
    return circle ? getComputedStyle(circle).borderRadius : null;
  });
  assert.equal(radius, '17px');
  // Свайп по шапке — уже вкладки.
  await ui.swipeAt(80, 30, 220);
  await page.waitForURL(/\/friends$/, { timeout: 3000 });
});

scenario('Календарь: «Новое событие» — на выбранный день, «Дата и время», сразу в календаре; «↶ Сегодня» возвращает', async ({ ui }) => {
  await ui.go('/calendar');
  await ui.tap('Пятница, 19 июня');
  await ui.tap('Новое событие');
  await ui.see('Новое напоминание');
  await ui.fill('Например, сдать отчёт', 'Массаж');
  await ui.see('Напомню чт, 18 июн и пт, 19 июн в 10:00.');
  await ui.tap('Сохранить');
  const data = await ui.waitData((x) => x.reminders.some((r) => r.title === 'Массаж'), 'не сохранилось');
  const r = data.reminders.find((x) => x.title === 'Массаж');
  assert.deepEqual([r.date, r.kind, r.calendar], ['2026-06-19', 'at', true]);
  await ui.see('Пятница, 19 июня, 1 событие', { label: true });
  await ui.tap('Вернуться к сегодня');
  await ui.notSee('Вернуться к сегодня', { label: true });
});

scenario('Праздники: страна телефона сразу, выбор стран галочками, праздник с описанием из Википедии', async ({ ui, page }) => {
  await ui.go('/calendar');
  await ui.see('Июнь 2026');
  // Язык телефона ru-RU — сразу праздники России: 12 июня — День России, красным числом; в обозначениях — «Праздники».
  await ui.see('Праздники');
  await ui.see('Пятница, 12 июня, 1 событие', { label: true });
  const red = await page.evaluate(() => {
    const cell = [...document.querySelectorAll('[aria-label^="Пятница, 12 июня"]')].find((e) => !e.closest('[aria-hidden="true"]'));
    const plain = [...document.querySelectorAll('[aria-label^="Четверг, 11 июня"]')].find((e) => !e.closest('[aria-hidden="true"]'));
    const color = (el) => getComputedStyle([...el.querySelectorAll('div')].find((d) => d.textContent.trim() === d.textContent && /^\d+$/.test(d.textContent.trim()) && !d.children.length) || el).color;
    return { hol: color(cell), plain: color(plain) };
  });
  assert.notEqual(red.hol, red.plain, `праздник должен быть красным числом: ${JSON.stringify(red)}`);
  await ui.tap('Пятница, 12 июня, 1 событие');
  await ui.see('День России');
  await ui.see('12 июня · 🇷🇺 Россия');
  await ui.tap('День России');
  await ui.see('Пятница, 12 июня');
  await ui.see('Читать в Википедии');
  await ui.see('Текст — из Википедии, лицензия CC BY-SA 4.0.');
  await page.goBack();
  await ui.see('Июнь 2026');
  // Значок «красный день» в шапке — какие страны: снимаем Россию, ставим США.
  await ui.tap('Праздники стран');
  await ui.see('Выбрано: 1');
  await ui.tap('Россия');
  await ui.see('Ничего не выбрано');
  await ui.tap('США');
  await ui.see('Выбрано: 1');
  const data = await ui.waitData((x) => JSON.stringify(x.settings.holidayCountries) === '["US"]', 'выбор стран не сохранился');
  assert.deepEqual(data.settings.holidayCountries, ['US']);
  await page.goBack();
  await ui.see('Июнь 2026');
  await ui.notSee('Пятница, 12 июня, 1 событие', { label: true });
  // 19 июня — Джунтин, 4 июля — День независимости США.
  await ui.see('Пятница, 19 июня, 1 событие', { label: true });
  await ui.tap('Июнь 2026');
  await ui.tap('Июль 2026');
  await ui.tap('Суббота, 4 июля, 1 событие');
  await ui.see('День независимости США');
  await ui.see('🇺🇸 США');
});

scenario('Умный календарь: «до срока» не бывает, событие с повтором — каждую неделю, «В календаре» правится в деле; выключается в настройках', async ({ ui, page }) => {
  await ui.go('/calendar');
  await ui.see('Стоматолог');
  await ui.see('Позвонить маме'); // без магии (в тестах ИИ недоступен) «на дату и время» — в календаре
  await ui.notSee('Настольный теннис'); // повторяющееся — нет, пока не решат
  await ui.notSee('Купить корм'); // «до срока» — никогда
  // Звонок — не событие: убираем из календаря в самом деле.
  await ui.go('/reminder/edit?id=call');
  await ui.notSee('Магия решит'); // подписи про магию у переключателя нет
  await page.getByRole('switch', { name: 'В календаре' }).click();
  await ui.tap('Сохранить');
  await ui.waitData((x) => x.reminders.find((r) => r.id === 'call').calendar === false, 'выбор не сохранился');
  // Теннис — событие: добавляем.
  await ui.go('/reminder/edit?id=tennis');
  await page.getByRole('switch', { name: 'В календаре' }).click();
  await ui.tap('Сохранить');
  await ui.waitData((x) => x.reminders.find((r) => r.id === 'tennis').calendar === true, 'выбор не сохранился');
  await ui.go('/calendar');
  await ui.notSee('Позвонить маме');
  await ui.see('Четверг, 18 июня, 1 событие', { label: true }); // теннис каждую неделю: 11, 18, 25
  await ui.see('Четверг, 25 июня, 1 событие', { label: true });
  // В деле «до срока» переключателя нет.
  await ui.go('/reminder/edit?id=food');
  await ui.notSee('В календаре');
  // Настройки: «Умный календарь» выключается.
  await ui.go('/settings');
  await page.getByRole('switch', { name: 'Умный календарь' }).click();
  await ui.waitData((x) => x.settings.smartCalendar === false, 'не выключилось');
}, {
  data: seed({
    reminders: [
      R({ id: 'v', title: 'Стоматолог', kind: 'at', date: d(5), time: '15:00' }),
      R({ id: 'call', title: 'Позвонить маме', kind: 'at', date: d(2), time: '18:00' }),
      R({ id: 'tennis', title: 'Настольный теннис', date: d(1), time: '19:00', repeat: { every: 1, unit: 'week' } }),
      R({ id: 'food', title: 'Купить корм', date: d(3) }),
    ],
  }),
});

scenario('Открывается на «Напоминаниях»: две вкладки, в шапке — настройки; старая ссылка /reminders ведёт туда же', async ({ ui, page }) => {
  await ui.go('/');
  await ui.see('Написать Диме');
  await ui.notSee('Скоро');
  await ui.tap('Настройки');
  await ui.see('Уведомления');
  await ui.go('/reminders');
  await page.waitForURL((u) => new URL(u).pathname === '/', { timeout: 5000 });
  await ui.see('Написать Диме');
  await ui.tab('Друзья');
  await ui.tap('Настройки');
  await ui.see('Уведомления');
});

scenario('Первый запуск: открываются «Друзья», пустые вкладки и без шторки «Что нового»', async ({ ui, page }) => {
  await ui.go('/');
  await page.waitForURL(/\/friends$/, { timeout: 5000 });
  await ui.see('Пока никого');
  await ui.see('Импорт из контактов');
  await ui.see('Добавить друга', { label: true });
  await ui.notSee('обновилось до версии');
  await ui.waitData((x) => x.settings.lastSeenVersion === VERSION, 'новой установке версия должна запомниться');
  await ui.tab('Друзья'); await ui.see('Импорт из контактов');
  await ui.tab('Напоминания'); await ui.see('Напоминаний нет');
}, { data: null });

// ===== Хранение данных =====
scenario('Данные переживают перезапуск приложения', async ({ ui, page }) => {
  await ui.go('/friends');
  await ui.tap('Добавить друга');
  await ui.fill('Например, Аня', 'Сохраняемый');
  await ui.tap('Сохранить');
  await ui.waitData((x) => x.friends.some((f) => f.name === 'Сохраняемый'), 'не сохранилось');
  await page.reload();
  await ui.see('Сохраняемый');
});

scenario('Данные старой версии без новых полей открываются без сбоев', async ({ ui, page }) => {
  await ui.go('/friends');
  await ui.see('Старый Друг');
  await ui.tap('Старый Друг');
  await ui.see('через 2 дня');
  await ui.go('/settings');
  assert.equal(await page.getByRole('switch').last().isChecked(), true, 'отчёты о сбоях по умолчанию включены');
}, {
  data: {
    version: 1,
    settings: { eventTime: '10:00', eventDayBefore: true, theme: 'light', accentLight: 'terracotta', accentDark: 'terracotta', lastSeenVersion: VERSION },
    friends: [{ id: 'old', name: 'Старый Друг', emoji: '🙂', birthday: bday(2, 1980), phone: '', food: '', flowers: '', gifts: '', notes: '', dates: [], createdAt: 1 }],
    reminders: [],
  },
});

scenario('Повреждённые сохранённые данные не затираются пустыми', async ({ ui, page }) => {
  await ui.go('/');
  await ui.pause(1500);
  const backups = await page.evaluate((k) => Object.keys(localStorage).filter((x) => x.startsWith(`${k}.broken-`)).map((x) => localStorage.getItem(x)), KEY);
  assert.deepEqual(backups, ['{"friends":[{"id":"a","name":"Аня"'], 'испорченные данные должны лечь в резервную копию');
  await ui.see('Пока никого'); // приложение работает дальше, а не падает
}, { raw: '{"friends":[{"id":"a","name":"Аня"' });

// ===== Импорт из Telegram: карточка в списке друзей =====
for (const [state, expect] of [['loading', ['Импорт из Telegram', '154 из 248']], ['done', ['Telegram: 248 контактов', 'Выбери, кого добавить']], ['code', ['Вход в Telegram ждёт тебя', 'Код из приложения Telegram']]]) {
  scenario(`Импорт из Telegram: карточка «${expect[0]}» в списке друзей`, async ({ ui }) => {
    await ui.go('/friends');
    for (const s of expect) await ui.see(s);
    const box = await ui.box(expect[0]);
    assert.ok(box.y < 500, `карточка должна быть в начале списка, y=${box.y}`);
  }, { storage: { 'friends-notes/tg-preview': state } });
}

// ===== Вёрстка и навигация =====
scenario('Неизвестный адрес — свой экран на русском', async ({ ui }) => {
  await ui.go('/nope');
  await ui.notSee('Unmatched Route');
  await ui.see('Такой страницы нет');
  await ui.tap('На главную');
  await ui.see('Просрочено');
});

// ---------- Исполнитель ----------
function helpers(page, dialogs) {
  const visibleText = () => page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const parts = [];
    let node;
    while ((node = walker.nextNode())) {
      const el = node.parentElement;
      if (!el || el.closest('[aria-hidden="true"]')) continue;
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') continue;
      parts.push(node.textContent);
    }
    return parts.join(' ').replace(/\s+/g, ' ');
  });
  const labels = () => page.evaluate(() => [...document.querySelectorAll('[aria-label]')].filter((e) => !e.closest('[aria-hidden="true"]') && e.getBoundingClientRect().width > 0).map((e) => e.getAttribute('aria-label')).join(' | '));
  const until = async (check, ms, onFail) => {
    const end = Date.now() + ms;
    for (;;) {
      if (await check()) return;
      if (Date.now() > end) throw new Error(await onFail());
      await page.waitForTimeout(100);
    }
  };
  const visible = async (locator) => {
    const handles = await locator.elementHandles();
    for (let i = handles.length - 1; i >= 0; i--) {
      if (await handles[i].evaluate((e) => !e.closest('[aria-hidden="true"]') && e.getBoundingClientRect().width > 0)) return handles[i];
    }
    return null;
  };
  /** Элемент по подписи для экранного диктора или по тексту — последний видимый (скрытые вкладки остаются в DOM). */
  const find = async (target, { nth } = {}) => {
    let found = null;
    await until(async () => {
      const locs = typeof target === 'string' ? [page.getByLabel(target, { exact: true }), page.getByText(target, { exact: true })] : [page.getByText(target)];
      for (const loc of locs) {
        if (nth === 'first') {
          const hs = await loc.elementHandles();
          for (const h of hs) if (await h.evaluate((e) => !e.closest('[aria-hidden="true"]') && e.getBoundingClientRect().width > 0)) { found = h; return true; }
        } else if ((found = await visible(loc))) return true;
      }
      return false;
    }, 5000, async () => `Не нашёл «${target}». На экране: ${(await visibleText()).slice(0, 400)}`);
    return found;
  };
  const ui = {
    dialogs,
    /** Следующий вопрос (confirm) отклонить, а не принять. */
    dismissNextDialog() { dialogs.dismissNext = true; },
    async go(url) {
      await page.goto(`http://localhost:${PORT}${url}`);
      await page.waitForFunction(() => document.body.innerText.trim().length > 0, null, { timeout: 15000 });
      await page.waitForTimeout(400);
    },
    text: visibleText,
    pause: (ms) => page.waitForTimeout(ms),
    async see(text, { label = false, exact = true } = {}) {
      const want = text.toLowerCase();
      await until(async () => (label ? (await labels()).toLowerCase() : (await visibleText()).toLowerCase()).includes(want), 5000,
        async () => `Нет на экране: «${text}». Видно: ${(label ? await labels() : await visibleText()).slice(0, 400)}`);
      void exact;
    },
    async notSee(text, { label = false } = {}) {
      const want = text.toLowerCase();
      await until(async () => !(label ? (await labels()).toLowerCase() : (await visibleText()).toLowerCase()).includes(want), 3000,
        async () => `Не должно быть на экране: «${text}»`);
    },
    async tap(target, opts) {
      // Нажимаем на первый кандидат, который действительно получает нажатие: под шторкой и окном остаются невидимые для пальца копии.
      await until(async () => {
        const locs = typeof target === 'string' ? [page.getByLabel(target, { exact: true }), page.getByText(target, { exact: true })] : [page.getByText(target)];
        for (const loc of locs) {
          const hs = await loc.elementHandles();
          const order = opts && opts.nth === 'first' ? hs : [...hs].reverse();
          for (const h of order) {
            if (!(await h.evaluate((e) => !e.closest('[aria-hidden="true"]') && e.getBoundingClientRect().width > 0))) continue;
            try { await h.click({ trial: true, timeout: 600 }); } catch { continue; }
            await h.click({ timeout: 2000 });
            return true;
          }
        }
        return false;
      }, 5000, async () => `Не нашёл, куда нажать: «${target}». На экране: ${(await visibleText()).slice(0, 400)}`);
      await page.waitForTimeout(250);
    },
    async longPress(target) {
      const h = await find(target);
      const b = await h.boundingBox();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down(); await page.waitForTimeout(700); await page.mouse.up(); await page.waitForTimeout(300);
    },
    async box(target) { return (await find(target)).boundingBox(); },
    /** Провести пальцем по строке с этим текстом: dx < 0 — влево, dx > 0 — вправо. */
    async swipe(target, dx) {
      const h = await find(target);
      await h.scrollIntoViewIfNeeded();
      await page.waitForTimeout(150);
      const b = await h.boundingBox();
      const x = b.x + b.width / 2;
      const y = b.y + b.height / 2;
      // Настоящими касаниями (CDP): движение мышью жесты свайпа на вебе принимают за нажатие.
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let k = 1; k <= 24; k++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (dx * k) / 24, y }] });
        await page.waitForTimeout(10);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
      await page.waitForTimeout(600);
    },
    /** Провести пальцем по экрану в точке (x, y) на dx — не по карточке: так листаются вкладки. */
    async swipeAt(x, y, dx) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let k = 1; k <= 24; k++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (dx * k) / 24, y }] });
        await page.waitForTimeout(10);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
      await page.waitForTimeout(700);
    },
    /** Какая форма дела открыта: «быстрая» (ленты, календарь в строке) или «строками» (выбор в шторке). */
    async quickForm() {
      await ui.see('Сохранить'); // форма уже на экране
      return !!(await visible(page.getByLabel(/календарь$/)));
    },
    /** Срок в форме дела. Быстрая: ближняя неделя — в строке, дальше — календарь на месте. Строками: в шторке. */
    async pickDate(iso) {
      const [y, m, dd] = iso.split('-').map(Number);
      const diff = Math.round((Date.UTC(y, m - 1, dd) - Date.UTC(2026, 5, 10)) / 86400000);
      const quick = await ui.quickForm();
      if (!quick) {
        for (const name of ['Срок', 'Дата', 'Ближайший раз']) if (await visible(page.getByText(name, { exact: true }))) { await ui.tap(name); break; }
      } else if (diff < 0 || diff > 6) await ui.tap('Открыть календарь');
      if (!quick || diff < 0 || diff > 6) {
        const months = (y - 2026) * 12 + (m - 1) - 5;
        for (let k = 0; k < Math.abs(months); k++) await ui.tap(months > 0 ? 'Следующий месяц' : 'Предыдущий месяц');
      }
      const WD = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
      const MG = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
      await ui.tap(`${WD[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()]}, ${dd} ${MG[m - 1]}`);
    },
    /** Время в форме дела: таблетка, а если такой нет — системные часы (в браузере — поле времени). Строками — в шторке. */
    async pickTime(time) {
      const quick = await ui.quickForm();
      if (!quick) {
        for (const name of ['Напомнить', 'Время']) if (await visible(page.getByText(name, { exact: true }))) { await ui.tap(name); break; }
      }
      const short = time.replace(/^0/, '');
      const chip = await visible(page.getByText(short, { exact: true }));
      if (chip) await ui.tap(short);
      else {
        await page.getByLabel('Выбрать время').fill(time);
        await page.waitForTimeout(250);
      }
      if (!quick) await ui.tap('Готово');
    },
    /** Провести пальцем вниз от этого текста на dy — так закрывают шторки. */
    async swipeDown(target, dy) {
      const h = await find(target);
      const b = await h.boundingBox();
      const x = b.x + b.width / 2;
      const y = b.y + b.height / 2;
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let k = 1; k <= 20; k++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + (dy * k) / 20 }] });
        await page.waitForTimeout(12);
      }
      // Палец замер перед тем, как оторваться: решает расстояние, а не скорость.
      await page.waitForTimeout(120);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + dy }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
      await page.waitForTimeout(600);
    },
    /** «Сделано» у напоминания с этим текстом — свайпом вправо (кружков в строках нет). */
    async check(title) { await ui.swipe(title, 160); },
    async field(placeholder, orPlaceholder) {
      let h = null;
      await until(async () => {
        h = (await visible(page.getByPlaceholder(placeholder, { exact: true }))) || (orPlaceholder ? await visible(page.getByPlaceholder(orPlaceholder)) : null);
        return !!h;
      }, 5000, async () => `Нет поля «${placeholder}». На экране: ${(await visibleText()).slice(0, 300)}`);
      return h;
    },
    async fill(placeholder, value, { orPlaceholder } = {}) {
      const h = await ui.field(placeholder, orPlaceholder);
      await h.fill(value); await page.waitForTimeout(250);
    },
    async typeInto(placeholder, digits, { clear = false } = {}) {
      const h = await ui.field(placeholder);
      await h.click();
      if (clear) await h.fill('');
      await page.keyboard.type(digits, { delay: 20 }); await page.waitForTimeout(250);
    },
    async tab(name) { await page.getByText(name, { exact: true }).last().click(); await page.waitForTimeout(500); },
    async data() { return JSON.parse((await page.evaluate((k) => localStorage.getItem(k), KEY)) || 'null'); },
    async waitData(pred, message) {
      let last = null;
      await until(async () => { last = await ui.data(); try { return !!(last && pred(last)); } catch { return false; } }, 5000, async () => `${message}. В данных: ${JSON.stringify(last).slice(0, 300)}`);
      return last;
    },
  };
  return ui;
}

const PORT = 8096;
const types = { '.js': 'application/javascript', '.html': 'text/html', '.ico': 'image/x-icon', '.png': 'image/png', '.ttf': 'font/ttf', '.json': 'application/json' };
const absRoot = path.resolve(root);
const server = http.createServer((req, res) => {
  // Путь считаем от абсолютной папки сборки: и для «dist-web», и для «/tmp/web»; выйти за её пределы нельзя.
  let p = path.resolve(absRoot, `.${decodeURIComponent(req.url.split('?')[0])}`);
  if (!p.startsWith(absRoot + path.sep) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(absRoot, 'index.html');
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});

async function run(browser, s, index) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1, locale: 'ru-RU', timezoneId: TZ, ...(s.viewport ? { viewport: s.viewport } : {}) });
  // Часы стоят на NOW и дальше идут сами: дата в сценариях та же, а анимации (они меряют время по Date.now) доигрывают.
  await ctx.clock.install({ time: NOW });
  // Сервисы определения пола по умолчанию «без интернета»: сценарий, которому они нужны, подставляет ответ сам.
  await ctx.route(/api\.genderize\.io|generativelanguage\.googleapis\.com|openrouter\.ai|router\.huggingface\.co/, (route) => route.abort('internetdisconnected'));
  const data = s.data === undefined ? seed() : s.data;
  const raw = s.raw ?? (data ? JSON.stringify(data) : null);
  await ctx.addInitScript(([key, value, extra]) => {
    if (value !== null && localStorage.getItem(key) === null) localStorage.setItem(key, value);
    for (const [k, v] of Object.entries(extra || {})) localStorage.setItem(k, v);
  }, [KEY, raw, { 'friends-notes/swipe-hint': '3', ...(s.storage || {}) }]);  // подсказку свайпа — только там, где её проверяем
  const page = await ctx.newPage();
  const errors = [];
  const dialogs = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (dlg) => {
    dialogs.push(dlg.message());
    if (dialogs.dismissNext) {
      dialogs.dismissNext = false;
      dlg.dismiss();
    } else dlg.accept();
  });
  const started = Date.now();
  let error = null;
  try {
    await Promise.race([
      s.fn({ page, ui: helpers(page, dialogs) }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('сценарий дольше 60 с')), 60000)),
    ]);
    if (errors.length) throw new Error(`ошибка в приложении: ${errors[0]}`);
  } catch (e) {
    error = e;
    await page.screenshot({ path: path.join(out, `fail-${String(index + 1).padStart(2, '0')}.png`) }).catch(() => {});
  }
  await ctx.close();
  const ms = Date.now() - started;
  if (s.known) return error ? { status: 'known', s, ms, note: String(error.message).split('\n')[0] } : { status: 'fixed', s, ms };
  return error ? { status: 'fail', s, ms, note: String(error.message).split('\n')[0] } : { status: 'pass', s, ms };
}

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch();
  const list = scenarios.map((s, i) => ({ s, i })).filter(({ s }) => !grep || s.name.toLowerCase().includes(grep));
  const results = new Array(list.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(WORKERS, list.length) }, async () => {
    while (next < list.length) {
      const k = next++;
      results[k] = await run(browser, list[k].s, list[k].i);
      const r = results[k];
      const mark = { pass: 'ok   ', fail: 'FAIL ', known: 'KNOWN', fixed: 'FIXED' }[r.status];
      console.log(`${mark} ${r.s.name} (${(r.ms / 1000).toFixed(1)} с)${r.note ? `\n      ${r.note}` : ''}${r.status === 'fixed' ? '\n      Сценарий с известной ошибкой прошёл: сними пометку known.' : ''}`);
    }
  }));
  await browser.close();
  server.close();
  const count = (st) => results.filter((r) => r.status === st).length;
  const summary = `\nИтого: ${results.length} · прошли ${count('pass')} · упали ${count('fail')} · известные ошибки ${count('known')} · исправленные, но с пометкой ${count('fixed')}`;
  console.log(summary);
  fs.writeFileSync(path.join(out, 'e2e-results.txt'), results.map((r) => `${r.status}\t${r.s.name}${r.note ? `\t${r.note}` : ''}`).join('\n') + summary + '\n');
  process.exit(count('fail') + count('fixed') ? 1 : 0);
})();
