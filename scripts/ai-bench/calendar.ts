/// <reference types="node" />
/**
 * Проба задачи «Умный календарь» (src/lib/calendarAi.ts) на настоящих моделях: тот же вопрос, что в приложении, на
 * наборе напоминаний — событие (в календарь) или обычное дело. Для каждой модели — сколько верно, какие ошибки и время.
 * Итог — таблицей в сводке запуска (GITHUB_STEP_SUMMARY). Запуск — workflow «AI probe» (коммит со словом «[probe]»
 * в первой строке или вручную); ключи — секреты сборки.
 * Локально: GEMINI_API_KEY=… OPENROUTER_API_KEY=… npx tsx scripts/ai-bench/calendar.ts
 */
import fs from 'node:fs';

import { PROVIDERS, classify, errorInfo } from '../../src/lib/ai/providers';
import { RATINGS } from '../../src/lib/ai/ratings';
import { rankModels } from '../../src/lib/ai/tiers';
import type { ProviderId } from '../../src/lib/ai/types';
import { CALENDAR_TASK } from '../../src/lib/calendarAi';

/** Строка, как её видит ИИ, и верный ответ: true — событие для календаря. */
const CASES: [string, boolean][] = [
  ['Стоматолог · 15:00', true],
  ['Запись к терапевту · 09:30', true],
  ['Настольный теннис · каждую неделю · 19:00', true],
  ['Тренировка · каждые 2 дня · 07:00', true],
  ['Массаж · 18:00', true],
  ['Маникюр · 12:00', true],
  ['Парикмахер · 16:30', true],
  ['Йога · каждую неделю · 08:00', true],
  ['Встреча с Олегом в кафе · 13:00', true],
  ['Созвон с командой · 11:00', true],
  ['Концерт Земфиры · 20:00', true],
  ['Самолёт в Сочи · 07:40', true],
  ['Поезд в Казань · 23:10', true],
  ['Собеседование в Яндекс · 14:00', true],
  ['Родительское собрание · 18:00', true],
  ['ТО машины · 10:00', true],
  ['Сдать анализы в поликлинике · 08:00', true],
  ['Позвонить маме · 18:00', false],
  ['Купить лекарства в аптеке · 10:00', false],
  ['Пообедать · 13:00', false],
  ['Оплатить интернет · каждый месяц · 10:00', false],
  ['Выпить таблетки · каждый день · 09:00', false],
  ['Полить цветы · каждую неделю · 10:00', false],
  ['Написать Диме · 20:00', false],
  ['Записаться к врачу · 10:00', false],
  ['Купить билеты на концерт · 12:00', false],
  ['Вынести мусор · 21:00', false],
  ['Заказать продукты · каждую неделю · 18:00', false],
  ['Забрать посылку · 17:00', false],
  ['Купить цветы · каждые 2 месяца · 18:00', false],
];

const env = process.env;
const keys: Partial<Record<ProviderId, string>> = { gemini: env.GEMINI_API_KEY || undefined, openrouter: env.OPENROUTER_API_KEY || undefined };
const maxOpenRouter = Number(env.PROBE_OPENROUTER) || 6;

async function ask(provider: ProviderId, model: string): Promise<{ ms: number; answers?: Map<number, boolean>; raw?: string; error?: string }> {
  const def = PROVIDERS[provider];
  const lines = CASES.map((c) => c[0]);
  const req = def.request(model, keys[provider]!, CALENDAR_TASK.request(lines));
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
    const answers = text === null ? null : CALENDAR_TASK.parse(text, lines);
    return { ms, answers: answers ?? undefined, raw: (text ?? '').slice(0, 2000), error: answers ? undefined : 'ответ не разобрать' };
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
  const events = CASES.filter((c) => c[1]).length;
  const lines = [`Напоминаний: ${CASES.length} (событий ${events}, дел ${CASES.length - events}). «Лишнее» — дело попало в календарь (хуже), «пропущено» — событие не попало.`, ''];
  const table = ['| Сервис | Модель | Время | Верно | Лишнее в календаре | Пропущено | Без ответа | Ошибка |', '|---|---|---|---|---|---|---|---|'];
  for (const [provider, model] of models) {
    const r = await ask(provider, model);
    let ok = 0;
    const extra: string[] = [];
    const missed: string[] = [];
    let none = 0;
    CASES.forEach(([text, want], i) => {
      const got = r.answers?.get(i);
      if (got === undefined) none++;
      else if (got === want) ok++;
      else (got ? extra : missed).push(text.split(' · ')[0]);
    });
    table.push(
      `| ${provider} | \`${model}\` | ${(r.ms / 1000).toFixed(1)} с | ${r.answers ? `${ok}/${CASES.length}` : '—'} | ${extra.join(', ') || '—'} | ${missed.join(', ') || '—'} | ${r.answers ? none : '—'} | ${r.error ?? ''} |`,
    );
    console.log(`\n=== ${provider} ${model} — ${(r.ms / 1000).toFixed(1)} с ${r.error ?? ''} · верно ${ok}/${CASES.length}`);
    if (extra.length) console.log(`  лишнее: ${extra.join(', ')}`);
    if (missed.length) console.log(`  пропущено: ${missed.join(', ')}`);
    if (r.raw && (extra.length || missed.length || none)) console.log(`  RAW ${r.raw.replace(/\n/g, ' ')}`);
  }
  const md = [...lines, ...table].join('\n');
  console.log(`\n${md}`);
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `## Проба: умный календарь\n\n${md}\n`);
})();
