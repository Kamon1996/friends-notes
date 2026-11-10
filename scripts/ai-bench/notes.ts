/// <reference types="node" />
/**
 * Проба задачи «соцсети и подсказки из заметок» (src/lib/notesAi.ts) на настоящих моделях: тот же вопрос, что в
 * приложении, на наборе трудных «О себе» и заметок. Для каждой модели — что она вернула и что из этого приняла
 * проверка приложения, сравнение с ожидаемым и время. Саму заметку приложение не меняет, поэтому сверяем только
 * ссылки и подсказки. Итог — таблицей в сводке запуска (GITHUB_STEP_SUMMARY).
 * Запуск — workflow «AI probe» (коммит со словом «[probe]» в первой строке или вручную); ключи — секреты сборки.
 * Локально: GEMINI_API_KEY=… OPENROUTER_API_KEY=… npx tsx scripts/ai-bench/notes.ts
 */
import fs from 'node:fs';

import { PROVIDERS, classify, errorInfo } from '../../src/lib/ai/providers';
import { RATINGS } from '../../src/lib/ai/ratings';
import { rankModels } from '../../src/lib/ai/tiers';
import type { ProviderId } from '../../src/lib/ai/types';
import { NOTES_TASK, toSocialLink, type NotesAnswer } from '../../src/lib/notesAi';

interface Case {
  text: string;
  /** Ожидаемые ссылки «сеть:ник» (ник в нижнем регистре); для сайтов — «site:домен». */
  links: string[];
  /** Подсказки, которые хотим увидеть (по ключевому слову). */
  facts?: Partial<Record<'food' | 'flowers' | 'gifts', string>>;
}

const CASES: Case[] = [
  {
    text: 'https://band.link/9OzXo 🎙️https://www.tiktok.com/@shameless66613😍 youtube.com/@ShameleSs66613 🎥 behance.net/47935d51📸',
    links: ['bandlink:9ozxo', 'tiktok:shameless66613', 'youtube:shameless66613', 'behance:47935d51'],
  },
  { text: 'певица, Москва. канал @kattysings и inst instagram.com/katty.sh', links: ['telegram:kattysings', 'instagram:katty.sh'] },
  { text: 'пишите на mail@example.com, т.е. не сюда', links: [] },
  {
    text: 'Фотограф из Казани 📸 inst: anya.photo · вк anya_s\nОбожаю пионы и капучино',
    links: ['instagram:anya.photo', 'vk:anya_s'],
    facts: { flowers: 'пион', food: 'капучино' },
  },
  { text: 'tg: anna, inst: anna.k | vk: id1', links: ['telegram:anna', 'instagram:anna.k', 'vk:id1'] },
  { text: 'Пою и рисую\n📸 inst: anya.photo\nМосква, Питер', links: ['instagram:anya.photo'] },
  { text: 'О себе: Люблю горы и кофе. Работаю в школе', links: [], facts: { food: 'коф' } },
  { text: 'in: Moscow, line of work: dev, x: 2 + y', links: [] },
  {
    text: 'Мой канал о путешествиях — t.me/travel_kat\nДонаты: boosty.to/kat',
    links: ['telegram:travel_kat', 'boosty:kat'],
  },
  { text: 'bsky: katty.bsky.social, макс: katty', links: ['bluesky:katty.bsky.social', 'max:katty'] },
  {
    text: 'В прошлом году дарили книгу Мураками — понравилась. Не любит сладкое. Инста @dasha_runs',
    links: ['instagram:dasha_runs'],
    facts: { food: 'сладк', gifts: 'книг' },
  },
  { text: 'инст: dianka_v', links: ['instagram:dianka_v'] },
  { text: 'Рисую 🎨 мой инст — @dianka.art', links: ['instagram:dianka.art'] },
  { text: 'Пишите в tg: katty. Всегда отвечаю', links: ['telegram:katty'] },
];

const env = process.env;
const keys: Partial<Record<ProviderId, string>> = { gemini: env.GEMINI_API_KEY || undefined, openrouter: env.OPENROUTER_API_KEY || undefined };
const maxOpenRouter = Number(env.PROBE_OPENROUTER) || 6;

const linkKey = (a: NotesAnswer['links'][number]) => {
  const l = toSocialLink(a, 'x');
  if (!l) return `?:${a.network}:${a.handle ?? a.url}`;
  return l.network === 'site' ? `site:${l.label}` : `${l.network}:${(l.handle ?? '').toLowerCase()}`;
};

interface CaseResult {
  links: 'ok' | string;
  facts: string;
}

function score(c: Case, a: NotesAnswer | undefined): CaseResult {
  if (!a) return { links: 'нет ответа', facts: '' };
  const got = [...new Set(a.links.map(linkKey))].sort();
  const want = [...c.links].sort();
  const links = JSON.stringify(got) === JSON.stringify(want) ? 'ok' : `${got.join(' ') || '—'} ≠ ${want.join(' ') || '—'}`;
  const facts = Object.entries(c.facts ?? {})
    .map(([k, w]) => `${k}:${(a.facts[k as 'food'] ?? '').toLowerCase().includes(w!) ? '✓' : '✗'}`)
    .join(' ');
  return { links, facts };
}

async function ask(provider: ProviderId, model: string): Promise<{ ms: number; answers?: Map<number, NotesAnswer>; raw?: string; error?: string }> {
  const def = PROVIDERS[provider];
  const texts = CASES.map((c) => c.text);
  const req = def.request(model, keys[provider]!, NOTES_TASK.request(texts));
  const t0 = Date.now();
  try {
    const res = await fetch(req.url, { ...req.init, signal: AbortSignal.timeout(60_000) });
    const raw = await res.text();
    const ms = Date.now() - t0;
    let body: unknown = raw;
    try {
      body = JSON.parse(raw);
    } catch {
      // текст как есть
    }
    const kind = classify(provider, res.status, body);
    if (kind) return { ms, error: `${kind}: ${errorInfo(body).message.slice(0, 160)}` };
    const text = def.text(body);
    const answers = text === null ? null : NOTES_TASK.parse(text, texts);
    return { ms, answers: answers ?? undefined, raw: (text ?? '').slice(0, 4000), error: answers ? undefined : 'ответ не разобрать' };
  } catch (e) {
    return { ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) };
  }
}

(async () => {
  const models: [ProviderId, string][] = [];
  if (keys.gemini) for (const m of PROVIDERS.gemini.models) models.push(['gemini', m]);
  if (keys.openrouter) {
    for (const m of rankModels(RATINGS.gender).filter((r) => r.provider === 'openrouter' && (r.tier === 'S' || r.tier === 'A' || r.tier === 'B')).slice(0, maxOpenRouter)) {
      models.push(['openrouter', m.model]);
    }
  }
  const lines = [`Тексты: ${CASES.length}. Ссылки — точное совпадение набора; подсказки — по ключевому слову. Сама заметка в приложении не меняется.`, ''];
  const table = ['| Сервис | Модель | Время | Ссылки верно | Подсказки | Ошибка |', '|---|---|---|---|---|---|'];
  for (const [provider, model] of models) {
    const r = await ask(provider, model);
    const per = CASES.map((c, i) => score(c, r.answers?.get(i)));
    const linksOk = per.filter((p) => p.links === 'ok').length;
    const facts = per.map((p) => p.facts).join(' ');
    const factsOk = (facts.match(/✓/g) ?? []).length;
    const factsAll = (facts.match(/[✓✗]/g) ?? []).length;
    table.push(`| ${provider} | \`${model}\` | ${(r.ms / 1000).toFixed(1)} с | ${r.answers ? `${linksOk}/${CASES.length}` : '—'} | ${r.answers ? `${factsOk}/${factsAll}` : '—'} | ${r.error ?? ''} |`);
    console.log(`\n=== ${provider} ${model} — ${(r.ms / 1000).toFixed(1)} с ${r.error ?? ''}`);
    per.forEach((p, i) => {
      if (p.links !== 'ok' || p.facts.includes('✗')) console.log(`  #${i}: ссылки ${p.links} · ${p.facts}`);
    });
    if (r.raw) console.log(`  RAW ${r.raw.replace(/\n/g, ' ')}`);
  }
  const md = [...lines, ...table].join('\n');
  console.log(`\n${md}`);
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `## Проба: соцсети из заметок\n\n${md}\n`);
})();
