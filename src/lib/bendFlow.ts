import type { FriendListItem } from './friendList';
import type { Friend } from './types';
import { wheelAt, wheelEnd } from './wheel';

/**
 * Ход «пола друзей» прямо по списку: список чуть изгибается сверху и снизу (середина с рамкой ровная), его оттягивают
 * вниз и выдёргивают — полный круг через рамку (медленно → очень быстро → медленно; ответа нет — крутится на полной
 * скорости, пока не придёт), потом список выпрямляется и стоит, как стоял.
 *
 * Время — секунды от старта; расстояния — px вдоль списка (список такой же, как в «Друзьях»: с подзаголовками групп).
 * Чистые функции с пометкой 'worklet': на телефоне считаются на UI-потоке каждый кадр, в тестах — как обычные.
 */
export const BEND = {
  /** Пока поиск становится плашкой. */
  lead: 0.35,
  /** Список изгибается. */
  bendIn: 0.45,
  /** Оттянули вниз. */
  pull: 0.22,
  /** На сколько оттягиваем, в долях строки. */
  pullRows: 0.4,
  /** За сколько отпускаем оттяжку, уже двигаясь. */
  release: 0.35,
  /** Полный круг, если ответ готов сразу. */
  spin: 3.5,
  /** Список выпрямляется. */
  bendOut: 0.5,
  /** Радиус изгиба, px: строка в пяти от рамки наклонена примерно на 25°. */
  radius: 700,
  /** Рамка — на месте пятого друга сверху. */
  bandRow: 4,
  /** Выше верха списка — не дальше стольких строк (дальше строка уже за краем). */
  above: 3,
  maxCruise: 20,
};

export const SPIN_START = BEND.lead + BEND.bendIn + BEND.pull;

function easeInOut(u: number): number {
  'worklet';
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

/** Когда список снова ровный (конец анимации), с. `lap` — длина круга (в чём угодно: строках, px). */
export function flowEnd(doneAt: number, lap: number): number {
  'worklet';
  const da = Number.isFinite(doneAt) ? doneAt - SPIN_START : Infinity;
  return SPIN_START + wheelEnd(da, lap, BEND.spin, 0, BEND.maxCruise) + BEND.bendOut;
}

/**
 * Сдвиг списка в момент t: 0 → оттянули на `pull` → полный круг, кратно `lap`. Единицы — те же, что у `lap` и `pull`
 * (на телефоне — px: список с подзаголовками групп, строки разной высоты).
 */
export function flowShift(t: number, doneAt: number, lap: number, pull: number): number {
  'worklet';
  const p0 = BEND.lead + BEND.bendIn;
  if (t <= p0) return 0;
  if (t <= SPIN_START) return -pull * Math.sin(((t - p0) / BEND.pull) * (Math.PI / 2));
  const tt = t - SPIN_START;
  const da = Number.isFinite(doneAt) ? doneAt - SPIN_START : Infinity;
  const s = wheelAt(tt, da, lap, BEND.spin, 0, BEND.maxCruise);
  const r = Math.min(1, tt / BEND.release);
  return s - pull * (1 - easeInOut(r));
}

/** Насколько список изогнут в момент t: 0 — ровный, 1 — изогнут. */
export function flowBend(t: number, doneAt: number, lap: number): number {
  'worklet';
  if (t <= BEND.lead) return 0;
  if (t < BEND.lead + BEND.bendIn) return easeInOut((t - BEND.lead) / BEND.bendIn);
  const out0 = flowEnd(doneAt, lap) - BEND.bendOut;
  if (t <= out0) return 1;
  return 1 - easeInOut(Math.min(1, (t - out0) / BEND.bendOut));
}

/**
 * Где верх элемента списка (от верха списка) при сдвиге `shift`: круг замкнут, «выше верха» — не дальше `above`.
 * `y` — где элемент стоит в ровном списке, `lap` — длина всего круга.
 */
export function wrapPlace(y: number, shift: number, lap: number, above: number): number {
  'worklet';
  if (lap <= 0) return y - shift;
  return ((((y - shift + above) % lap) + lap) % lap) - above;
}

/**
 * Элемент на изгибе: середина (рамка) ровная, края уходят назад. `d` — от середины рамки до середины элемента, px.
 * Возвращает, где середина элемента окажется (от середины рамки, с учётом перспективы), масштаб и наклон.
 * При bend = 0 — обычный ровный список.
 */
export function bendPlace(d: number, bend: number, radius: number, perspective: number): { y: number; scale: number; angle: number } {
  'worklet';
  if (bend < 1e-4) return { y: d, scale: 1, angle: 0 };
  const r = radius / bend;
  const a = d / r;
  const z = -r * (1 - Math.cos(a));
  const scale = perspective / (perspective - z);
  return { y: r * Math.sin(a) * scale, scale, angle: (-a * 180) / Math.PI };
}

/** Элемент списка на ходу: подзаголовок группы или друг (`slot` — номер друга по порядку). */
export type RunItem =
  | { kind: 'label'; key: string; title: string; star?: boolean }
  | {
      kind: 'row';
      key: string;
      friend: Friend;
      first: boolean;
      last: boolean;
      slot: number;
    };

/**
 * Список «Друзья» для хода — с подзаголовками групп, как на экране. Очень много друзей — первые `max`: последняя
 * группа закрывается на последнем, пустой подзаголовок в конце не остаётся. Повторов нет: короткий список просто
 * уезжает вверх и возвращается снизу (см. runGeometry).
 */
export function runItems(list: readonly FriendListItem[], max: number): RunItem[] {
  const out: RunItem[] = [];
  let friends = 0;
  for (const it of list) {
    if (friends >= max) break;
    if (it.type === 'label') out.push({ kind: 'label', key: it.key, title: it.title, star: it.star });
    else
      out.push({
        kind: 'row',
        key: it.key,
        friend: it.friend,
        first: it.first,
        last: it.last,
        slot: friends++,
      });
  }
  while (out.length && out[out.length - 1].kind === 'label') out.pop();
  const tail = out[out.length - 1];
  if (tail?.kind === 'row' && !tail.last) out[out.length - 1] = { ...tail, last: true };
  return out;
}

/** Где что в списке, px от его верха: элементы, длина круга, рамка. */
export interface RunGeo {
  y: number[];
  h: number[];
  /** Длина круга: весь список, но не меньше экрана — короткий список уходит целиком и возвращается снизу. */
  lap: number;
  /** Середина рамки. */
  mid: number;
  bandTop: number;
  bandH: number;
  /** Высота строки друга — шаг для оттяжки, изгиба и проявления. */
  row: number;
}

/**
 * Геометрия списка из двух замеров: высота подзаголовка и строки друга в середине группы. Строки в группе-карточке:
 * у первой — рамка сверху, у остальных — разделитель той же толщины, у последней ещё рамка снизу (+1).
 * Рамка хода — на месте BEND.bandRow-го друга (друзей меньше — на последнем).
 */
export function runGeometry(items: readonly ({ kind: 'label' } | { kind: 'row'; last: boolean })[], labelH: number, rowH: number, viewH: number): RunGeo {
  const y: number[] = [];
  const h: number[] = [];
  let at = 0;
  let band = -1;
  let rows = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const size = it.kind === 'label' ? labelH : rowH + (it.last ? 1 : 0);
    if (it.kind === 'row' && (rows++ <= BEND.bandRow || band < 0)) band = i;
    y.push(at);
    h.push(size);
    at += size;
  }
  const b = Math.max(0, band);
  return {
    y,
    h,
    lap: Math.max(at, viewH + 2 * rowH),
    mid: (y[b] ?? 0) + (h[b] ?? 0) / 2,
    bandTop: y[b] ?? 0,
    bandH: h[b] ?? rowH,
    row: rowH,
  };
}
