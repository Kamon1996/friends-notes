/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { NETWORKS, extractLinks, linkFromInput, linkSubtitle, linkTitle, mergeLinks, parseSocialInput, searchNetworks, siteLabel } from '../socials';

const ids = () => {
  let n = 0;
  return () => `l${++n}`;
};

test('ссылка узнаётся по домену, ник достаётся из пути', () => {
  const t = parseSocialInput('https://www.tiktok.com/@shameless66613');
  assert.equal(t.kind, 'link');
  if (t.kind === 'link') assert.deepEqual([t.network.id, t.handle], ['tiktok', 'shameless66613']);
  const y = parseSocialInput('youtube.com/@ShameleSs66613');
  if (y.kind === 'link') assert.deepEqual([y.network.id, y.handle, y.url], ['youtube', 'ShameleSs66613', 'https://youtube.com/@ShameleSs66613']);
  else assert.fail('без схемы тоже ссылка');
  const li = parseSocialInput('https://www.linkedin.com/in/katty-sh/');
  if (li.kind === 'link') assert.deepEqual([li.network.id, li.handle], ['linkedin', 'katty-sh']);
  const lj = parseSocialInput('https://katty.livejournal.com/');
  if (lj.kind === 'link') assert.deepEqual([lj.network.id, lj.handle], ['livejournal', 'katty']);
  const tg = parseSocialInput('t.me/Shameless66613');
  if (tg.kind === 'link') assert.deepEqual([tg.network.id, tg.handle], ['telegram', 'Shameless66613']);
  const vk = parseSocialInput('https://m.vk.com/id12345');
  if (vk.kind === 'link') assert.deepEqual([vk.network.id, vk.handle], ['vk', 'id12345']);
  const post = parseSocialInput('https://www.instagram.com/p/Cx1abc/');
  if (post.kind === 'link') assert.equal(post.handle, null, 'пост — не ник');
});

test('незнакомый адрес — сайт, ник — ник, остальное — мусор', () => {
  const site = parseSocialInput('https://www.kattysings.ru/about');
  assert.equal(site.kind, 'site');
  if (site.kind === 'site') assert.equal(site.host, 'kattysings.ru');
  assert.deepEqual(parseSocialInput('@katty.sh'), { kind: 'handle', handle: 'katty.sh' });
  assert.deepEqual(parseSocialInput('katty_sh'), { kind: 'handle', handle: 'katty_sh' });
  assert.equal(parseSocialInput('катя шамелес').kind, 'invalid');
  assert.equal(parseSocialInput('').kind, 'empty');
  const m = parseSocialInput('@katty@mastodon.social');
  if (m.kind === 'link') assert.deepEqual([m.network.id, m.url], ['mastodon', 'https://mastodon.social/@katty']);
  else assert.fail('ник в федивёрсе — ссылка');
});

test('из ника и сети собирается адрес по шаблону', () => {
  const next = ids();
  const ig = linkFromInput({ kind: 'handle', handle: 'katty.sh' }, NETWORKS.find((n) => n.id === 'instagram')!, next());
  assert.deepEqual([ig?.url, ig?.handle, linkTitle(ig!), linkSubtitle(ig!)], ['https://instagram.com/katty.sh', 'katty.sh', 'Instagram', '@katty.sh']);
  const li = linkFromInput({ kind: 'handle', handle: 'katty' }, NETWORKS.find((n) => n.id === 'linkedin')!, next());
  assert.equal(li?.url, 'https://linkedin.com/in/katty');
  const wc = linkFromInput({ kind: 'handle', handle: 'katty' }, NETWORKS.find((n) => n.id === 'wechat')!, next());
  assert.deepEqual([wc?.url, linkSubtitle(wc!)], ['', '@katty'], 'у WeChat ссылок нет — только ник');
  const site = linkFromInput(parseSocialInput('https://www.kattysings.ru/about'), null, next());
  assert.deepEqual([site?.network, linkTitle(site!), site?.label, linkSubtitle(site!)], ['site', 'kattysings.ru', 'kattysings.ru', 'kattysings.ru']);
  assert.equal(linkFromInput({ kind: 'handle', handle: 'x' }, null, next()), null, 'ник без сети — ещё не ссылка');
  assert.equal(siteLabel('https://www.example.org/path'), 'example.org');
});

test('«О себе» из Telegram: ссылки в соцсети, остаток в заметки', () => {
  const bio = 'https://band.link/9OzXo 🎙️https://www.tiktok.com/@shameless66613😍 youtube.com/@ShameleSs66613 🎥 behance.net/47935d51📸';
  const { links, rest } = extractLinks(bio, ids());
  assert.deepEqual(links.map((l) => `${l.network}:${l.handle ?? l.label}`), ['bandlink:9OzXo', 'tiktok:shameless66613', 'youtube:ShameleSs66613', 'behance:47935d51']);
  assert.equal(rest, '', 'одни эмодзи в заметки не пишем');
  const r2 = extractLinks('певица, Москва. канал @kattysings и inst instagram.com/katty.sh', ids());
  assert.deepEqual(r2.links.map((l) => `${l.network}:${l.handle}`), ['telegram:kattysings', 'instagram:katty.sh'], 'в порядке появления в тексте');
  assert.equal(r2.rest, 'певица, Москва. канал и inst');
  const r3 = extractLinks('пишите на mail@example.com, т.е. не сюда', ids());
  assert.deepEqual(r3.links, [], 'почта и «т.е.» — не ссылки');
});

test('дубликаты схлопываются, ручные важнее импортированных', () => {
  const a = { id: '1', network: 'tiktok', url: 'https://tiktok.com/@kat', handle: 'kat', source: 'manual' as const };
  const b = { id: '2', network: 'tiktok', url: 'https://www.tiktok.com/@KAT', handle: 'KAT', source: 'tg' as const };
  const c = { id: '3', network: 'site', url: 'https://band.link/x/', label: 'band.link' };
  const d = { id: '4', network: 'site', url: 'https://band.link/x', label: 'band.link' };
  assert.deepEqual(mergeLinks([a], [b, c], [d]).map((l) => l.id), ['1', '3']);
});

test('каталог: уникальные id и домены, поиск по названию и домену', () => {
  const idSet = new Set(NETWORKS.map((n) => n.id));
  assert.equal(idSet.size, NETWORKS.length);
  const domains = NETWORKS.flatMap((n) => n.domains);
  assert.equal(new Set(domains).size, domains.length, 'домен должен вести ровно в одну сеть');
  assert.ok(NETWORKS.length >= 80);
  assert.ok(searchNetworks('одно').some((n) => n.id === 'ok'));
  assert.ok(searchNetworks('t.me').some((n) => n.id === 'telegram'));
  assert.equal(searchNetworks('').length, NETWORKS.length);
});
