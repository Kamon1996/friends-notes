/**
 * Барабан ИИ-задач — как выбор времени на iPhone: друзья едут по цилиндру через полосу в центре, и у каждого,
 * кто проехал полосу, проявляется ответ. Скорость: медленный разгон → очень быстро → плавное торможение;
 * если ответ ещё не готов, колесо крутится на полной скорости, пока он не придёт, и только потом тормозит.
 * Колесо всегда останавливается на первом друге — ровно через целое число оборотов.
 *
 * Чистые функции с пометкой 'worklet': на телефоне они считаются на UI-потоке каждый кадр, в тестах — как обычные.
 */

export const WHEEL = {
  /** Пауза перед стартом, с. */
  delay: 0.15,
  /** Разгон + торможение, с; вместе с паузой и «Готово» — около 4 секунд. */
  spin: 3.5,
  /** Сколько держим «Готово» на остановившемся колесе, прежде чем показать итог, с. */
  settle: 0.4,
  /** Дольше этого на полной скорости не крутим, даже если ответа нет, с. */
  maxCruise: 20,
  /** Друзей мало — повторяем их по кругу, как часы в будильнике, чтобы колесо не было пустым. */
  minRows: 30,
  /** Больше строк — тяжело для слабых телефонов; остальные друзья считаются, но на колесе не едут. */
  maxRows: 150,
  rowHeight: 48,
  /** Радиус цилиндра, px: строка 48 px ≈ 11,7° поворота. */
  radius: 236,
};

/** Угол между соседними строками, градусы. */
export const WHEEL_STEP = (WHEEL.rowHeight / WHEEL.radius) * (180 / Math.PI);

/** Строки колеса: мало друзей — повторяем целыми кругами, много — берём первых `max`. */
export function wheelRows<T>(items: readonly T[], min = WHEEL.minRows, max = WHEEL.maxRows): T[] {
  if (!items.length) return [];
  if (items.length >= max) return items.slice(0, max);
  const copies = Math.max(1, Math.ceil(min / items.length));
  const out: T[] = [];
  for (let c = 0; c < copies; c++) out.push(...items);
  return out;
}

// Вспомогательные функции-ворклеты объявлены до тех, кто их зовёт: плагин ворклетов превращает их в константы,
// и подъём объявлений (hoisting) перестаёт работать.
/** Сколько полных кругов на полной скорости: пока не пришёл ответ, но не дольше `maxCruise`. */
function cruiseLaps(doneAt: number, tA: number, lap: number, maxCruise: number): number {
  'worklet';
  const cap = Math.ceil(maxCruise / lap);
  if (!(doneAt > tA)) return 0;
  if (!Number.isFinite(doneAt)) return cap;
  return Math.min(cap, Math.ceil((doneAt - tA) / lap - 1e-9));
}

/** Ход колеса: где оно в момент `t` (в строках), если ответ пришёл в момент `doneAt` (не пришёл — бесконечность). */
// Ворклеты получают все числа параметрами, без значений по умолчанию: плагин ворклетов не переносит на UI-поток
// константы из выражений по умолчанию (`spin = WHEEL.spin`) — на телефоне это падение «Property 'WHEEL' doesn't exist».
export function wheelAt(t: number, doneAt: number, rows: number, spin: number, delay: number, maxCruise: number): number {
  'worklet';
  if (rows <= 0 || t <= delay) return 0;
  const half = spin / 2;
  const h = rows / 2;
  const tA = delay + half;
  // Разгон: кубическая кривая — сперва еле-еле, к середине — во весь опор.
  if (t <= tA) {
    const u = (t - delay) / half;
    return h * u * u * u;
  }
  const v = (3 * h) / half; // скорость в конце разгона — с ней же начинается торможение, без рывка
  const lap = rows / v;
  const laps = cruiseLaps(doneAt, tA, lap, maxCruise);
  const tD = tA + laps * lap;
  if (t <= tD) return h + v * (t - tA);
  const u = Math.min(1, (t - tD) / half);
  const k = 1 - u;
  return h + laps * rows + h * (1 - k * k * k);
}

/** Когда колесо остановится, с. */
export function wheelEnd(doneAt: number, rows: number, spin: number, delay: number, maxCruise: number): number {
  'worklet';
  const half = spin / 2;
  const tA = delay + half;
  if (rows <= 0) return tA + half;
  const lap = rows / ((3 * (rows / 2)) / half);
  return tA + cruiseLaps(doneAt, tA, lap, maxCruise) * lap + half;
}

/** Строка проявляется, когда впервые проезжает полосу после того, как ответ для неё готов (`at` — где было колесо). */
export function revealAt(row: number, rows: number, at: number): number {
  if (at <= row || rows <= 0) return row;
  return row + Math.ceil((at - row) / rows) * rows;
}

/** Смещение строки от полосы в строках: плюс — уже проехала (выше), минус — едет снизу. Колесо замкнуто. */
export function wheelDelta(s: number, row: number, rows: number): number {
  'worklet';
  const d = s - row;
  const half = rows / 2;
  return ((((d + half) % rows) + rows) % rows) - half;
}

/** Положение строки на цилиндре: сдвиг вверх-вниз, наклон и прозрачность. Дальше 88° — не видно. */
export function wheelPlace(d: number): { y: number; angle: number; opacity: number; visible: boolean } {
  'worklet';
  const angle = d * WHEEL_STEP;
  if (Math.abs(angle) >= 88) return { y: 0, angle: 90, opacity: 0, visible: false };
  const rad = (angle * Math.PI) / 180;
  return { y: -WHEEL.radius * Math.sin(rad), angle, opacity: Math.pow(Math.cos(rad), 0.9), visible: true };
}
