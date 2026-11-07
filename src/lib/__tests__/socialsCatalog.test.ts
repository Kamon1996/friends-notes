/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { NETWORKS, extractLinks, linkFromInput, networkById, parseSocialInput, searchNetworks } from '../socials';

const ids = () => {
  let n = 0;
  return () => `l${++n}`;
};
const net = (id: string) => NETWORKS.find((n) => n.id === id)!;

test('каждая сеть с шаблоном адреса узнаёт свою же ссылку и достаёт ник обратно', () => {
  for (const n of NETWORKS) {
    if (!n.profile) continue;
    const url = n.profile('katty_sh');
    const parsed = parseSocialInput(url);
    assert.equal(parsed.kind, 'link', `${n.id}: ${url}`);
    if (parsed.kind !== 'link') continue;
    assert.equal(parsed.network.id, n.id, `${n.id}: ссылка ${url} ушла в ${parsed.network.id}`);
    assert.equal(parsed.handle, 'katty_sh', `${n.id}: ник из ${url}`);
  }
});

test('ссылки во всех привычных формах: схема, www, m., хвосты, параметры', () => {
  const cases: [string, string, string | null][] = [
    ['https://www.instagram.com/katty.sh/', 'instagram', 'katty.sh'],
    ['instagram.com/katty.sh?igsh=abc', 'instagram', 'katty.sh'],
    ['INSTAGRAM.COM/Katty', 'instagram', 'Katty'],
    ['https://m.vk.com/katty', 'vk', 'katty'],
    ['vk.ru/id777', 'vk', 'id777'],
    ['https://ok.ru/profile/123456', 'ok', '123456'],
    ['https://t.me/katty_sh', 'telegram', 'katty_sh'],
    ['telegram.me/katty_sh', 'telegram', 'katty_sh'],
    ['https://www.tiktok.com/@katty.sh?lang=ru', 'tiktok', 'katty.sh'],
    ['https://vm.tiktok.com/ZMabc123/', 'tiktok', 'ZMabc123'],
    ['https://www.youtube.com/@katty', 'youtube', 'katty'],
    ['youtube.com/c/KattySings', 'youtube', 'KattySings'],
    ['https://youtube.com/channel/UCabc', 'youtube', 'UCabc'],
    ['https://youtu.be/dQw4w9WgXcQ', 'youtube', 'dQw4w9WgXcQ'],
    ['https://x.com/katty', 'x', 'katty'],
    ['twitter.com/katty/status/1', 'x', 'katty'],
    ['https://www.threads.net/@katty', 'threads', 'katty'],
    ['https://www.linkedin.com/in/katty-sh-123/', 'linkedin', 'katty-sh-123'],
    ['https://www.reddit.com/user/katty/', 'reddit', 'katty'],
    ['reddit.com/u/katty', 'reddit', 'katty'],
    ['https://www.snapchat.com/add/katty', 'snapchat', 'katty'],
    ['https://ru.pinterest.com/katty/', 'pinterest', 'katty'],
    ['https://www.twitch.tv/katty', 'twitch', 'katty'],
    ['https://kick.com/katty', 'kick', 'katty'],
    ['https://github.com/katty', 'github', 'katty'],
    ['https://habr.com/ru/users/katty/', 'habr', 'katty'],
    ['https://katty.livejournal.com/', 'livejournal', 'katty'],
    ['https://katty.tumblr.com', 'tumblr', 'katty'],
    ['https://katty.substack.com/', 'substack', 'katty'],
    ['https://katty.bandcamp.com/album/x', 'bandcamp', 'katty'],
    ['https://open.spotify.com/artist/1abc?si=x', 'spotify', '1abc'],
    ['https://music.yandex.ru/artist/123', 'yandexmusic', '123'],
    ['https://music.apple.com/ru/artist/katty/123456', 'applemusic', '123456'],
    ['https://soundcloud.com/katty', 'soundcloud', 'katty'],
    ['https://www.behance.net/katty', 'behance', 'katty'],
    ['https://dribbble.com/katty', 'dribbble', 'katty'],
    ['https://steamcommunity.com/id/katty', 'steam', 'katty'],
    ['https://steamcommunity.com/profiles/7656119', 'steam', '7656119'],
    ['https://boosty.to/katty', 'boosty', 'katty'],
    ['https://www.donationalerts.com/r/katty', 'donationalerts', 'katty'],
    ['https://taplink.cc/katty', 'taplink', 'katty'],
    ['https://linktr.ee/katty', 'linktree', 'katty'],
    ['https://dzen.ru/katty', 'dzen', 'katty'],
    ['https://zen.yandex.ru/id/abc', 'dzen', 'abc'],
    ['https://pikabu.ru/@katty', 'pikabu', 'katty'],
    ['https://tenchat.ru/katty', 'tenchat', 'katty'],
    ['https://max.ru/katty', 'max', 'katty'],
    ['https://rutube.ru/channel/123/', 'rutube', '123'],
    ['https://bsky.app/profile/katty.bsky.social', 'bluesky', 'katty.bsky.social'],
    ['https://mastodon.social/@katty', 'mastodon', 'katty'],
    ['https://discord.gg/abc123', 'discord', 'abc123'],
    ['https://www.strava.com/athletes/123', 'strava', '123'],
    ['https://letterboxd.com/katty/', 'letterboxd', 'katty'],
    ['https://www.kinopoisk.ru/user/123/', 'kinopoisk', '123'],
    ['https://www.goodreads.com/user/show/123-katty', 'goodreads', '123-katty'],
    ['https://myanimelist.net/profile/katty', 'myanimelist', 'katty'],
    ['https://shikimori.one/katty', 'shikimori', 'katty'],
    ['https://www.chess.com/member/katty', 'chesscom', 'katty'],
    ['https://lichess.org/@/katty', 'lichess', 'katty'],
    ['https://weibo.com/u/123', 'weibo', 'u'],
    ['https://line.me/ti/p/~katty', 'line', 'katty'],
    ['https://open.kakao.com/o/abc', 'kakaotalk', 'abc'],
    ['https://www.xiaohongshu.com/user/profile/abc', 'xiaohongshu', 'abc'],
    ['https://space.bilibili.com/123', 'bilibili', '123'],
    ['https://www.figma.com/@katty', 'figma', 'katty'],
    ['https://unsplash.com/@katty', 'unsplash', 'katty'],
    ['https://500px.com/p/katty', '500px', 'katty'],
    ['https://www.flickr.com/people/katty/', 'flickr', 'katty'],
    ['https://www.pixiv.net/en/users/123', 'pixiv', '123'],
    ['https://www.artstation.com/katty', 'artstation', 'katty'],
    ['https://www.deviantart.com/katty', 'deviantart', 'katty'],
    ['https://vsco.co/katty/gallery', 'vsco', 'katty'],
    ['https://medium.com/@katty', 'medium', 'katty'],
    ['https://gitlab.com/katty', 'gitlab', 'katty'],
    ['https://stackoverflow.com/users/123/katty', 'stackoverflow', '123'],
    ['https://www.kaggle.com/katty', 'kaggle', 'katty'],
    ['https://www.roblox.com/users/123/profile', 'roblox', '123'],
    ['https://www.patreon.com/katty', 'patreon', 'katty'],
    ['https://ko-fi.com/katty', 'kofi', 'katty'],
    ['https://buymeacoffee.com/katty', 'buymeacoffee', 'katty'],
    ['https://katty.carrd.co/', 'carrd', 'katty'],
    ['https://hipolink.net/katty', 'hipolink', 'katty'],
    ['https://band.link/9OzXo', 'bandlink', '9OzXo'],
    ['https://www.last.fm/user/katty', 'lastfm', 'katty'],
    ['https://www.deezer.com/ru/artist/123', 'deezer', '123'],
    ['https://www.duolingo.com/profile/katty', 'duolingo', 'katty'],
    ['https://www.livelib.ru/reader/katty', 'livelib', 'katty'],
    ['https://yappy.media/profile/katty', 'yappy', 'katty'],
    ['https://likee.video/@katty', 'likee', 'katty'],
    ['https://www.douyin.com/user/abc', 'douyin', 'abc'],
    ['https://vimeo.com/katty', 'vimeo', 'katty'],
    ['https://zalo.me/0901234567', 'zalo', '0901234567'],
    ['https://www.facebook.com/katty.sh', 'facebook', 'katty.sh'],
    ['fb.com/katty', 'facebook', 'katty'],
    ['https://www.weibo.com/123456', 'weibo', '123456'],
  ];
  for (const [url, network, handle] of cases) {
    const p = parseSocialInput(url);
    assert.equal(p.kind, 'link', url);
    if (p.kind !== 'link') continue;
    assert.equal(p.network.id, network, `${url} → ${p.network.id}`);
    assert.equal(p.handle, handle, `${url}: ник ${p.handle}`);
  }
});

test('посты, видео и служебные страницы — ссылка на сеть без ника', () => {
  for (const url of ['https://www.instagram.com/p/Cx1abc/', 'https://www.instagram.com/reel/abc/', 'https://vk.com/wall-1_2', 'https://www.youtube.com/watch?v=abc', 'https://x.com/i/status/1']) {
    const p = parseSocialInput(url);
    assert.equal(p.kind, 'link', url);
    if (p.kind === 'link') assert.equal(p.handle, null, url);
  }
});

test('«О себе»: подписи «tg: ник», «tg - @ник», «telegram — ник» и сокращения других сетей', () => {
  const cases: [string, string[], string?][] = [
    ['tg: test', ['telegram:test']],
    ['tg: @test', ['telegram:test']],
    ['tg - test', ['telegram:test']],
    ['tg — @test', ['telegram:test']],
    ['telegram - test', ['telegram:test']],
    ['Telegram: @Test_1', ['telegram:Test_1']],
    ['тг: test', ['telegram:test']],
    ['телега @test', ['telegram:test']],
    ['TG:test', ['telegram:test']],
    ['inst: katty.sh', ['instagram:katty.sh']],
    ['insta - @katty', ['instagram:katty']],
    ['ig: katty', ['instagram:katty']],
    ['инста: katty', ['instagram:katty']],
    ['Инстаграм — katty', ['instagram:katty']],
    ['vk: id123', ['vk:id123']],
    ['вк - katty', ['vk:katty']],
    ['tt: @katty', ['tiktok:katty']],
    ['тикток: katty', ['tiktok:katty']],
    ['yt: katty', ['youtube:katty']],
    ['ютуб - katty', ['youtube:katty']],
    ['fb: katty', ['facebook:katty']],
    ['twitter: katty', ['x:katty']],
    ['x: katty', ['x:katty']],
    ['ds: katty', ['discord:katty']],
    ['дискорд: katty', ['discord:katty']],
    ['twitch: katty', ['twitch:katty']],
    ['snap: katty', ['snapchat:katty']],
    ['sc: katty', ['snapchat:katty']],
    ['жж: katty', ['livejournal:katty']],
    ['gh: katty', ['github:katty']],
    ['steam: katty', ['steam:katty']],
    ['бусти: katty', ['boosty:katty']],
    ['дзен: katty', ['dzen:katty']],
    ['threads: katty', ['threads:katty']],
    ['bsky: katty.bsky.social', ['bluesky:katty.bsky.social']],
    ['wechat: katty', ['wechat:katty']],
    ['line: katty', ['line:katty']],
    ['макс: katty', ['max:katty']],
    ['tg: anna, inst: anna.k | vk: id1', ['telegram:anna', 'instagram:anna.k', 'vk:id1']],
    ['tg: anna\ninst: anna_k', ['telegram:anna', 'instagram:anna_k']],
    ['tg: a', [], 'ник короче двух символов не считаем'],
    ['Пишите в tg: katty.', ['telegram:katty']],
  ];
  for (const [text, expected] of cases) {
    const { links } = extractLinks(text, ids());
    assert.deepEqual(links.map((l) => `${l.network}:${l.handle}`), expected, text);
  }
});

test('«О себе»: ссылка после подписи важнее подписи, подпись без ника не остаётся в заметках', () => {
  const r = extractLinks('inst: instagram.com/katty.sh, tg: @katty', ids());
  assert.deepEqual(r.links.map((l) => `${l.network}:${l.handle}`), ['instagram:katty.sh', 'telegram:katty']);
  assert.equal(r.rest, '');
  const r2 = extractLinks('певица. inst: katty · ищу барабанщика', ids());
  assert.deepEqual(r2.links.map((l) => `${l.network}:${l.handle}`), ['instagram:katty']);
  assert.equal(r2.rest, 'певица. · ищу барабанщика');
});

test('«О себе»: что не должно считаться ссылкой или ником', () => {
  const cases = ['pin: 1234', 'ok, пишите', 'line of work: dev', 'x: 2 + y', 'так себе: день', 'be: happy', 'in: Moscow', 'Иван.Петров рядом', 'e.g. такое', 'мой e-mail katty@mail.ru'];
  for (const text of cases) {
    const { links } = extractLinks(text, ids());
    assert.deepEqual(links, [], text);
  }
  assert.deepEqual(extractLinks('вк: 12345', ids()).links, [], 'в нике нужна хотя бы одна буква');
});

test('ник с сетью: адрес по шаблону сети, у сетей без страниц только ник', () => {
  const next = ids();
  const tg = linkFromInput({ kind: 'handle', handle: 'katty' }, net('telegram'), next());
  assert.equal(tg?.url, 'https://t.me/katty');
  const ok = linkFromInput({ kind: 'handle', handle: 'katty' }, net('ok'), next());
  assert.equal(ok?.url, 'https://ok.ru/katty');
  const wc = linkFromInput({ kind: 'handle', handle: 'katty' }, net('wechat'), next());
  assert.equal(wc?.url, '');
  assert.equal(networkById('nope').id, 'site', 'незнакомый id — сайт');
});

test('поиск по каталогу: сокращения, русские названия, транслитерация и не та раскладка', () => {
  const first = (q: string) => searchNetworks(q)[0]?.id;
  const has = (q: string, id: string) => searchNetworks(q).some((n) => n.id === id);
  assert.equal(first('tg'), 'telegram');
  assert.equal(first('тг'), 'telegram');
  assert.equal(first('телега'), 'telegram');
  assert.equal(first('ntktuhfv'), 'telegram', 'набрано в английской раскладке');
  assert.equal(first('инста'), 'instagram');
  assert.equal(first('инстаграм'), 'instagram');
  assert.equal(first('ig'), 'instagram');
  assert.equal(first('вк'), 'vk');
  assert.equal(first('dr'), 'vk', '«вк» в английской раскладке');
  assert.equal(first('ok'), 'ok');
  assert.equal(first('однокл'), 'ok');
  assert.equal(first('жж'), 'livejournal');
  assert.equal(first('yt'), 'youtube');
  assert.equal(first('ютуб'), 'youtube');
  assert.equal(first('тикток'), 'tiktok');
  assert.equal(first('тт'), 'tiktok');
  assert.equal(first('twitter'), 'x');
  assert.equal(first('твиттер'), 'x');
  assert.equal(first('фб'), 'facebook');
  assert.equal(first('дс'), 'discord');
  assert.equal(first('твич'), 'twitch');
  assert.equal(first('кп'), 'kinopoisk');
  assert.equal(first('ям'), 'yandexmusic');
  assert.equal(first('mal'), 'myanimelist');
  assert.equal(first('бусти'), 'boosty');
  assert.equal(first('пикабу'), 'pikabu');
  assert.equal(first('хабр'), 'habr');
  assert.equal(first('t.me'), 'telegram');
  assert.equal(first('linkedin'), 'linkedin');
  assert.equal(first('гитхаб'), 'github');
  assert.equal(first('стим'), 'steam');
  assert.ok(has('yandex', 'yandexmusic'));
  assert.ok(has('яндекс', 'dzen') && has('яндекс', 'yandexmusic'));
  assert.ok(has('чат', 'tenchat') && has('чат', 'wechat') && has('чат', 'snapchat'));
  assert.equal(searchNetworks('').length, NETWORKS.length);
  assert.deepEqual(searchNetworks('нет такой сети'), []);
});

test('псевдонимы не пересекаются между сетями', () => {
  const seen = new Map<string, string>();
  for (const n of NETWORKS) {
    for (const a of [n.name.toLowerCase(), n.id, ...(n.aliases ?? [])]) {
      const prev = seen.get(a);
      assert.ok(!prev || prev === n.id, `«${a}» и у ${prev}, и у ${n.id}`);
      seen.set(a, n.id);
    }
  }
});

test('поиск сети: точное сокращение не тянет за собой другую раскладку, бессмыслица ничего не находит', () => {
  assert.deepEqual(searchNetworks('вк').map((n) => n.id), ['vk']);
  assert.deepEqual(searchNetworks('qqqqq'), []);
  assert.ok(searchNetworks('ntktuhfv').some((n) => n.id === 'telegram'), 'другая раскладка без точного совпадения работает');
});
