/// <reference types="node" />
/**
 * Испытание бесплатных моделей на задаче «пол по имени» (src/lib/ai/bench.ts).
 * Запуск — на машине GitHub, где есть ключи: workflow «AI bench» (.github/workflows/ai-bench.yml).
 * Локально: GEMINI_API_KEY=… OPENROUTER_API_KEY=… HF_TOKEN=… npx tsx scripts/ai-bench/run.ts
 *
 * Настройки — переменными окружения: BENCH_PROVIDERS (через запятую), BENCH_BATCH (имён в запросе),
 * BENCH_MAX_MODELS (на сервис), BENCH_ONLY («openrouter:модель,gemini:модель» — только эти).
 * Ключи в лог не попадают.
 */
import fs from 'node:fs';

import { GENDER_BENCH, groupErrors, rankResults, runBench, type BenchModelResult } from '../../src/lib/ai/bench';
import type { AiFetch, ProviderId } from '../../src/lib/ai/types';

const env = process.env;
const providers = (env.BENCH_PROVIDERS || 'gemini,openrouter,huggingface').split(',').map((s: string) => s.trim()).filter(Boolean) as ProviderId[];
const keys: Partial<Record<ProviderId, string>> = {
  gemini: env.GEMINI_API_KEY || undefined,
  openrouter: env.OPENROUTER_API_KEY || undefined,
  huggingface: env.HF_TOKEN || undefined,
  groq: env.GROQ_API_KEY || undefined,
};
const batch = Number(env.BENCH_BATCH) || 50;
const maxModels = Number(env.BENCH_MAX_MODELS) || 40;
const only = (env.BENCH_ONLY || '').split(',').map((s: string) => s.trim()).filter(Boolean);

const appFetch: AiFetch = async (url, init) => {
  const res = await fetch(url, init);
  return { status: res.status, headers: res.headers, text: () => res.text() };
};

const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : NaN);
const sec = (ms: number) => (Number.isFinite(ms) ? `${(ms / 1000).toFixed(1)} с` : '—');

function table(results: BenchModelResult[]): string {
  const rows = rankResults(results).map((r, i) => {
    const s = r.score;
    const ok = r.requests.filter((q) => q.kind === 'ok').length;
    const parsed = r.requests.filter((q) => q.appParsed).length;
    return `| ${i + 1} | ${r.provider} | \`${r.model}\` | ${r.skipped ? `не проверена: ${r.skipped}` : s.score} | ${s.correct} | ${s.correctUnknown} | ${s.wrong} | ${s.guessed} | ${s.missed} | ${s.omitted} | ${sec(median(r.ms))} | ${ok}/${r.requests.length} · ${parsed} |`;
  });
  return [
    `Имён: ${GENDER_BENCH.length} (ясных — ${GENDER_BENCH.filter((c) => c.want !== 'u').length}, неоднозначных — ${GENDER_BENCH.filter((c) => c.want === 'u').length}), по ${batch} в запросе.`,
    '',
    '| # | Сервис | Модель | Итог | Верно f/m | Верно «не знаю» | Перепутала | Угадывала | «Не знаю» на ясное | Пропустила | Время (медиана) | Ответов · понято приложением |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...rows,
  ].join('\n');
}

(async () => {
  const started = Date.now();
  const results = await runBench({
    providers,
    keys,
    fetch: appFetch,
    now: () => Date.now(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    log: (line) => console.log(line),
    batch,
    maxModels,
    only,
  });
  const md = table(results);
  console.log(`\n${md}\n`);
  // Сжатые результаты для разбора: метки по порядку имён из GENDER_BENCH.
  for (const r of rankResults(results)) {
    console.log(
      `BENCH_JSON ${JSON.stringify({
        p: r.provider,
        m: r.model,
        skipped: r.skipped,
        score: r.score,
        labels: r.labels,
        ms: r.ms,
        req: r.requests.map((q) => ({ b: q.batch, s: q.status, k: q.kind, ms: q.ms, parsed: q.appParsed, usage: q.usage, note: q.note })),
        errors: groupErrors(GENDER_BENCH, r.labels),
      })}`,
    );
  }
  console.log(`Готово за ${Math.round((Date.now() - started) / 1000)} с`);
  fs.writeFileSync('bench-results.json', JSON.stringify({ cases: GENDER_BENCH, batch, results }, null, 2));
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `## Испытание моделей: пол по имени\n\n${md}\n`);
})();
