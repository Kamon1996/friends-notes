// Собирает src/lib/brandGlyphs.ts: контуры логотипов сетей из пакета simple-icons (CC0) плюс
// дорисованные вручную в том же стиле для сетей, которых там нет.
//   node scripts/brand-glyphs.js /path/to/node_modules/simple-icons
const fs = require('fs');
const path = require('path');

const pkg = process.argv[2];
if (!pkg) {
  console.error('Укажи путь к пакету simple-icons');
  process.exit(1);
}
const version = JSON.parse(fs.readFileSync(path.join(pkg, 'package.json'), 'utf8')).version;
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'socials.ts'), 'utf8');
const ids = [...src.matchAll(/\{ id: '([^']+)', name: '([^']+)'/g)].map((m) => ({ id: m[1], name: m[2] })).filter((n) => n.id !== 'site');

// Наш id → slug в simple-icons, когда они не совпадают.
const SLUG = { ok: 'odnoklassniki', weibo: 'sinaweibo', lastfm: 'lastdotfm', chesscom: 'chessdotcom' };
// В simple-icons под этим именем другая компания (Max от Cycling '74 — это не мессенджер MAX).
const SKIP_SIMPLE = new Set(['max']);
const slugOf = (n) => n.name.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, '');

/** Дорисованные вручную: заливка, сетка 24×24, как у simple-icons. */
const HAND = {
  // «in» LinkedIn
  linkedin: 'M5.6 3.8a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6zM4 9h3.2v11H4zM9.5 9h3.1v1.5c.5-.9 1.6-1.7 3.2-1.7 3.4 0 4 2.2 4 5.1V20h-3.2v-5.3c0-1.3 0-2.9-1.8-2.9s-2.1 1.4-2.1 2.8V20H9.5z',
  // пузырь с буквой M — мессенджер MAX
  max: 'M4 3h16a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-7l-4.5 3.5V18H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm3 4v8h2.1v-4.4l2.4 3h.2l2.4-3V15H16V7h-2.1l-2.4 3.1L9.1 7z',
  // пузырь с буквой T
  tenchat: 'M4 3h16a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-7l-4.5 3.5V18H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm4 4v2.2h2.9V15h2.2V9.2H16V7z',
  // четырёхлучевая звезда Дзена
  dzen: 'M12 2c.3 5.7 4.3 9.7 10 10-5.7.3-9.7 4.3-10 10-.3-5.7-4.3-9.7-10-10 5.7-.3 9.7-4.3 10-10z',
  // круг с буквой p
  pikabu: 'M12 1a11 11 0 1 1 0 22 11 11 0 0 1 0-22zM9 7v11h2.2v-4H13a3.5 3.5 0 0 0 0-7zm2.2 2.2H13a1.3 1.3 0 0 1 0 2.6h-1.8z',
  // квадрат с треугольником
  rutube: 'M5 2h14a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3zm4.5 5.5v9l7.5-4.5z',
  // буква L
  likee: 'M6 3h4v14h8v4H6z',
  // молния Yappy
  yappy: 'M13.5 2 5 13h5l-1.5 9L19 11h-5l1.5-9z',
  // круг с треугольником
  yandexmusic: 'M12 1a11 11 0 1 1 0 22 11 11 0 0 1 0-22zM9.5 7.5v9l7.5-4.5z',
  // звено цепи
  bandlink: 'M10.6 13.4a1 1 0 0 1 0-1.4l2.8-2.8a1 1 0 1 1 1.4 1.4l-2.8 2.8a1 1 0 0 1-1.4 0zM7.8 16.2a3 3 0 0 1 0-4.2l2.1-2.1-1.4-1.4-2.1 2.1a5 5 0 0 0 7 7l2.1-2.1-1.4-1.4-2.1 2.1a3 3 0 0 1-4.2 0zM16.2 7.8a3 3 0 0 1 0 4.2l-2.1 2.1 1.4 1.4 2.1-2.1a5 5 0 0 0-7-7l-2.1 2.1 1.4 1.4 2.1-2.1a3 3 0 0 1 4.2 0z',
  // пузырь с сердцем
  donationalerts: 'M12 2C6.5 2 2 5.9 2 10.7c0 2.7 1.4 5.1 3.6 6.7L5 22l4.6-2.3c.8.2 1.6.3 2.4.3 5.5 0 10-3.9 10-8.7S17.5 2 12 2zm0 13.5-3.6-3.4a2.1 2.1 0 0 1 3-3l.6.6.6-.6a2.1 2.1 0 0 1 3 3z',
  // буква t
  taplink: 'M10 4h4v4h3v3.5h-3V16c0 .8.4 1.2 1.2 1.2H17V21h-2.6c-2.9 0-4.4-1.5-4.4-4.3v-5.2H7V8h3z',
  // буква H
  hipolink: 'M5 3h4v7h6V3h4v18h-4v-7H9v7H5z',
  // открытая книга
  livelib: 'M12 6.5c-1.6-1.3-4-2-7-2-1 0-2 .1-3 .3v14c1-.2 2-.3 3-.3 3 0 5.4.7 7 2 1.6-1.3 4-2 7-2 1 0 2 .1 3 .3v-14c-1-.2-2-.3-3-.3-3 0-5.4.7-7 2zm-1 12.2c-1.6-.9-3.7-1.4-6-1.4-.4 0-.7 0-1 .1V6.6c.3 0 .6-.1 1-.1 2.3 0 4.4.5 6 1.4zm9-1.3c-.3-.1-.6-.1-1-.1-2.3 0-4.4.5-6 1.4V7.9c1.6-.9 3.7-1.4 6-1.4.4 0 .7 0 1 .1z',
};
/** Дорисованные с вырезами — рисуются по правилу evenodd. */
const EVENODD = ['max', 'tenchat', 'pikabu', 'rutube', 'yandexmusic', 'donationalerts', 'livelib'];
/** Та же эмблема, что у другой сети. */
const SAME_AS = { douyin: 'tiktok' };

const out = {};
const sources = { simple: [], hand: [], missing: [] };
for (const n of ids) {
  const slug = SLUG[n.id] ?? n.id;
  const candidates = [slug, slugOf(n)];
  let d = null;
  for (const c of SKIP_SIMPLE.has(n.id) ? [] : candidates) {
    const file = path.join(pkg, 'icons', `${c}.svg`);
    if (fs.existsSync(file)) {
      const svg = fs.readFileSync(file, 'utf8');
      d = /<path d="([^"]+)"/.exec(svg)[1];
      break;
    }
  }
  if (d) {
    out[n.id] = d;
    sources.simple.push(n.id);
  } else if (HAND[n.id]) {
    out[n.id] = HAND[n.id];
    sources.hand.push(n.id);
  } else if (SAME_AS[n.id]) {
    sources.hand.push(n.id);
  } else sources.missing.push(n.id);
}
for (const [a, b] of Object.entries(SAME_AS)) if (out[b]) out[a] = out[b];

const lines = Object.entries(out).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
const ts = `// Сгенерировано scripts/brand-glyphs.js. Не править руками.
// Эмблемы сетей: ${sources.simple.length} из simple-icons ${version} (CC0, https://simpleicons.org), ${sources.hand.length} дорисованы в том же стиле.
// Логотипы — товарные знаки своих владельцев и используются только чтобы обозначить сеть.

/** Контур эмблемы сети в сетке 24×24, заливка цветом текста. */
export const BRAND_GLYPHS: Record<string, string> = {
${lines.join('\n')}
};

/** Эмблемы с вырезами, которые рисуются по правилу evenodd. */
export const EVENODD_GLYPHS = new Set<string>(${JSON.stringify(EVENODD)});
`;
fs.writeFileSync(path.join(__dirname, '..', 'src', 'lib', 'brandGlyphs.ts'), ts);
console.log('simple-icons:', sources.simple.length, 'hand:', sources.hand.length, 'missing:', sources.missing.join(' ') || 'none');
