// Скриншоты для витрин магазинов (RuStore, Google Play и др.): экраны настоящего приложения из веб-сборки
// с демо-данными, в рамке телефона и с подписью. Без системной строки Android — так требует RuStore.
//
//   npx expo export --platform web --output-dir dist-web
//   node scripts/store-shots.js dist-web [папка для готовых = store/screenshots] [папка для сырых экранов]
//
// Сырые экраны (без рамки и подписи) нужны, чтобы посмотреть, что попало в кадр; по умолчанию — во временную папку.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const root = process.argv[2];
const out = path.resolve(process.argv[3] || path.join(__dirname, '..', 'store', 'screenshots'));
const rawDir = path.resolve(process.argv[4] || fs.mkdtempSync(path.join(os.tmpdir(), 'store-raw-')));
if (!root || !fs.existsSync(path.join(root, 'index.html'))) {
  console.error('Укажи папку веб-сборки: node scripts/store-shots.js dist-web');
  process.exit(2);
}
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(rawDir, { recursive: true });

// ---------- Замороженное время: четверг, 12 ноября 2026 ----------
const TZ = 'Europe/Moscow';
const TODAY = '2026-11-12';
const NOW = new Date(`${TODAY}T10:30:00+03:00`);
const VERSION = require('../app.json').expo.version;
const d = (n) => {
  const [y, m, dd] = TODAY.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10);
};
/** День рождения: тот же день, что через n дней, но в году y. */
const bday = (n, y) => `${y}-${d(n).slice(5)}`;

// ---------- Демо-данные: выдуманные люди ----------
const F = (o) => ({ emoji: '', phone: '', food: '', flowers: '', gifts: '', notes: '', dates: [], createdAt: 1, birthday: null, genderBy: 'manual', ...o });
const R = (o) => ({ note: '', friendId: null, time: '10:00', repeat: null, advance: 0, done: false, createdAt: 1, ...o });
const FRIENDS = [
  F({
    id: 'anya', name: 'Аня Смирнова', gender: 'f', favorite: true, birthday: bday(0, 1995), phone: '+7 916 204-18-36', telegramId: 111, whatsapp: '79162041836',
    food: 'Суши и тирамису. Не ест острое', flowers: 'Пионы и белые розы', gifts: 'Керамика, билеты в театр',
    notes: 'Любит походы и настолки. Дочку зовут Соня',
    dates: [{ id: 'd1', title: 'Годовщина свадьбы', date: `2019-${d(16).slice(5)}`, yearly: true }],
    socials: [
      { id: 's1', network: 'vk', url: 'https://vk.com/anya.smirnova', handle: 'anya.smirnova', source: 'manual' },
      { id: 's2', network: 'telegram', url: 'https://t.me/anya_smirnova', handle: 'anya_smirnova', source: 'manual' },
    ],
  }),
  F({ id: 'mama', name: 'Мама', gender: 'f', favorite: true, birthday: bday(20, 1966), phone: '+7 903 640-27-15', flowers: 'Тюльпаны', food: 'Торт «Наполеон»', gifts: 'Плед, сертификат в спа' }),
  F({ id: 'igor', name: 'Игорь Ветров', gender: 'm', birthday: bday(3, 1992), phone: '+7 925 718-09-42', viber: '79257180942', food: 'Стейки', gifts: 'Виниловые пластинки' }),
  F({ id: 'babushka', name: 'Бабушка', gender: 'f', birthday: bday(10, 1948), flowers: 'Хризантемы' }),
  F({ id: 'dima', name: 'Дима Орлов', gender: 'm', birthday: bday(25, 1990), telegramId: 222 }),
  F({ id: 'katya', name: 'Катя Ким', gender: 'f', birthday: bday(39, 1998), telegramId: 333 }),
  F({ id: 'misha', name: 'Миша Громов', gender: 'm', birthday: bday(57, 1989) }),
  F({ id: 'lena', name: 'Лена Соколова', gender: 'f', birthday: '1993-02-14' }),
  F({ id: 'nastya', name: 'Настя Белова', gender: 'f', birthday: '1996-04-12' }),
  F({ id: 'papa', name: 'Папа', gender: 'm', birthday: '1964-07-21' }),
  F({ id: 'sergey', name: 'Серёжа Волков', gender: 'm' }),
];
const AGO = (days) => NOW.getTime() - days * 86400000;
const REMINDERS = [
  R({ id: 'r1', title: 'Купить цветы — Аня', friendId: 'anya', date: d(0), time: '18:00', priority: 3, minutes: 30, createdAt: AGO(3) }),
  R({ id: 'r2', title: 'Забронировать столик', friendId: 'igor', date: d(1), time: '12:00', priority: 2, minutes: 15, createdAt: AGO(5) }),
  R({ id: 'r3', title: 'Тренировка', date: d(1), time: '19:00', repeat: { every: 1, unit: 'week', days: [1, 3, 5] }, calendar: true, minutes: 90, createdAt: AGO(30) }),
  R({ id: 'r4', title: 'Позвонить маме', friendId: 'mama', date: d(3), time: '19:00', repeat: { every: 1, unit: 'week' }, createdAt: AGO(40) }),
  R({ id: 'r5', title: 'Стоматолог', date: d(5), time: '15:00', kind: 'at', calendar: true, advances: [120, 1440], minutes: 60, createdAt: AGO(6) }),
  R({ id: 'r6', title: 'Подарок бабушке', friendId: 'babushka', date: d(8), time: '10:00', priority: 2, createdAt: AGO(2) }),
  R({ id: 'r7', title: 'Оплатить интернет', date: d(13), time: '10:00', repeat: { every: 1, unit: 'month' }, advance: 1440, createdAt: AGO(50) }),
  R({ id: 'r8', title: 'Встреча выпускников', date: d(16), time: '18:30', kind: 'at', calendar: true, advance: 1440, createdAt: AGO(10) }),
  R({ id: 'r9', title: 'Забрать торт', friendId: 'anya', date: d(0), time: '09:00', done: true, doneAt: NOW.getTime() - 3600000, createdAt: AGO(2) }),
];
const SETTINGS = {
  eventTime: '10:00', eventDayBefore: true, theme: 'light', accentLight: 'terracotta', accentDark: 'eucalyptus', crashReports: true,
  lastSeenVersion: VERSION, holidayCountries: ['RU'], lastBackupAt: new Date(NOW.getTime() - 2 * 86400000).toISOString(),
};
const seed = (settings = {}) => ({ version: 1, settings: { ...SETTINGS, ...settings }, friends: FRIENDS, reminders: REMINDERS });

// ---------- Кадры ----------
// title — крупная подпись (до двух строк), sub — строка под ней; tone — фон кадра; act — что сделать на экране перед снимком.
const SHOTS = [
  {
    name: '01-birthdays', url: '/friends', tone: 'brand',
    title: 'Дни рождения близких\nвсегда под рукой', sub: 'Кто празднует сегодня и на этой неделе',
    act: async (p) => { await p.getByText('Скоро день рождения', { exact: true }).click(); },
  },
  {
    name: '02-friend', url: '/friend/anya', tone: 'cream',
    title: 'Всё о человеке\nв одной карточке', sub: 'Любимая еда, цветы, идеи подарков, заметки',
  },
  {
    name: '03-calendar', url: '/calendar', tone: 'brand',
    title: 'Календарь дней\nрождения и встреч', sub: 'Важные даты, записи и праздники по дням',
  },
  {
    name: '04-reminders', url: '/', tone: 'cream',
    title: 'Напоминания\nо важных делах', sub: 'Срок, важность, повтор по дням недели',
  },
  {
    // Импорт — сразу после главного: снимает вопрос «неужели всех вводить руками».
    name: '05-import', url: '/import', tone: 'brand',
    title: 'Импорт из контактов\nза минуту', sub: 'С днями рождения и фото. Из Telegram — тоже',
  },
  {
    name: '06-advance', url: '/reminder/edit?id=r5', tone: 'cream',
    title: 'Напомнит заранее:\nза день и за два часа', sub: 'Разовые дела, встречи и повторы',
  },
  {
    name: '07-dark', url: '/appearance', tone: 'dark', settings: { theme: 'dark' },
    title: 'Тёмная тема\nи шесть цветов', sub: 'Оформление на свой вкус',
    // Чуть вниз: в кадре и живой пример, и выбор темы, и все шесть цветов.
    act: async (p) => {
      await p.getByText('Цвет светлой темы', { exact: true }).evaluate((el) => {
        for (let n = el.parentElement; n; n = n.parentElement) {
          if (n.scrollHeight > n.clientHeight + 40 && getComputedStyle(n).overflowY !== 'visible') { n.scrollTop = 150; break; }
        }
      });
    },
  },
  {
    name: '08-private', url: '/settings', tone: 'cream',
    title: 'Без регистрации\nи рекламы', sub: 'Записи хранятся на телефоне, копия — в файл',
    // «Резервная копия» — к самому верху экрана: остальные настройки к подписи не относятся. Экран короткий и так
    // высоко не прокручивается, поэтому под содержимое подкладываем пустое место (в кадр оно не попадает).
    act: async (p) => {
      await p.getByText('Резервная копия', { exact: true }).first().evaluate((el) => {
        let box = el.parentElement;
        while (box && !(box.scrollHeight > box.clientHeight + 40 && getComputedStyle(box).overflowY !== 'visible')) box = box.parentElement;
        if (!box) return;
        const spacer = document.createElement('div');
        spacer.style.cssText = 'height:400px;flex-shrink:0';
        (box.firstElementChild || box).appendChild(spacer);
        box.scrollTop += el.getBoundingClientRect().top - box.getBoundingClientRect().top - 28;
      });
    },
  },
];

const types = { '.js': 'application/javascript', '.html': 'text/html', '.ico': 'image/x-icon', '.png': 'image/png', '.ttf': 'font/ttf', '.json': 'application/json' };
const absRoot = path.resolve(root);
const server = http.createServer((req, res) => {
  let p = path.resolve(absRoot, `.${decodeURIComponent(req.url.split('?')[0])}`);
  if (!p.startsWith(absRoot + path.sep) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(absRoot, 'index.html');
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});

// Экран приложения: 384×832 точек (как современный телефон 9:19,5), снимаем втрое плотнее — в рамке он чёткий.
const SCREEN = { width: 384, height: 832 };

async function capture(browser, port, shot) {
  const ctx = await browser.newContext({ viewport: SCREEN, deviceScaleFactor: 3, locale: 'ru-RU', timezoneId: TZ, colorScheme: shot.settings?.theme === 'dark' ? 'dark' : 'light', hasTouch: true, isMobile: true });
  await ctx.clock.install({ time: NOW });
  // Демо-данные наружу не ходят: ни определение пола, ни магия.
  await ctx.route(/api\.genderize\.io|generativelanguage\.googleapis\.com|openrouter\.ai|router\.huggingface\.co|sentry\.io/, (route) => route.abort('internetdisconnected'));
  await ctx.addInitScript(([value]) => {
    if (localStorage.getItem('friends-notes/data/v1') === null) localStorage.setItem('friends-notes/data/v1', value);
    localStorage.setItem('friends-notes/swipe-hint', '3');
    localStorage.setItem('friends-notes/sample-quiet', '1');
  }, [JSON.stringify(seed(shot.settings))]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://localhost:${port}${shot.url}`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  if (shot.act) {
    try {
      await shot.act(page);
    } catch (e) {
      console.log(`${shot.name}: шаг не вышел — ${e.message.split('\n')[0]}`);
    }
    await page.waitForTimeout(900);
  }
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  const file = path.join(rawDir, `${shot.name}.png`);
  await page.screenshot({ path: file });
  if (errors.length) console.log(`${shot.name}: ошибки в приложении — ${errors.join(' | ')}`);
  await ctx.close();
  return file;
}

// ---------- Кадр витрины: фон, подпись, телефон ----------
// Шрифты приложения (Lora и Golos Text) вшиваем в страницу: файл с диска пустая страница не загрузит.
const FONT = (pkg, file) => `data:font/ttf;base64,${fs.readFileSync(path.join(__dirname, '..', 'node_modules', '@expo-google-fonts', pkg, file)).toString('base64')}`;
const TONES = {
  // Фон в цветах значка приложения: от терракоты к розе.
  brand: { bg: 'linear-gradient(160deg, #E0714A 0%, #D45A55 48%, #C0446B 100%)', title: '#FFFFFF', sub: 'rgba(255,255,255,0.86)', bezel: '#2A211D', glow: 'rgba(60,20,20,0.35)' },
  cream: { bg: 'linear-gradient(170deg, #FBF4EA 0%, #F3E6D6 100%)', title: '#2B211C', sub: '#7A685C', bezel: '#2A211D', glow: 'rgba(90,60,40,0.28)' },
  dark: { bg: 'linear-gradient(165deg, #1F2A25 0%, #14110F 70%)', title: '#F4EDE4', sub: 'rgba(244,237,228,0.72)', bezel: '#3A3430', glow: 'rgba(0,0,0,0.55)' },
};
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function frameHtml(shot, rawFile, size) {
  const t = TONES[shot.tone];
  const img = `data:image/png;base64,${fs.readFileSync(rawFile).toString('base64')}`;
  // Телефон шире кадра не делаем: 820 px экрана + рамка. Он уходит за нижний край — так интерфейс крупнее и читается в ленте магазина.
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>
    @font-face { font-family: Lora; src: url(${FONT('lora', '600SemiBold/Lora_600SemiBold.ttf')}) format('truetype'); font-weight: 600; }
    @font-face { font-family: Golos; src: url(${FONT('golos-text', '500Medium/GolosText_500Medium.ttf')}) format('truetype'); font-weight: 500; }
    * { box-sizing: border-box; margin: 0; }
    html, body { width: 1080px; height: 1920px; overflow: hidden; }
    body { background: ${t.bg}; position: relative; }
    header { position: absolute; left: 0; right: 0; top: 0; height: 436px; padding: 34px 60px 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 26px; }
    h1 { font: 600 ${size.title}px/1.12 Lora, serif; letter-spacing: -1px; color: ${t.title}; white-space: pre; text-align: center; }
    p { font: 500 ${size.sub}px/1.3 Golos, sans-serif; color: ${t.sub}; white-space: nowrap; text-align: center; }
    .phone { position: absolute; left: 50%; top: 436px; width: 856px; margin-left: -428px; padding: 18px; border-radius: 84px; background: ${t.bezel}; box-shadow: 0 40px 90px ${t.glow}, inset 0 0 0 2px rgba(255,255,255,0.08); }
    .phone img { display: block; width: 820px; border-radius: 66px; }
  </style></head><body>
    <header><h1>${esc(shot.title)}</h1><p>${esc(shot.sub)}</p></header>
    <div class="phone"><img src="${img}" alt=""></div>
  </body></html>`;
}

/**
 * Размер подписей — один на весь набор: самую длинную строку вписываем в поля кадра, и под неё равняются остальные.
 * Иначе заголовки соседних кадров выходят разной величины, и лента смотрится неряшливо.
 */
async function captionSize(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1080, height: 1920 } });
  const page = await ctx.newPage();
  const lines = (key) => SHOTS.flatMap((x) => x[key].split('\n'));
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
    @font-face { font-family: Lora; src: url(${FONT('lora', '600SemiBold/Lora_600SemiBold.ttf')}) format('truetype'); font-weight: 600; }
    @font-face { font-family: Golos; src: url(${FONT('golos-text', '500Medium/GolosText_500Medium.ttf')}) format('truetype'); font-weight: 500; }
    span { white-space: pre; position: absolute; }
    .t { font: 600 84px Lora; letter-spacing: -1px; } .s { font: 500 40px Golos; }
  </style>${lines('title').map((l) => `<span class="t">${esc(l)}</span>`).join('')}${lines('sub').map((l) => `<span class="s">${esc(l)}</span>`).join('')}`);
  const widest = await page.evaluate(async () => {
    await Promise.all([document.fonts.load('600 84px Lora'), document.fonts.load('500 40px Golos')]);
    await document.fonts.ready;
    const max = (sel) => Math.max(...[...document.querySelectorAll(sel)].map((el) => el.getBoundingClientRect().width));
    return { title: max('.t'), sub: max('.s') };
  });
  await ctx.close();
  const MAX = 944; // ширина кадра минус поля
  return { title: Math.floor(84 * Math.min(1, MAX / widest.title)), sub: Math.floor(40 * Math.min(1, MAX / widest.sub)) };
}

(async () => {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();
  const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
  const size = await captionSize(browser);
  for (const shot of SHOTS) {
    if (only && !only.some((x) => shot.name.includes(x))) continue;
    const raw = await capture(browser, port, shot);
    const ctx = await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.setContent(frameHtml(shot, raw, size), { waitUntil: 'load' });
    await page.evaluate(async () => {
      await Promise.all([document.fonts.load('600 84px Lora'), document.fonts.load('500 40px Golos')]);
      await document.fonts.ready;
    });
    await page.screenshot({ path: path.join(out, `${shot.name}.png`) });
    await ctx.close();
    console.log(`${shot.name}.png`);
  }
  await browser.close();
  server.close();
  console.log(`Готово: ${out}\nСырые экраны: ${rawDir}`);
})();
