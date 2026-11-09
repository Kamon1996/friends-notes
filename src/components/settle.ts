/**
 * Сколько доводить экран после свайпа (мс), чтобы он продолжил движение со скоростью пальца, а не дёрнулся:
 * Easing.out(cubic) стартует со скоростью 3·путь/время — отсюда время. Медленно отпустил — плавно, быстро — быстро.
 */
export function settleDuration(distance: number, velocity: number) {
  'worklet';
  const d = Math.abs(distance);
  const v = Math.abs(velocity);
  const t = v > 1 ? (3 * d * 1000) / v : 320;
  return Math.max(160, Math.min(340, t));
}
