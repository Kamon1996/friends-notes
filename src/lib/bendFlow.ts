import { wheelAt, wheelEnd } from './wheel';

/**
 * Ход «пола друзей» прямо по списку: список чуть изгибается сверху и снизу (середина с рамкой ровная), его оттягивают
 * вниз и выдёргивают — полный круг через рамку (медленно → очень быстро → медленно; ответа нет — крутится на полной
 * скорости, пока не придёт), потом список выпрямляется и стоит, как стоял.
 *
 * Время — секунды от старта, строки — в строках списка. `band` — какая строка сейчас в рамке (BAND.row + сдвиг).
 * Чистые функции с пометкой 'worklet': на телефоне считаются на UI-потоке каждый кадр, в тестах — как обычные.
 */
export const BEND = {
  /** Пока экран проявляется и уходит поиск. */
  lead: 0.25,
  /** Список изгибается. */
  bendIn: 0.45,
  /** Оттянули вниз. */
  pull: 0.22,
  /** На сколько строк оттягиваем. */
  pullRows: 0.4,
  /** За сколько отпускаем оттяжку, уже двигаясь. */
  release: 0.35,
  /** Полный круг, если ответ готов сразу. */
  spin: 3.5,
  /** Список выпрямляется. */
  bendOut: 0.5,
  /** Радиус изгиба, px: строка в пяти от рамки наклонена примерно на 25°. */
  radius: 700,
  /** Шаг строки списка, px. */
  row: 65,
  /** Рамка — на месте пятой строки сверху. */
  band: 4,
  maxCruise: 20,
};

export const SPIN_START = BEND.lead + BEND.bendIn + BEND.pull;

function easeInOut(u: number): number {
  'worklet';
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

/** Когда список снова ровный (конец анимации), с. */
export function flowEnd(doneAt: number, rows: number): number {
  'worklet';
  const da = Number.isFinite(doneAt) ? doneAt - SPIN_START : Infinity;
  return SPIN_START + wheelEnd(da, rows, BEND.spin, 0, BEND.maxCruise) + BEND.bendOut;
}

/** Сдвиг списка в строках в момент t (0 → оттянули → полный круг кратно rows). */
export function flowShift(t: number, doneAt: number, rows: number): number {
  'worklet';
  const p0 = BEND.lead + BEND.bendIn;
  if (t <= p0) return 0;
  if (t <= SPIN_START) return -BEND.pullRows * Math.sin(((t - p0) / BEND.pull) * (Math.PI / 2));
  const tt = t - SPIN_START;
  const da = Number.isFinite(doneAt) ? doneAt - SPIN_START : Infinity;
  const s = wheelAt(tt, da, rows, BEND.spin, 0, BEND.maxCruise);
  const r = Math.min(1, tt / BEND.release);
  return s - BEND.pullRows * (1 - easeInOut(r));
}

/** Насколько список изогнут в момент t: 0 — ровный, 1 — изогнут. */
export function flowBend(t: number, doneAt: number, rows: number): number {
  'worklet';
  if (t <= BEND.lead) return 0;
  if (t < BEND.lead + BEND.bendIn) return easeInOut((t - BEND.lead) / BEND.bendIn);
  const out0 = flowEnd(doneAt, rows) - BEND.bendOut;
  if (t <= out0) return 1;
  return 1 - easeInOut(Math.min(1, (t - out0) / BEND.bendOut));
}

/** Место строки от верха списка (в строках) при сдвиге: замкнуто по кругу, «выше верха» — до трёх строк. */
export function rowPlace(row: number, shift: number, rows: number): number {
  'worklet';
  return ((((row - shift + 3) % rows) + rows) % rows) - 3;
}

/**
 * Строка на изгибе: середина (рамка) ровная, края уходят назад. Возвращает сдвиг от рамки по вертикали (с учётом
 * перспективы), масштаб и наклон. При bend = 0 — обычный ровный список.
 */
export function bendPlace(place: number, bend: number, perspective = 900): { y: number; scale: number; angle: number } {
  'worklet';
  const d = (place - BEND.band) * BEND.row;
  if (bend < 1e-4) return { y: d, scale: 1, angle: 0 };
  const r = BEND.radius / bend;
  const a = d / r;
  const z = -r * (1 - Math.cos(a));
  const scale = perspective / (perspective - z);
  return { y: r * Math.sin(a) * scale, scale, angle: (-a * 180) / Math.PI };
}
