import type { FriendListItem } from './friendList';
import type { Friend } from './types';
import { wheelAt, wheelEnd } from './wheel';

/**
 * Ход «пола друзей» прямо по списку: список оттягивают вниз и выдёргивают — полный круг через рамку (медленно → очень
 * быстро → медленно; ответа нет — крутится на полной скорости, пока не придёт), у проехавших рамку проявляется пол,
 * потом список встаёт, как стоял. Без изгиба и перспективы: только сдвиг — одинаково на любом телефоне.
 *
 * Время — секунды от старта; расстояния — px вдоль списка (список такой же, как в «Друзьях»: с подзаголовками групп).
 * Чистые функции с пометкой 'worklet': на телефоне считаются на UI-потоке каждый кадр, в тестах — как обычные.
 */
export const RUN = {
  /** Пока выезжает плашка. */
  lead: 0.35,
  /** Рамка и затемнение вокруг неё проявляются. */
  focusIn: 0.3,
  /** Оттянули вниз. */
  pull: 0.22,
  /** На сколько оттягиваем, в долях строки. */
  pullRows: 0.4,
  /** За сколько отпускаем оттяжку, уже двигаясь. */
  release: 0.35,
  /** Полный круг, если ответ готов сразу. */
  spin: 3.5,
  /** Рамка и затемнение гаснут. */
  focusOut: 0.35,
  /** Рамка — на друге, который ближе всех к этой доле высоты видимого списка. */
  bandAt: 0.5,
  /** Выше верха списка — не дальше стольких строк (дальше строка уже за краем). */
  above: 3,
  maxCruise: 20,
};

export const SPIN_START = RUN.lead + RUN.focusIn + RUN.pull;

function easeInOut(u: number): number {
  'worklet';
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

/** Когда список снова стоит (конец анимации), с. `lap` — длина круга (в чём угодно: строках, px). */
export function flowEnd(doneAt: number, lap: number): number {
  'worklet';
  const da = Number.isFinite(doneAt) ? doneAt - SPIN_START : Infinity;
  return SPIN_START + wheelEnd(da, lap, RUN.spin, 0, RUN.maxCruise) + RUN.focusOut;
}

/**
 * Сдвиг списка в момент t: 0 → оттянули на `pull` → полный круг, кратно `lap`. Единицы — те же, что у `lap` и `pull`
 * (на телефоне — px: список с подзаголовками групп, строки разной высоты).
 */
export function flowShift(t: number, doneAt: number, lap: number, pull: number): number {
  'worklet';
  const p0 = RUN.lead + RUN.focusIn;
  if (t <= p0) return 0;
  if (t <= SPIN_START) return -pull * Math.sin(((t - p0) / RUN.pull) * (Math.PI / 2));
  const tt = t - SPIN_START;
  const da = Number.isFinite(doneAt) ? doneAt - SPIN_START : Infinity;
  const s = wheelAt(tt, da, lap, RUN.spin, 0, RUN.maxCruise);
  const r = Math.min(1, tt / RUN.release);
  return s - pull * (1 - easeInOut(r));
}

/** Насколько видны рамка и затемнение вокруг неё в момент t: 0 — обычный список, 1 — ход. */
export function flowFocus(t: number, doneAt: number, lap: number): number {
  'worklet';
  if (t <= RUN.lead) return 0;
  if (t < RUN.lead + RUN.focusIn) return easeInOut((t - RUN.lead) / RUN.focusIn);
  const out0 = flowEnd(doneAt, lap) - RUN.focusOut;
  if (t <= out0) return 1;
  return 1 - easeInOut(Math.min(1, (t - out0) / RUN.focusOut));
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
 * Рамка хода — на друге, чья середина ближе всех к RUN.bandAt высоты видимого списка (список короче — на последнем),
 * чтобы изгиб был и сверху, и снизу. Радиус — от высоты списка: на любом экране крайние строки наклонены одинаково.
 */
export function runGeometry(items: readonly ({ kind: 'label' } | { kind: 'row'; last: boolean })[], labelH: number, rowH: number, viewH: number): RunGeo {
  const y: number[] = [];
  const h: number[] = [];
  let at = 0;
  let band = -1;
  let best = Infinity;
  const target = viewH * RUN.bandAt;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const size = it.kind === 'label' ? labelH : rowH + (it.last ? 1 : 0);
    if (it.kind === 'row') {
      const off = Math.abs(at + size / 2 - target);
      if (off < best) {
        best = off;
        band = i;
      }
    }
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
