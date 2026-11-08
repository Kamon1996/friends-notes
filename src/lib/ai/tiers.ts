import type { BenchScore } from './bench';
import type { FailureKind, ProviderId } from './types';

/**
 * Тир-лист моделей: оценки из испытания (src/lib/ai/bench.ts) хранятся в ratings.ts — по задачам и моделям, с историей
 * прогонов. Из оценки — тир; по тирам приложение решает, кого спрашивать первым:
 *   S, A, B → по порядку (внутри тира — выше итог, потом быстрее), независимо от сервиса;
 *   потом модели, которых ещё не испытывали, — по приоритету сервисов задачи (tasks.ts);
 *   C — в самом конце, если больше некого спросить; F — никогда (путает пол, не понимает формат, модели нет).
 */

export type Tier = 'S' | 'A' | 'B' | 'C' | 'F';
export const TIERS: Tier[] = ['S', 'A', 'B', 'C', 'F'];

export interface RatingPoint {
  testedAt: string;
  score: number;
  harmful: number;
  medianMs: number | null;
}

export interface ModelRating extends Omit<BenchScore, 'total'> {
  provider: ProviderId;
  model: string;
  /** Дата последнего испытания (ГГГГ-ММ-ДД). */
  testedAt: string;
  /** Сколько имён было в наборе. */
  cases: number;
  /** Медиана времени ответа на запрос, мс. */
  medianMs: number | null;
  /** Доля ответов, которые приложение смогло прочитать. */
  parsedShare: number;
  /** unavailable — модели нет или она не принимает наш запрос. */
  status: 'ok' | 'unavailable';
  note?: string;
  /** Прошлые прогоны, последние 5 — видно, стабильна ли модель. */
  history: RatingPoint[];
}

export interface TaskRatings {
  /** Сколько имён в наборе испытания (если набор поменяется — старые оценки сравнивать осторожно). */
  benchCases: number;
  updatedAt: string;
  /** «провайдер:модель» → оценка. */
  models: Record<string, ModelRating>;
}

export type Ratings = Record<string, TaskRatings>;

/** Медленнее этого (на 50 имён) — не выше C: приложение ждёт ответа не дольше 25 секунд. */
export const SLOW_MS = 40_000;

export function accuracy(r: Pick<ModelRating, 'correct' | 'correctUnknown' | 'cases'>): number {
  return r.cases ? (r.correct + r.correctUnknown) / r.cases : 0;
}

export function tierOf(r: ModelRating): Tier {
  const acc = accuracy(r);
  if (r.status !== 'ok' || r.parsedShare < 0.5 || r.harmful >= 4 || acc < 0.5) return 'F';
  const slow = r.medianMs === null || r.medianMs > SLOW_MS;
  let tier: Tier = 'C';
  if (r.harmful === 0 && acc >= 0.9 && r.parsedShare === 1 && r.medianMs !== null && r.medianMs <= 10_000) tier = 'S';
  else if (r.harmful <= 1 && acc >= 0.8 && r.parsedShare === 1) tier = 'A';
  else if (r.harmful <= 2 && acc >= 0.7) tier = 'B';
  return slow && tier !== 'C' ? 'C' : tier;
}

export interface RankedModel {
  provider: ProviderId;
  model: string;
  tier: Tier;
  rating: ModelRating;
}

/** Тир-лист задачи: по тиру, внутри — выше итог, меньше вредных ошибок, быстрее. */
export function rankModels(task: TaskRatings | undefined): RankedModel[] {
  if (!task) return [];
  return Object.values(task.models)
    .map((rating) => ({ provider: rating.provider, model: rating.model, tier: tierOf(rating), rating }))
    .sort(
      (a, b) =>
        TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier) ||
        b.rating.score - a.rating.score ||
        a.rating.harmful - b.rating.harmful ||
        (a.rating.medianMs ?? Infinity) - (b.rating.medianMs ?? Infinity),
    );
}

export interface TierPlan {
  /** Сначала — проверенные хорошие (S, A, B). */
  first: { provider: ProviderId; model: string }[];
  /** В конце — проверенные слабые (C). */
  last: { provider: ProviderId; model: string }[];
  /** Никогда (F): «провайдер:модель». */
  banned: Set<string>;
}

export function tierPlan(task: TaskRatings | undefined, providers: ProviderId[]): TierPlan {
  const plan: TierPlan = { first: [], last: [], banned: new Set() };
  for (const m of rankModels(task)) {
    if (!providers.includes(m.provider)) continue;
    const pair = { provider: m.provider, model: m.model };
    if (m.tier === 'F') plan.banned.add(`${m.provider}:${m.model}`);
    else if (m.tier === 'C') plan.last.push(pair);
    else plan.first.push(pair);
  }
  return plan;
}

// ---------- Обновление оценок после испытания ----------

/** Результат испытания одной модели — то, что нужно для оценки (BenchModelResult подходит). */
export interface BenchOutcome {
  provider: ProviderId;
  model: string;
  skipped?: string;
  score: BenchScore;
  ms: number[];
  requests: { kind: FailureKind | 'ok'; appParsed: boolean; note?: string }[];
}

/** Временные сбои: модель не виновата, оценку не меняем. */
const TRANSIENT: (FailureKind | 'ok')[] = ['rate-limit', 'server', 'network'];
/** Сервис отказал целиком (ключ, страна, кредиты): модель тоже не виновата. */
const PROVIDER_WIDE: (FailureKind | 'ok')[] = ['auth', 'region', 'credits'];

const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null);

/**
 * Влить результаты испытания в оценки: новые — записать, повторные — обновить с историей, не испытанные (лимиты,
 * сбои, отказ сервиса) — оставить как были. Модель, которой нет или которая не принимает запрос, — unavailable.
 */
export function mergeRatings(prev: Ratings, taskId: string, benchCases: number, results: BenchOutcome[], testedAt: string): { ratings: Ratings; updated: string[]; kept: string[] } {
  const task: TaskRatings = prev[taskId] ? { ...prev[taskId], models: { ...prev[taskId].models } } : { benchCases, updatedAt: testedAt, models: {} };
  const updated: string[] = [];
  const kept: string[] = [];
  for (const r of results) {
    const key = `${r.provider}:${r.model}`;
    const kinds = r.requests.map((q) => q.kind);
    const answered = kinds.filter((k) => k === 'ok').length;
    const untested = r.skipped || !kinds.length || kinds.some((k) => TRANSIENT.includes(k) || PROVIDER_WIDE.includes(k));
    if (untested) {
      kept.push(key);
      continue;
    }
    const old = task.models[key];
    const gone = !answered && kinds.some((k) => k === 'model-missing' || k === 'bad-request');
    const { total: _total, ...score } = r.score;
    const rating: ModelRating = {
      ...score,
      provider: r.provider,
      model: r.model,
      testedAt,
      cases: r.score.total,
      medianMs: median(r.ms),
      parsedShare: r.requests.length ? r.requests.filter((q) => q.appParsed).length / r.requests.length : 0,
      status: gone ? 'unavailable' : 'ok',
      ...(gone && { note: r.requests.find((q) => q.note)?.note?.slice(0, 200) }),
      history: [...(old?.history ?? []), { testedAt, score: r.score.score, harmful: r.score.harmful, medianMs: median(r.ms) }].slice(-5),
    };
    task.models[key] = rating;
    updated.push(key);
  }
  if (updated.length) {
    task.updatedAt = testedAt;
    task.benchCases = benchCases;
  }
  return { ratings: { ...prev, [taskId]: task }, updated, kept };
}

/** Текст файла ratings.ts. */
export function ratingsSource(ratings: Ratings): string {
  return [
    "import type { Ratings } from './tiers';",
    '',
    '/**',
    ' * Оценки моделей из испытания (src/lib/ai/bench.ts). Файл обновляет workflow «AI bench» после каждого прогона',
    ' * (scripts/ai-bench) — руками не править. По оценкам строится тир-лист (tiers.ts), по нему приложение выбирает модели.',
    ' */',
    `export const RATINGS: Ratings = ${JSON.stringify(ratings, null, 2)};`,
    '',
  ].join('\n');
}
