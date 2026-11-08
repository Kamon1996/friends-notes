import type { Ratings } from './tiers';

/**
 * Оценки моделей из испытания (src/lib/ai/bench.ts). Файл обновляет workflow «AI bench» после каждого прогона
 * (scripts/ai-bench) — руками не править. По оценкам строится тир-лист (tiers.ts), по нему приложение выбирает модели.
 */
export const RATINGS: Ratings = {};
