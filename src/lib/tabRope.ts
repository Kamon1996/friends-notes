// «Ниточка» в нижней панели (src/components/TabRope.tsx): какие отрезки нитки вздрагивают при переходе между вкладками.

/** Волна по одному отрезку нитки: id — чтобы повторная волна по тому же отрезку запустилась заново. */
export interface RopeWave {
  id: number;
  /** 1 — слева направо, −1 — справа налево. */
  dir: 1 | -1;
  /** Задержка, мс: при переходе через вкладку второй отрезок вздрагивает чуть позже. */
  delay: number;
}

/** Сколько идёт волна по одному отрезку и через сколько начинается следующий. */
export const ROPE_WAVE_MS = 850;
export const ROPE_GAP_MS = 380;

/**
 * Волны для перехода с вкладки `from` на `to`: только по отрезкам между ними (отрезок s — между вкладками s и s+1),
 * по порядку от вкладки, с которой ушли. 1 → 2 — один отрезок; 1 → 3 — сначала 1–2, потом 2–3; 3 → 1 — наоборот.
 */
export function ropeWaves(prev: Readonly<Record<number, RopeWave>>, from: number, to: number): Record<number, RopeWave> {
  if (from === to) return { ...prev };
  const dir = to > from ? 1 : -1;
  const next = { ...prev };
  let k = 0;
  for (let s = dir > 0 ? from : from - 1; dir > 0 ? s < to : s >= to; s += dir) {
    next[s] = { id: (prev[s]?.id ?? 0) + 1, dir, delay: k++ * ROPE_GAP_MS };
  }
  return next;
}
