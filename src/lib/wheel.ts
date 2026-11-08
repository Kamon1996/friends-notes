/**
 * Ход «колеса» ИИ-задач: полный круг через рамку. Скорость: медленный разгон → очень быстро → плавное торможение;
 * если ответ ещё не готов, колесо крутится на полной скорости, пока он не придёт, и только потом тормозит.
 * Колесо всегда останавливается там, откуда начало, — ровно через целое число оборотов. Единицы круга — любые
 * (на телефоне — px вдоль списка, src/lib/bendFlow.ts).
 *
 * Чистые функции с пометкой 'worklet': на телефоне они считаются на UI-потоке каждый кадр, в тестах — как обычные.
 */

export const WHEEL = {
  /** Пауза перед стартом, с. */
  delay: 0.15,
  /** Разгон + торможение, с. */
  spin: 3.5,
  /** Дольше этого на полной скорости не крутим, даже если ответа нет, с. */
  maxCruise: 20,
  /** Больше друзей на круге — тяжело для слабых телефонов; остальные считаются, но не едут. */
  maxRows: 80,
};

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
