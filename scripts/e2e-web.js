// Сквозная проверка всех сценариев на веб-сборке: друзья, напоминания, импорт, настройки, темы.
const http = require('http'), fs = require('fs'), path = require('path');
const assert = require('assert');
const { chromium, devices } = require('playwright');
const root = process.argv[2], out = process.argv[3];
const types = { '.js': 'application/javascript', '.html': 'text/html', '.ico': 'image/x-icon', '.png': 'image/png', '.ttf': 'font/ttf', '.json': 'application/json' };
const srv = http.createServer((req, res) => {
  let p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(root, 'index.html');
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(8096);
const KEY = 'friends-notes/data/v1';
const VERSION = require('../app.json').expo.version;
const iso = (d) => d.toISOString().slice(0, 10);
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const md = (n, y) => `${y}-${day(n).slice(5)}`;
const seed = {
  version: 1, settings: { eventTime: '10:00', eventDayBefore: true, theme: 'light', accentLight: 'terracotta', accentDark: 'terracotta', lastSeenVersion: VERSION },
  friends: [
    { id: 'a', name: 'Аня Смирнова', emoji: '🌸', birthday: md(0, 1995), phone: '+7 999 123-45-67', telegramId: 123456789, whatsapp: '79991234567', food: 'Суши, тирамису', flowers: 'Пионы', gifts: 'Керамика', notes: 'Любит настолки', dates: [{ id: 'd1', title: 'Познакомились', date: md(12, 2018), yearly: true }], createdAt: 1 },
    { id: 'b', name: 'Игорь Ветров', emoji: '😎', birthday: md(3, 1992), phone: '+375 29 111-22-33', viber: '375291112233', food: 'Стейк', flowers: '', gifts: '', notes: '', dates: [], createdAt: 2 },
    { id: 'c', name: 'Мама', emoji: '❤️', birthday: md(40, 1966), phone: '', food: '', flowers: 'Тюльпаны', gifts: '', notes: '', dates: [], createdAt: 3 },
  ],
  reminders: [
    { id: 'r1', title: 'Купить цветы — Аня', note: '', friendId: 'a', date: day(0), time: '18:00', repeat: { every: 2, unit: 'month' }, advance: 0, done: false, createdAt: 1 },
    { id: 'r3', title: 'Написать Диме', note: '', friendId: null, date: day(-1), time: '20:00', repeat: null, advance: 1440, done: false, createdAt: 3 },
  ],
};
const results = [];
let pageRef = null, outDir = null, n = 0;
const step = async (name, fn) => {
  n++;
  try { await fn(); results.push(`ok   ${name}`); }
  catch (e) {
    results.push(`FAIL ${name}: ${String(e.message).split('\n')[0].slice(0, 300)}`);
    try { await pageRef.screenshot({ path: `${outDir}/e2e-fail-${n}.png` }); } catch {}
  }
};
const has = (t, s) => t.toLowerCase().includes(s.toLowerCase());
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'ru-RU' });
  await ctx.addInitScript((d) => { if (!localStorage.getItem('friends-notes/data/v1')) localStorage.setItem('friends-notes/data/v1', d); }, JSON.stringify(seed));
  const page = await ctx.newPage();
  pageRef = page; outDir = out;
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('dialog', (d) => d.accept());
  const go = async (url) => { await page.goto('http://localhost:8096' + url); await page.waitForTimeout(1200); };
  const stored = async () => JSON.parse(await page.evaluate((k) => localStorage.getItem(k), KEY));
  // Текст только видимых элементов: неактивные вкладки остаются в DOM.
  const text = async () =>
    page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const out = [];
      let n;
      while ((n = walker.nextNode())) {
        const el = n.parentElement;
        if (!el || el.closest('[aria-hidden="true"]')) continue;
        const r = el.getBoundingClientRect();
        if (!r.width && !r.height) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') continue;
        out.push(n.textContent);
      }
      return out.join(' ').replace(/\s+/g, ' ');
    });
  // Нажать на последний элемент, который не спрятан (неактивные вкладки и экраны стека остаются в DOM с aria-hidden).
  const tap = async (locator) => {
    const handles = await locator.elementHandles();
    let target = null;
    for (const h of handles) if (!(await h.evaluate((e) => !!e.closest('[aria-hidden="true"]')))) target = h;
    if (!target) throw new Error('нет видимого элемента: ' + locator);
    await target.click();
  };
  const tab = async (name) => { await page.getByText(name, { exact: true }).last().click(); await page.waitForTimeout(700); };
  const input = (placeholder) => page.getByPlaceholder(placeholder);
  const shot = (name) => page.screenshot({ path: `${out}/e2e-${name}.png` });

  await go('/');
  await step('Скоро: секции, карточка «Сегодня», кнопки', async () => {
    const t = await text();
    for (const s of ['Скоро', 'Просрочено', 'Написать Диме', 'просрочено', 'Сегодня', 'Аня Смирнова', 'День рождения', '31', 'год', 'Позвонить', 'Поздравить', 'Купить цветы — Аня', 'На этой неделе', 'Игорь Ветров', 'через 3 дня', 'Мама']) assert(has(t, s), `нет «${s}»`);
  });
  await step('Скоро: отметить повторяющееся — переносится на следующий раз', async () => {
    const box = page.getByRole('checkbox').nth(1); // первый — просроченное, второй — «Купить цветы»
    await box.click(); await page.waitForTimeout(500);
    const r = (await stored()).reminders.find((x) => x.id === 'r1');
    assert.equal(r.done, false); assert(r.date > day(0), `дата не перенесена: ${r.date}`);
  });
  await step('Скоро: отметить разовое просроченное — уходит в сделанные', async () => {
    await page.getByRole('checkbox').first().click(); await page.waitForTimeout(500);
    assert.equal((await stored()).reminders.find((x) => x.id === 'r3').done, true);
    assert(!has(await text(), 'Просрочено'));
  });

  await step('Друзья: список, буквы, поиск, сортировка по дате', async () => {
    await tab('Друзья');
    let t = await text();
    for (const s of ['3 человека', 'А', 'Аня Смирнова', 'сегодня', 'Игорь Ветров', 'через 3 дня', 'Мама']) assert(has(t, s), `нет «${s}»`);
    await input('Поиск по имени').fill('тюльп'); await page.waitForTimeout(500);
    t = await text(); assert(!has(t, 'Мама') && has(t, 'Никого не нашлось'), 'поиск не должен искать по цветам: ' + t.slice(0, 200));
    await input('Поиск по имени').fill('мам'); await page.waitForTimeout(500);
    t = await text(); assert(has(t, 'Мама') && !has(t, 'Игорь'), 'поиск по имени не работает: ' + t.slice(0, 200));
    await input('Поиск по имени').fill('smirnova'); await page.waitForTimeout(500);
    t = await text(); assert(has(t, 'Аня Смирнова') && !has(t, 'Игорь'), 'поиск латиницей не работает: ' + t.slice(0, 200));
    await input('Поиск по имени').fill('bujhm'); await page.waitForTimeout(500);
    t = await text(); assert(has(t, 'Игорь Ветров') && !has(t, 'Аня'), 'поиск в другой раскладке не работает: ' + t.slice(0, 200));
    await input('Поиск по имени').fill(''); await page.waitForTimeout(300);
    await page.getByText('Скоро день рождения').click(); await page.waitForTimeout(400);
    t = await text(); assert(t.indexOf('Аня Смирнова') < t.indexOf('Игорь Ветров') && t.indexOf('Игорь Ветров') < t.indexOf('Мама'));
    await shot('friends');
  });

  await step('Друзья: долгое нажатие — режим выбора, корзина удаляет с подтверждением', async () => {
    await page.getByText('По имени', { exact: true }).click(); await page.waitForTimeout(300);
    const row = page.getByText('Мама', { exact: true }).last(); const box = await row.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.waitForTimeout(700); await page.mouse.up(); await page.waitForTimeout(400);
    let t = await text(); assert(has(t, 'Выбрано: 1') || (await page.getByLabel('Удалить выбранных').count()) > 0, 'режим выбора не включился: ' + t.slice(0, 200));
    await tap(page.getByText('Игорь Ветров')); await page.waitForTimeout(300);
    assert(await page.getByLabel('Выбрано: 2').count(), 'второй не отметился');
    await tap(page.getByText('Игорь Ветров')); await page.waitForTimeout(300);
    // Колокольчик: выключить уведомления у Мамы, выделение снимается; затем выделить её снова и удалить.
    await tap(page.getByLabel('Выключить уведомления')); await page.waitForTimeout(400);
    assert.equal((await stored()).friends.find((x) => x.id === 'c').muted, true, 'уведомления не выключились');
    assert.equal(await page.getByLabel('Удалить выбранных').count(), 0, 'выделение должно сняться');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.waitForTimeout(700); await page.mouse.up(); await page.waitForTimeout(400);
    await tap(page.getByLabel('Удалить выбранных')); await page.waitForTimeout(600);
    t = await text(); assert(!has(t, 'Мама') && has(t, 'Игорь Ветров') && has(t, '2 человека'), 'Мама не удалилась: ' + t.slice(0, 200));
    assert(!(await stored()).friends.some((f) => f.id === 'c'));
    await shot('friends-selection');
  });
  await step('Карточка друга: связь, предпочтения, даты, напоминания', async () => {
    await tap(page.getByText('Аня Смирнова')); await page.waitForTimeout(900);
    const t = await text();
    for (const s of ['Аня Смирнова', '31 год', 'сегодня', 'Позвонить', 'Telegram', 'WhatsApp', 'Еда', 'Суши, тирамису', 'Цветы', 'Пионы', 'Подарки', 'Заметки', 'Важные даты', 'Познакомились', 'каждый год', 'Напоминания', 'Купить цветы — Аня']) assert(has(t, s), `нет «${s}»`);
    assert(!has(t, 'Viber'), 'Viber не должен показываться без номера');
    await shot('friend');
  });
  await step('Карточка друга: звезда в шапке — в избранное, в списке выше остальных', async () => {
    await tap(page.getByLabel('В избранное')); await page.waitForTimeout(400);
    assert.equal((await stored()).friends.find((x) => x.id === 'a').favorite, true);
    assert(await page.getByLabel('Убрать из избранного').count(), 'звезда не переключилась');
    await page.goBack(); await page.waitForTimeout(800);
    await page.getByText('По имени', { exact: true }).click(); await page.waitForTimeout(400);
    let t = await text();
    assert(has(t, 'Избранные') && t.indexOf('Избранные') < t.indexOf('Аня Смирнова') && t.indexOf('Аня Смирнова') < t.indexOf('Игорь Ветров'), t.slice(0, 300));
    await shot('friends-favorites');
    await page.getByText('Скоро день рождения').click(); await page.waitForTimeout(400);
    t = await text(); assert(has(t, 'Избранные') && has(t, 'Остальные'), t.slice(0, 300));
    await tap(page.getByText('Аня Смирнова')); await page.waitForTimeout(900);
  });
  await step('Карточка друга → «Добавить» напоминание с выбранным другом', async () => {
    await tap(page.getByText('Добавить', { exact: true })); await page.waitForTimeout(900);
    assert(has(await text(), 'Новое напоминание'));
    assert(await input('Например, написать Аня Смирнова').count(), 'друг не подставлен');
    const chips = await text(); assert(chips.indexOf('Для себя') < chips.indexOf('Аня Смирнова') && chips.indexOf('Аня Смирнова') < chips.indexOf('Игорь Ветров'), 'избранная не первая среди чипов');
    await page.goBack(); await page.waitForTimeout(600);
  });

  await step('Новый друг: имя, дата цифрами, год неизвестен, телефон, дата-событие', async () => {
    await go('/friend/edit');
    await input('Например, Аня').fill('Пётр Тестов');
    // Три поля: курсор сам переходит дальше, год можно стереть — дата остаётся без года.
    await input('ДД').first().click(); await page.keyboard.type('1503'); await page.waitForTimeout(200);
    assert.equal(await input('ММ').first().inputValue(), '03', 'курсор не перешёл в месяц');
    await page.keyboard.type('1990'); await page.waitForTimeout(200);
    assert.equal(await input('Год').first().inputValue(), '1990', 'курсор не перешёл в год');
    await input('Год').first().fill(''); await page.waitForTimeout(200);
    await input('Год').first().fill('2001'); await page.waitForTimeout(200);
    await input('+7…').fill('+375 29 111-00-11');
    await input('Любит суши, не ест острое…').fill('Пицца');
    await page.getByText('Свадьба').click(); await page.waitForTimeout(400);
    assert(has(await text(), 'Повторять каждый год'));
    await page.getByText('Сохранить', { exact: true }).click(); await page.waitForTimeout(900);
    const f = (await stored()).friends.find((x) => x.name === 'Пётр Тестов');
    assert(f && f.birthday === '2001-03-15' && f.phone === '+375 29 111-00-11' && f.food === 'Пицца' && f.dates.length === 1 && f.dates[0].title === 'Свадьба');
  });
  await step('Друг: редактирование и удаление', async () => {
    await go('/friends');
    await tap(page.getByText('Пётр Тестов')); await page.waitForTimeout(900);
    await tap(page.getByLabel('Изменить')); await page.waitForTimeout(900);
    await input('Например, Аня').fill('Пётр Тестов Второй');
    await tap(page.getByText('Готово')); await page.waitForTimeout(900);
    assert(has(await text(), 'Пётр Тестов Второй'));
    await tap(page.getByLabel('Изменить')); await page.waitForTimeout(900);
    await tap(page.getByText('Удалить друга')); await page.waitForTimeout(1200);
    assert(!(await stored()).friends.some((x) => x.name.startsWith('Пётр')), 'друг не удалён');
  });

  await step('Напоминание: шаблон, друг, дата/время цифрами, повтор каждую неделю', async () => {
    await go('/reminders');
    await page.getByLabel('Новое напоминание').click(); await page.waitForTimeout(900);
    await page.getByText('Оплатить счета').click();
    await page.getByText('Игорь Ветров').click(); await page.waitForTimeout(300);
    await page.getByText('Позвонить', { exact: true }).click(); await page.waitForTimeout(200);
    const d = input('ДД.ММ.ГГГГ'); await d.click(); await d.fill(''); await d.pressSequentially('20112026');
    const tm = input('ЧЧ:ММ'); await tm.click(); await tm.fill(''); await tm.pressSequentially('0930');
    await page.getByText('Каждую неделю').click();
    await page.getByText('Сохранить', { exact: true }).click(); await page.waitForTimeout(900);
    const r = (await stored()).reminders.find((x) => x.title === 'Позвонить — Игорь Ветров');
    assert(r, 'напоминание не сохранилось');
    assert.equal(r.date, '2026-11-20'); assert.equal(r.time, '09:30'); assert.deepEqual(r.repeat, { every: 1, unit: 'week' }); assert.equal(r.friendId, 'b');
    const t = await text(); assert(has(t, 'Повторяющиеся') && has(t, 'Позвонить — Игорь Ветров') && has(t, 'каждую неделю'), t.slice(0, 300));
  });
  await step('Напоминание: свой интервал и «напомнить заранее»', async () => {
    await page.getByLabel('Новое напоминание').click(); await page.waitForTimeout(900);
    await input('Например, сдать отчёт').fill('Сдать проект');
    await page.getByText('За 3 дня').click();
    await page.getByText('Сохранить', { exact: true }).click(); await page.waitForTimeout(900);
    let r = (await stored()).reminders.find((x) => x.title === 'Сдать проект');
    assert(r && r.advance === 4320 && r.repeat === null && r.friendId === null);
    await page.getByText('Сдать проект').click(); await page.waitForTimeout(900);
    await page.getByText('Свой…').click(); await page.waitForTimeout(300);
    await page.getByText('недели', { exact: true }).click();
    await page.getByText('Сохранить', { exact: true }).click(); await page.waitForTimeout(900);
    r = (await stored()).reminders.find((x) => x.title === 'Сдать проект');
    assert.deepEqual(r.repeat, { every: 3, unit: 'week' });
    assert(has(await text(), 'каждые 3 недели'));
  });
  await step('Напоминания: фильтры и сделанные', async () => {
    await page.getByText('Сделанные').click(); await page.waitForTimeout(400);
    let t = await text(); assert(has(t, 'Написать Диме') && has(t, 'Сделано'), t.slice(0, 300));
    await page.getByText('Для себя').click(); await page.waitForTimeout(400);
    t = await text(); assert(has(t, 'Сдать проект') && !has(t, 'Игорь Ветров'));
    await page.getByText('Друзья', { exact: true }).first().click(); await page.waitForTimeout(400);
    t = await text(); assert(has(t, 'Игорь Ветров') && !has(t, 'Сдать проект'));
    await shot('reminders');
  });

  await step('Импорт: пример контактов, фильтры, выбрать все, добавить, дубликаты', async () => {
    await go('/import');
    let t = await text();
    for (const s of ['Это пример', 'Все · 8', 'С номером · 8', 'С днём рождения · 5', 'Алина Смирнова', 'Уже есть: Аня Смирнова']) assert(has(t, s), `нет «${s}»`);
    await page.getByText('С днём рождения · 5').click(); await page.waitForTimeout(300);
    t = await text(); assert(!has(t, 'Вика'), 'фильтр не сработал');
    await page.getByText('Все · 8').click(); await page.waitForTimeout(300);
    await page.getByText('Выбрать все').click(); await page.waitForTimeout(300);
    t = await text(); assert(has(t, 'Выбрано 7 из 8'), 'ожидали 7 выбранных (одна — дубликат): ' + t.slice(0, 200));
    await page.getByText(/^Добавить 7/).click(); await page.waitForTimeout(1200);
    const d = await stored();
    assert.equal(d.friends.length, 2 + 7); // двое остались после удаления Мамы в сценарии выбора
    const dima = d.friends.find((f) => f.name === 'Дима Петров');
    assert(dima && dima.birthday === '1993-12-30' && dima.dates.length === 1, 'даты из контактов не перенесены');
    const boris = d.friends.find((f) => f.name === 'Борис Ким');
    assert(boris && boris.birthday === '1904-09-03', 'день рождения без года');
    const serg = d.friends.find((f) => f.name === 'Серёжа Волков');
    assert(serg && serg.telegramId === 444 && serg.viber === '79253334455', 'мессенджеры не перенесены');
  });

  await step('Напоминание: выбор друга через окно с поиском (когда друзей много)', async () => {
    await go('/reminders');
    await page.getByLabel('Новое напоминание').click(); await page.waitForTimeout(900);
    await input('Например, сдать отчёт').fill('Поздравить');
    await page.getByText('Выбрать друга').click(); await page.waitForTimeout(600);
    await input('Имя').fill('дим'); await page.waitForTimeout(300);
    let t = await text(); assert(has(t, 'Дима Петров') && !has(t, 'Алина'), 'поиск в окне: ' + t.slice(0, 200));
    await tap(page.getByText('Дима Петров')); await page.waitForTimeout(600);
    t = await text(); assert(has(t, 'Дима Петров') && has(t, 'Другой друг'), 'выбранный друг не показан чипом');
    await page.getByText('Сохранить', { exact: true }).click(); await page.waitForTimeout(900);
    const d = await stored();
    const r = d.reminders.find((x) => x.title === 'Поздравить');
    const dima = d.friends.find((f) => f.name === 'Дима Петров');
    assert(r && dima && r.friendId === dima.id, 'друг не привязан');
  });

  await step('Настройки: тёмная тема, акцент для тёмной и светлой', async () => {
    await go('/settings');
    await page.getByText('Тёмная').click(); await page.waitForTimeout(500);
    assert.equal((await stored()).settings.theme, 'dark');
    await page.getByLabel('Слива').last().click(); await page.waitForTimeout(400);
    assert.equal((await stored()).settings.accentDark, 'plum');
    await shot('settings-dark');
    await go('/reminders');
    const fab = page.getByLabel('Новое напоминание');
    const bg = await fab.evaluate((el) => getComputedStyle(el).backgroundColor);
    assert.equal(bg, 'rgb(184, 138, 181)', `акцент не применился: ${bg}`);
    await shot('upcoming-dark-plum');
    await go('/settings');
    await page.getByText('Светлая').click(); await page.waitForTimeout(400);
    await page.getByLabel('Индиго').first().click(); await page.waitForTimeout(400);
    const s = (await stored()).settings; assert(s.theme === 'light' && s.accentLight === 'indigo' && s.accentDark === 'plum');
    await go('/reminders');
    const bg2 = await fab.evaluate((el) => getComputedStyle(el).backgroundColor);
    assert.equal(bg2, 'rgb(62, 90, 138)', `светлый акцент не применился: ${bg2}`);
    await shot('upcoming-light-indigo');
  });

  await step('Настройки: время уведомлений цифрами и «за день»', async () => {
    await go('/settings');
    const t = input('ЧЧ:ММ'); await t.click(); await t.fill(''); await t.pressSequentially('0845'); await page.waitForTimeout(300);
    assert.equal((await stored()).settings.eventTime, '08:45');
    await page.getByRole('switch').first().click(); await page.waitForTimeout(300);
    assert.equal((await stored()).settings.eventDayBefore, false);
  });

  await step('Настройки: «Что нового» — версия внизу, история по версиям', async () => {
    await go('/settings'); let t = await text();
    assert(has(t, 'Что нового') && has(t, `«Друзья» ${VERSION}`), t.slice(-300));
    await tap(page.getByText('Что нового', { exact: true })); await page.waitForTimeout(700);
    t = await text();
    assert(has(t, `Установлена версия ${VERSION}`) && has(t, 'установлена') && has(t, '1.0.0') && has(t, 'Первая версия'), t.slice(0, 300));
    await shot('whats-new');
  });

  await step('Шторка «Что нового» после обновления: показывает пропущенные версии, запоминает текущую', async () => {
    const old = { ...seed, settings: { ...seed.settings, lastSeenVersion: '1.12.0' } };
    const ctx2 = await browser.newContext({ ...devices['iPhone 13'], locale: 'ru-RU' });
    await ctx2.addInitScript((d) => { if (!localStorage.getItem('friends-notes/data/v1')) localStorage.setItem('friends-notes/data/v1', d); }, JSON.stringify(old));
    const p2 = await ctx2.newPage();
    const t2 = async () => (await p2.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
    await p2.goto('http://localhost:8096/'); await p2.waitForTimeout(2200);
    let t = await t2();
    assert(has(t, 'Что нового') && has(t, `обновилось до версии ${VERSION}`), t.slice(0, 300));
    assert(has(t, '1.13.0') && has(t, 'Тишина для отдельных людей') && !has(t, 'Свайп строки влево'), 'показываем только версии новее 1.12.0');
    await p2.screenshot({ path: `${out}/e2e-whats-new-sheet.png` });
    await p2.getByText('Понятно', { exact: true }).click(); await p2.waitForTimeout(700);
    t = await t2(); assert(!has(t, 'обновилось до версии'), 'шторка закрылась');
    assert.equal(JSON.parse(await p2.evaluate((k) => localStorage.getItem(k), KEY)).settings.lastSeenVersion, VERSION);
    await p2.reload(); await p2.waitForTimeout(2200);
    t = await t2(); assert(!has(t, 'обновилось до версии'), 'второй раз не показываем');
    await ctx2.close();
  });

  await step('Шторка «Что нового»: ссылка «Вся история» открывает экран истории', async () => {
    const old = { ...seed, settings: { ...seed.settings, lastSeenVersion: undefined } };
    const ctx2 = await browser.newContext({ ...devices['iPhone 13'], locale: 'ru-RU' });
    await ctx2.addInitScript((d) => { if (!localStorage.getItem('friends-notes/data/v1')) localStorage.setItem('friends-notes/data/v1', d); }, JSON.stringify(old));
    const p2 = await ctx2.newPage();
    const t2 = async () => (await p2.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
    await p2.goto('http://localhost:8096/'); await p2.waitForTimeout(2200);
    let t = await t2();
    assert(has(t, `обновилось до версии ${VERSION}.`) && !has(t, '1.16.5'), 'прошлая версия неизвестна — только текущая: ' + t.slice(0, 300));
    await p2.getByText('Вся история изменений', { exact: false }).click(); await p2.waitForTimeout(900);
    t = await t2(); assert(has(t, `Установлена версия ${VERSION}`) && has(t, '1.0.0'), t.slice(0, 300));
    await ctx2.close();
  });

  await step('Экраны Telegram и отчёта об ошибке открываются', async () => {
    await go('/telegram'); let t = await text(); assert(has(t, 'Импорт из Telegram') && has(t, 'Вход доступен только в Android-приложении'), t.slice(0, 200));
    await go('/diagnostics'); t = await text(); assert(has(t, 'Отчёт доступен только в Android-приложении'));
  });

  await step('Пустое состояние для нового пользователя', async () => {
    const ctx2 = await browser.newContext({ ...devices['iPhone 13'], locale: 'ru-RU' });
    const p2 = await ctx2.newPage();
    const t2 = async () => (await p2.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
    await p2.goto('http://localhost:8096/'); await p2.waitForTimeout(1500);
    let t = await t2(); assert(has(t, 'Пока никого'), t.slice(0, 200));
    assert(!has(t, 'обновилось до версии'), 'новой установке «Что нового» не показываем');
    assert.equal(JSON.parse(await p2.evaluate((k) => localStorage.getItem(k), KEY)).settings.lastSeenVersion, VERSION);
    await p2.getByText('Друзья', { exact: true }).last().click(); await p2.waitForTimeout(700);
    t = await t2(); assert(has(t, 'Импорт из контактов'));
    await p2.getByText('Напоминания', { exact: true }).last().click(); await p2.waitForTimeout(700);
    t = await t2(); assert(has(t, 'Напоминаний нет'));
    await p2.screenshot({ path: `${out}/e2e-empty.png` });
    await ctx2.close();
  });

  await browser.close(); srv.close();
  fs.writeFileSync(`${out}/e2e-results.txt`, results.concat(['', 'console errors:', ...errors.slice(0, 10)]).join('\n'));
  console.log(results.join('\n'));
  console.log('console errors:', errors.length, errors.slice(0, 3));
})();
