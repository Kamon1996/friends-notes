import type { IconName } from '@/components/Icon';
import type { SocialLink } from './types';

/** Группы каталога — для экрана «Какая сеть?». */
export const NETWORK_GROUPS = [
  ['popular', 'Популярные'],
  ['video', 'Видео и стримы'],
  ['music', 'Музыка и подкасты'],
  ['art', 'Творчество и фото'],
  ['work', 'Работа и код'],
  ['games', 'Игры'],
  ['support', 'Поддержка и донаты'],
  ['sites', 'Визитки и сайты'],
  ['asia', 'Азия и мессенджеры'],
  ['hobby', 'Спорт, книги, кино'],
] as const;
export type NetworkGroup = (typeof NETWORK_GROUPS)[number][0];

export interface Network {
  id: string;
  name: string;
  group: NetworkGroup;
  /** Домены, по которым узнаём ссылку (вместе с поддоменами). */
  domains: string[];
  /** Адрес профиля по нику; нет — у сети нет ссылок на профиль, храним только ник. */
  profile?: (handle: string) => string;
  /** Как достать ник из пути ссылки (группа 1); нет — обычный `/ник` или `/@ник`. */
  path?: RegExp;
  /** Ник — первая часть домена: ник.livejournal.com. */
  subdomain?: boolean;
  /** Свой значок; без него на чипе монограмма. */
  icon?: IconName;
  /** Показывать в восьми частых при вводе ника. */
  top?: boolean;
}

const simple = (base: string, at = false) => (h: string) => `https://${base}/${at ? '@' : ''}${h}`;
const prefixed = (base: string, prefix: string) => (h: string) => `https://${base}/${prefix}/${h}`;
const sub = (base: string) => (h: string) => `https://${h}.${base}`;
const P = (prefix: string) => new RegExp(`^/${prefix}/@?([^/?#]+)`, 'i');

/** Каталог сетей: популярные в России и в мире. Всё, чего тут нет, сохраняется как «Сайт». */
export const NETWORKS: Network[] = [
  { id: 'telegram', name: 'Telegram', group: 'popular', domains: ['t.me', 'telegram.me', 'telegram.dog'], profile: simple('t.me'), icon: 'send', top: true },
  { id: 'instagram', name: 'Instagram', group: 'popular', domains: ['instagram.com', 'instagr.am'], profile: simple('instagram.com'), icon: 'instagram', top: true },
  { id: 'tiktok', name: 'TikTok', group: 'popular', domains: ['tiktok.com'], profile: simple('tiktok.com', true), icon: 'tiktok', top: true },
  { id: 'youtube', name: 'YouTube', group: 'popular', domains: ['youtube.com', 'youtu.be'], profile: simple('youtube.com', true), path: /^\/(?:@|c\/|user\/|channel\/)?([^/?#]+)/i, icon: 'youtube', top: true },
  { id: 'vk', name: 'VK', group: 'popular', domains: ['vk.com', 'vk.ru'], profile: simple('vk.com'), icon: 'vk', top: true },
  { id: 'ok', name: 'Одноклассники', group: 'popular', domains: ['ok.ru'], profile: simple('ok.ru'), path: /^\/(?:profile\/)?([^/?#]+)/i },
  { id: 'facebook', name: 'Facebook', group: 'popular', domains: ['facebook.com', 'fb.com', 'fb.me'], profile: simple('facebook.com'), icon: 'facebook' },
  { id: 'x', name: 'X (Twitter)', group: 'popular', domains: ['x.com', 'twitter.com'], profile: simple('x.com'), icon: 'x', top: true },
  { id: 'threads', name: 'Threads', group: 'popular', domains: ['threads.net', 'threads.com'], profile: simple('threads.net', true), top: true },
  { id: 'snapchat', name: 'Snapchat', group: 'popular', domains: ['snapchat.com'], profile: prefixed('snapchat.com', 'add'), path: P('add') },
  { id: 'pinterest', name: 'Pinterest', group: 'popular', domains: ['pinterest.com', 'pin.it', 'pinterest.ru'], profile: simple('pinterest.com'), icon: 'pinterest', top: true },
  { id: 'reddit', name: 'Reddit', group: 'popular', domains: ['reddit.com'], profile: prefixed('reddit.com', 'u'), path: /^\/(?:u|user)\/([^/?#]+)/i },
  { id: 'linkedin', name: 'LinkedIn', group: 'popular', domains: ['linkedin.com', 'lnkd.in'], profile: prefixed('linkedin.com', 'in'), path: P('in'), icon: 'linkedin' },
  { id: 'max', name: 'MAX', group: 'popular', domains: ['max.ru'], profile: simple('max.ru') },
  { id: 'tenchat', name: 'TenChat', group: 'popular', domains: ['tenchat.ru'], profile: simple('tenchat.ru') },
  { id: 'dzen', name: 'Дзен', group: 'popular', domains: ['dzen.ru', 'zen.yandex.ru'], profile: simple('dzen.ru'), path: /^\/(?:id\/)?([^/?#]+)/i },
  { id: 'pikabu', name: 'Пикабу', group: 'popular', domains: ['pikabu.ru'], profile: simple('pikabu.ru', true) },
  { id: 'habr', name: 'Хабр', group: 'popular', domains: ['habr.com'], profile: (h) => `https://habr.com/ru/users/${h}`, path: /^\/(?:[a-z]{2}\/)?users\/([^/?#]+)/i },
  { id: 'livejournal', name: 'LiveJournal', group: 'popular', domains: ['livejournal.com'], profile: sub('livejournal.com'), subdomain: true },
  { id: 'tumblr', name: 'Tumblr', group: 'popular', domains: ['tumblr.com'], profile: sub('tumblr.com'), subdomain: true },
  { id: 'mastodon', name: 'Mastodon', group: 'popular', domains: ['mastodon.social', 'mastodon.online', 'mstdn.social', 'mastodon.world'], profile: simple('mastodon.social', true) },
  { id: 'bluesky', name: 'Bluesky', group: 'popular', domains: ['bsky.app'], profile: prefixed('bsky.app', 'profile'), path: P('profile') },
  { id: 'discord', name: 'Discord', group: 'popular', domains: ['discord.gg', 'discord.com', 'discordapp.com'], profile: simple('discord.gg') },

  { id: 'twitch', name: 'Twitch', group: 'video', domains: ['twitch.tv'], profile: simple('twitch.tv'), icon: 'twitch' },
  { id: 'kick', name: 'Kick', group: 'video', domains: ['kick.com'], profile: simple('kick.com') },
  { id: 'rutube', name: 'Rutube', group: 'video', domains: ['rutube.ru'], profile: prefixed('rutube.ru', 'channel'), path: /^\/(?:channel|u)\/([^/?#]+)/i },
  { id: 'vimeo', name: 'Vimeo', group: 'video', domains: ['vimeo.com'], profile: simple('vimeo.com') },
  { id: 'likee', name: 'Likee', group: 'video', domains: ['likee.video', 'likee.com', 'l.likee.video'], profile: simple('likee.video', true) },
  { id: 'yappy', name: 'Yappy', group: 'video', domains: ['yappy.media'], profile: prefixed('yappy.media', 'profile'), path: P('profile') },
  { id: 'bilibili', name: 'Bilibili', group: 'video', domains: ['bilibili.com', 'b23.tv'], profile: (h) => `https://space.bilibili.com/${h}` },
  { id: 'douyin', name: 'Douyin', group: 'video', domains: ['douyin.com'], profile: prefixed('douyin.com', 'user'), path: P('user') },

  { id: 'soundcloud', name: 'SoundCloud', group: 'music', domains: ['soundcloud.com'], profile: simple('soundcloud.com') },
  { id: 'spotify', name: 'Spotify', group: 'music', domains: ['spotify.com', 'spotify.link'], profile: prefixed('open.spotify.com', 'artist'), path: /^\/(?:artist|user)\/([^/?#]+)/i },
  { id: 'applemusic', name: 'Apple Music', group: 'music', domains: ['music.apple.com'], path: /\/artist\/(?:[^/?#]+\/)?(\d+)/i },
  { id: 'yandexmusic', name: 'Яндекс Музыка', group: 'music', domains: ['music.yandex.ru', 'music.yandex.com', 'music.yandex.by', 'music.yandex.kz'], profile: prefixed('music.yandex.ru', 'artist'), path: P('artist') },
  { id: 'bandcamp', name: 'Bandcamp', group: 'music', domains: ['bandcamp.com'], profile: sub('bandcamp.com'), subdomain: true },
  { id: 'lastfm', name: 'Last.fm', group: 'music', domains: ['last.fm'], profile: prefixed('last.fm', 'user'), path: P('user') },
  { id: 'deezer', name: 'Deezer', group: 'music', domains: ['deezer.com'], path: /\/artist\/(\d+)/i },
  { id: 'bandlink', name: 'band.link', group: 'music', domains: ['band.link'], profile: simple('band.link') },

  { id: 'behance', name: 'Behance', group: 'art', domains: ['behance.net'], profile: simple('behance.net'), icon: 'behance' },
  { id: 'dribbble', name: 'Dribbble', group: 'art', domains: ['dribbble.com'], profile: simple('dribbble.com') },
  { id: 'artstation', name: 'ArtStation', group: 'art', domains: ['artstation.com'], profile: simple('artstation.com') },
  { id: 'deviantart', name: 'DeviantArt', group: 'art', domains: ['deviantart.com'], profile: simple('deviantart.com') },
  { id: 'pixiv', name: 'Pixiv', group: 'art', domains: ['pixiv.net'], profile: prefixed('pixiv.net', 'users'), path: /^\/(?:[a-z]{2}\/)?users\/([^/?#]+)/i },
  { id: 'flickr', name: 'Flickr', group: 'art', domains: ['flickr.com', 'flic.kr'], profile: prefixed('flickr.com', 'people'), path: /^\/(?:people|photos)\/([^/?#]+)/i },
  { id: 'vsco', name: 'VSCO', group: 'art', domains: ['vsco.co'], profile: simple('vsco.co') },
  { id: '500px', name: '500px', group: 'art', domains: ['500px.com'], profile: prefixed('500px.com', 'p'), path: P('p') },
  { id: 'unsplash', name: 'Unsplash', group: 'art', domains: ['unsplash.com'], profile: simple('unsplash.com', true) },
  { id: 'figma', name: 'Figma', group: 'art', domains: ['figma.com'], profile: simple('figma.com', true) },

  { id: 'github', name: 'GitHub', group: 'work', domains: ['github.com'], profile: simple('github.com'), icon: 'github' },
  { id: 'gitlab', name: 'GitLab', group: 'work', domains: ['gitlab.com'], profile: simple('gitlab.com') },
  { id: 'stackoverflow', name: 'Stack Overflow', group: 'work', domains: ['stackoverflow.com'], profile: prefixed('stackoverflow.com', 'users'), path: P('users') },
  { id: 'kaggle', name: 'Kaggle', group: 'work', domains: ['kaggle.com'], profile: simple('kaggle.com') },
  { id: 'medium', name: 'Medium', group: 'work', domains: ['medium.com'], profile: simple('medium.com', true) },
  { id: 'substack', name: 'Substack', group: 'work', domains: ['substack.com'], profile: sub('substack.com'), subdomain: true },

  { id: 'steam', name: 'Steam', group: 'games', domains: ['steamcommunity.com', 'steampowered.com'], profile: prefixed('steamcommunity.com', 'id'), path: /^\/(?:id|profiles)\/([^/?#]+)/i },
  { id: 'roblox', name: 'Roblox', group: 'games', domains: ['roblox.com'], profile: prefixed('roblox.com', 'users'), path: P('users') },
  { id: 'chesscom', name: 'Chess.com', group: 'games', domains: ['chess.com'], profile: prefixed('chess.com', 'member'), path: P('member') },
  { id: 'lichess', name: 'Lichess', group: 'games', domains: ['lichess.org'], profile: prefixed('lichess.org', '@'), path: /^\/@\/([^/?#]+)/i },

  { id: 'boosty', name: 'Boosty', group: 'support', domains: ['boosty.to'], profile: simple('boosty.to') },
  { id: 'patreon', name: 'Patreon', group: 'support', domains: ['patreon.com'], profile: simple('patreon.com') },
  { id: 'donationalerts', name: 'DonationAlerts', group: 'support', domains: ['donationalerts.com', 'donationalerts.ru'], profile: prefixed('donationalerts.com', 'r'), path: P('r') },
  { id: 'kofi', name: 'Ko-fi', group: 'support', domains: ['ko-fi.com'], profile: simple('ko-fi.com') },
  { id: 'buymeacoffee', name: 'Buy Me a Coffee', group: 'support', domains: ['buymeacoffee.com'], profile: simple('buymeacoffee.com') },

  { id: 'taplink', name: 'Taplink', group: 'sites', domains: ['taplink.cc', 'taplink.ws'], profile: simple('taplink.cc') },
  { id: 'linktree', name: 'Linktree', group: 'sites', domains: ['linktr.ee'], profile: simple('linktr.ee') },
  { id: 'hipolink', name: 'Hipolink', group: 'sites', domains: ['hipolink.net', 'hipolink.me'], profile: simple('hipolink.net') },
  { id: 'carrd', name: 'Carrd', group: 'sites', domains: ['carrd.co'], profile: sub('carrd.co'), subdomain: true },

  { id: 'wechat', name: 'WeChat', group: 'asia', domains: ['weixin.qq.com', 'wechat.com'] },
  { id: 'weibo', name: 'Weibo', group: 'asia', domains: ['weibo.com', 'weibo.cn'], profile: simple('weibo.com') },
  { id: 'line', name: 'Line', group: 'asia', domains: ['line.me'], profile: (h) => `https://line.me/ti/p/~${h}`, path: /^\/ti\/p\/~?([^/?#]+)/i },
  { id: 'kakaotalk', name: 'KakaoTalk', group: 'asia', domains: ['open.kakao.com', 'kakao.com'], profile: prefixed('open.kakao.com', 'o'), path: P('o') },
  { id: 'xiaohongshu', name: 'Xiaohongshu', group: 'asia', domains: ['xiaohongshu.com', 'xhslink.com'], profile: (h) => `https://www.xiaohongshu.com/user/profile/${h}`, path: /^\/user\/profile\/([^/?#]+)/i },
  { id: 'zalo', name: 'Zalo', group: 'asia', domains: ['zalo.me'], profile: simple('zalo.me') },

  { id: 'strava', name: 'Strava', group: 'hobby', domains: ['strava.com'], profile: prefixed('strava.com', 'athletes'), path: P('athletes') },
  { id: 'letterboxd', name: 'Letterboxd', group: 'hobby', domains: ['letterboxd.com', 'boxd.it'], profile: simple('letterboxd.com') },
  { id: 'kinopoisk', name: 'Кинопоиск', group: 'hobby', domains: ['kinopoisk.ru'], profile: prefixed('kinopoisk.ru', 'user'), path: P('user') },
  { id: 'goodreads', name: 'Goodreads', group: 'hobby', domains: ['goodreads.com'], profile: simple('goodreads.com'), path: /^\/(?:user\/show\/|author\/show\/)?([^/?#]+)/i },
  { id: 'livelib', name: 'LiveLib', group: 'hobby', domains: ['livelib.ru'], profile: prefixed('livelib.ru', 'reader'), path: P('reader') },
  { id: 'myanimelist', name: 'MyAnimeList', group: 'hobby', domains: ['myanimelist.net'], profile: prefixed('myanimelist.net', 'profile'), path: P('profile') },
  { id: 'shikimori', name: 'Shikimori', group: 'hobby', domains: ['shikimori.one', 'shikimori.me'], profile: simple('shikimori.one') },
  { id: 'duolingo', name: 'Duolingo', group: 'hobby', domains: ['duolingo.com'], profile: prefixed('duolingo.com', 'profile'), path: P('profile') },
];

/** Псевдосеть для любого другого адреса. */
export const SITE: Network = { id: 'site', name: 'Сайт', group: 'sites', domains: [], icon: 'globe' };

const byId = new Map(NETWORKS.map((n) => [n.id, n]));
export const networkById = (id: string): Network => byId.get(id) ?? SITE;
export const TOP_NETWORKS = NETWORKS.filter((n) => n.top);

// ---------- разбор ввода ----------

/** Хост и путь из адреса; схему допускаем любую, без схемы — считаем https. */
function splitUrl(raw: string): { url: string; host: string; path: string } | null {
  let s = raw.trim();
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`;
  const m = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)([^?#]*)/i.exec(s);
  if (!m) return null;
  const host = m[1].replace(/^.*@/, '').replace(/:\d+$/, '').toLowerCase();
  if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(host)) return null;
  return { url: s, host, path: m[2] || '/' };
}

const stripWww = (host: string) => host.replace(/^(www|m|mobile)\./, '');

function networkForHost(host: string): Network | null {
  const h = stripWww(host);
  for (const n of NETWORKS) {
    if (n.domains.some((d) => h === d || h.endsWith('.' + d))) return n;
  }
  return null;
}

function handleFromUrl(n: Network, host: string, path: string): string | null {
  if (n.subdomain) {
    const first = host.split('.')[0];
    return first && !['www', 'm'].includes(first) && stripWww(host) !== n.domains[0] ? first : null;
  }
  const re = n.path ?? /^\/@?([^/?#]+)/;
  const m = re.exec(path);
  if (!m) return null;
  const h = decodeURIComponent(m[1]).replace(/\/+$/, '');
  // Служебные пути — не ники.
  if (/^(share|p|reel|reels|video|watch|shorts|playlist|status|posts|post|i|s|explore|wall|feed|login|signup|home|intent|hashtag|tag|groups|events|pages|stories|story|photo|album)$/i.test(h)) return null;
  return h || null;
}

/** Домен для подписи чипа «Сайт»: без www и схемы. */
export function siteLabel(url: string): string {
  const u = splitUrl(url);
  return u ? stripWww(u.host) : url;
}

export type ParsedInput =
  | { kind: 'empty' }
  | { kind: 'link'; network: Network; url: string; handle: string | null }
  | { kind: 'site'; url: string; host: string }
  | { kind: 'handle'; handle: string }
  | { kind: 'invalid' };

const HANDLE_RE = /^@?([A-Za-z0-9_][A-Za-z0-9_.-]{0,63})$/;
const FEDI_RE = /^@?([A-Za-z0-9_.-]+)@(([a-z0-9-]+\.)+[a-z]{2,})$/i;

/** Что ввёл человек в поле «Ссылка или ник». */
export function parseSocialInput(raw: string): ParsedInput {
  const s = raw.trim();
  if (!s) return { kind: 'empty' };
  const fedi = FEDI_RE.exec(s);
  if (fedi) return { kind: 'link', network: networkById('mastodon'), url: `https://${fedi[2].toLowerCase()}/@${fedi[1]}`, handle: `${fedi[1]}@${fedi[2].toLowerCase()}` };
  if (/\s/.test(s)) return { kind: 'invalid' };
  // С собачки начинается ник, даже если в нём есть точка (@katty.sh).
  const u = !s.startsWith('@') && /\.|:\/\//.test(s) ? splitUrl(s) : null;
  if (u) {
    const n = networkForHost(u.host);
    if (n) return { kind: 'link', network: n, url: u.url, handle: handleFromUrl(n, u.host, u.path) };
    return { kind: 'site', url: u.url, host: stripWww(u.host) };
  }
  const h = HANDLE_RE.exec(s);
  if (h) return { kind: 'handle', handle: h[1] };
  return { kind: 'invalid' };
}

/** Ссылка из разобранного ввода (для ника нужна выбранная сеть). */
export function linkFromInput(parsed: ParsedInput, network: Network | null, id: string, source: SocialLink['source'] = 'manual'): SocialLink | null {
  if (parsed.kind === 'link') return { id, network: parsed.network.id, url: parsed.url, handle: parsed.handle ?? undefined, source };
  if (parsed.kind === 'site') return { id, network: 'site', url: parsed.url, label: parsed.host, source };
  if (parsed.kind === 'handle' && network) {
    const url = network.profile ? network.profile(parsed.handle) : '';
    return { id, network: network.id, url, handle: parsed.handle, source };
  }
  return null;
}

/** Подпись под названием сети: @ник, домен сайта или адрес. */
export function linkSubtitle(link: SocialLink): string {
  if (link.network === 'site') return link.label || siteLabel(link.url);
  if (link.handle) return /^\d+$/.test(link.handle) ? `id ${link.handle}` : `@${link.handle.replace(/^@/, '')}`;
  return siteLabel(link.url) + (splitUrl(link.url)?.path.replace(/\/$/, '') ?? '');
}

/** Название на чипе. */
export const linkTitle = (link: SocialLink): string => (link.network === 'site' ? link.label || siteLabel(link.url) : networkById(link.network).name);

const sameKey = (l: Pick<SocialLink, 'network' | 'url' | 'handle'>) =>
  l.handle && l.network !== 'site' ? `${l.network}:${l.handle.toLowerCase()}` : `url:${l.url.toLowerCase().replace(/\/+$/, '')}`;

/** Объединение без дубликатов: ручные ссылки важнее импортированных. */
export function mergeLinks(...lists: (SocialLink[] | undefined)[]): SocialLink[] {
  const out: SocialLink[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    for (const l of list ?? []) {
      if (!l.url && !l.handle) continue;
      const k = sameKey(l);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(l);
    }
  }
  return out;
}

// ---------- ссылки из текста «О себе» ----------

const TLDS =
  'com|net|org|ru|su|by|ua|kz|me|io|co|app|tv|cc|link|ee|to|gg|fm|am|social|online|media|video|dev|pro|site|de|fr|uk|us|in|jp|cn|kr|it|es|nl|tech|shop|store|blog|xyz|one|club|art|design|photo|photos|page|live|studio|space|world|info|biz|name|moscow|life|digital|email|agency|group|team|moe|ly|be|is|ai|so|st|sh|im|ws|bio|cloud|land|fun|news|wiki|academy|school|edu|gov|cz|pl|lt|lv|ge|md|il|tr|ca|au|br|mx|pt|ch|at|se|no|fi|dk|hu|ro|rs|bg|gr|vn|th|id|ph|sg|my|hk|tw|ar|cl';
// Перед адресом — начало строки или не буква/@/точка: так «mail@example.com» и «Ivan.Petrov» не считаются ссылками.
const URL_IN_TEXT = new RegExp(
  `(^|[^\\w@.\\/-])(https?:\\/\\/[^\\s<>"'«»()\\p{Extended_Pictographic}]+|(?:[a-z0-9-]+\\.)+(?:${TLDS})(?=$|[\\s/?#,;:!)»"']|\\p{Extended_Pictographic})(?:\\/[^\\s<>"'«»()\\p{Extended_Pictographic}]*)?)`,
  'giu',
);
const MENTION_IN_TEXT = /(^|[^\w@/.])@([A-Za-z][A-Za-z0-9_]{3,31})\b/gu;

/** Ссылки и @ники из «О себе»: в блок соцсетей, остаток текста — в заметки (одни эмодзи и знаки не считаются). */
export function extractLinks(text: string, idFor: () => string, source: SocialLink['source'] = 'tg'): { links: SocialLink[]; rest: string } {
  const links: SocialLink[] = [];
  let rest = text.replace(URL_IN_TEXT, (_m, before: string, found: string) => {
    const clean = found.replace(/[.,;:!?)»"']+$/u, '');
    const parsed = parseSocialInput(clean);
    const link = linkFromInput(parsed, null, idFor(), source);
    if (link) links.push(link);
    return `${before} `;
  });
  rest = rest.replace(MENTION_IN_TEXT, (_m, before: string, handle: string) => {
    links.push({ id: idFor(), network: 'telegram', url: `https://t.me/${handle}`, handle, source });
    return before;
  });
  rest = rest.replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').trim();
  if (!/[\p{L}\p{N}]/u.test(rest)) rest = '';
  return { links: mergeLinks(links), rest };
}

/** Поиск по каталогу: по названию и доменам. */
export function searchNetworks(query: string): Network[] {
  const q = query.trim().toLowerCase();
  if (!q) return NETWORKS;
  return NETWORKS.filter((n) => n.name.toLowerCase().includes(q) || n.id.includes(q) || n.domains.some((d) => d.includes(q)));
}
