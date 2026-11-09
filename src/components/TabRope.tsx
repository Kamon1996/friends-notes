import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { ROPE_WAVE_MS, type RopeWave } from '@/lib/tabRope';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Точки нитки: в покое чуть провисает, во время волны по ней бежит горб от вкладки, с которой ушли. */
function ropeY(u: number, y: number, t: number, dir: number) {
  'worklet';
  // Горб плавно появляется и гаснет; концы нитки держат ладошки — там он не поднимается.
  const env = Math.min(1, t * 6, (1 - t) * 6);
  const c = -0.25 + 1.5 * (0.5 - 0.5 * Math.cos(Math.PI * t));
  const uu = dir > 0 ? u : 1 - u;
  const bump = env * 11 * Math.exp(-(((uu - c) / 0.13) ** 2)) * Math.sqrt(Math.max(0, Math.sin(Math.PI * u)));
  return y + 3 * Math.sin(Math.PI * u) - bump;
}

const N = 24;

function ropePath(xa: number, xb: number, y: number, t: number, dir: number) {
  'worklet';
  let d = '';
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    d += `${i ? 'L' : 'M'}${(xa + (xb - xa) * u).toFixed(1)} ${ropeY(u, y, t, dir).toFixed(1)}`;
  }
  return d;
}

/** Отрезок нитки между соседними вкладками: нитка, ладошки у иконок и узелок-рукопожатие посередине. */
function RopeSegment({ xa, xb, y, wave, rest, glow }: { xa: number; xb: number; y: number; wave?: RopeWave; rest: string; glow: string }) {
  // 1 — покой (волна прошла или не начиналась).
  const t = useSharedValue(1);
  const dir = useSharedValue(1);
  const id = wave?.id ?? 0;
  const waveDir = wave?.dir ?? 1;
  const delay = wave?.delay ?? 0;
  useEffect(() => {
    if (!id) return;
    dir.set(waveDir);
    t.set(0);
    t.set(withDelay(delay, withTiming(1, { duration: ROPE_WAVE_MS, easing: Easing.linear })));
  }, [id, waveDir, delay, t, dir]);

  const glowOf = (v: number) => {
    'worklet';
    return v >= 1 ? 0 : Math.sin(Math.PI * v);
  };
  const baseProps = useAnimatedProps(() => ({ d: ropePath(xa, xb, y, t.get(), dir.get()) }));
  const glowProps = useAnimatedProps(() => ({ d: ropePath(xa, xb, y, t.get(), dir.get()), strokeOpacity: glowOf(t.get()) }));
  const knotProps = useAnimatedProps(() => ({ cy: ropeY(0.5, y, t.get(), dir.get()) }));
  const knotGlowProps = useAnimatedProps(() => ({ cy: ropeY(0.5, y, t.get(), dir.get()), fillOpacity: glowOf(t.get()) }));
  const xm = (xa + xb) / 2;
  return (
    <>
      <AnimatedPath animatedProps={baseProps} d={ropePath(xa, xb, y, 1, 1)} fill="none" stroke={rest} strokeWidth={1.6} strokeLinecap="round" />
      <AnimatedPath
        animatedProps={glowProps}
        d={ropePath(xa, xb, y, 1, 1)}
        fill="none"
        stroke={glow}
        strokeOpacity={0}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
      <Circle cx={xa} cy={y} r={1.8} fill={rest} />
      <Circle cx={xb} cy={y} r={1.8} fill={rest} />
      <AnimatedCircle animatedProps={knotProps} cx={xm} cy={y + 3} r={3.2} fill={rest} />
      <AnimatedCircle animatedProps={knotGlowProps} cx={xm} cy={y + 3} r={3.2} fill={glow} fillOpacity={0} />
    </>
  );
}

/**
 * «Ниточка» в нижней панели: иконки вкладок держатся за тонкую нитку, посередине — узелок. При переходе между
 * вкладками по нитке бежит горб — только между вкладками перехода и от той, с которой ушли; нитка на миг
 * загорается акцентом. Только украшение: нажатия проходят сквозь, диктору не видна.
 */
export function TabRope({
  width,
  count,
  y,
  edge,
  waves,
  rest,
  glow,
}: {
  width: number;
  count: number;
  /** Высота нитки — чуть ниже середины иконок. */
  y: number;
  /** От центра иконки до ладошки. */
  edge: number;
  waves: Readonly<Record<number, RopeWave>>;
  rest: string;
  glow: string;
}) {
  if (!width || count < 2) return null;
  const cx = (i: number) => ((i + 0.5) * width) / count;
  return (
    <View
      pointerEvents="none"
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{ position: 'absolute', left: 0, top: 0, width, height: y * 2 + 8 }}
    >
      <Svg width={width} height={y * 2 + 8} testID="tab-rope">
        {Array.from({ length: count - 1 }, (_, s) => (
          <RopeSegment key={s} xa={cx(s) + edge} xb={cx(s + 1) - edge} y={y} wave={waves[s]} rest={rest} glow={glow} />
        ))}
      </Svg>
    </View>
  );
}
