/// <reference types="node" />
/**
 * Влить в оценки результаты из лога прогона «AI bench» (строки BENCH_JSON) — для прогонов, которые ещё не сохраняли
 * оценки сами. npx tsx scripts/ai-bench/import-log.ts <лог> [дата ГГГГ-ММ-ДД]
 */
import fs from 'node:fs';

import { GENDER_BENCH } from '../../src/lib/ai/bench';
import { RATINGS } from '../../src/lib/ai/ratings';
import { mergeRatings, ratingsSource, type BenchOutcome } from '../../src/lib/ai/tiers';

const [file, date = new Date().toISOString().slice(0, 10)] = process.argv.slice(2);
if (!file) throw new Error('Укажи файл лога');

const outcomes: BenchOutcome[] = [];
for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
  const at = line.indexOf('BENCH_JSON ');
  if (at < 0) continue;
  const r = JSON.parse(line.slice(at + 'BENCH_JSON '.length));
  outcomes.push({
    provider: r.p,
    model: r.m,
    skipped: r.skipped,
    score: r.score,
    ms: r.ms ?? [],
    requests: (r.req ?? []).map((q: { k: BenchOutcome['requests'][number]['kind']; parsed: boolean; note?: string }) => ({ kind: q.k, appParsed: q.parsed, note: q.note })),
  });
}
const { ratings, updated, kept } = mergeRatings(RATINGS, 'gender', GENDER_BENCH.length, outcomes, date);
fs.writeFileSync('src/lib/ai/ratings.ts', ratingsSource(ratings));
console.log(`Моделей в логе: ${outcomes.length}; оценки обновлены: ${updated.length}; без изменений: ${kept.length}`);
