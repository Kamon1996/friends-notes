import { useEffect, useId, useState } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { AI_ICON_STOPS, AI_STOPS } from './palette';

/** Сердце-лента из значка приложения. */
const HEART = ['M12 8C11 4.6 7.2 4.2 5.6 6.4C4 8.6 4.8 11.4 7.4 14L15.6 21.6', 'M12 8C13 4.6 16.8 4.2 18.4 6.4C20 8.6 19.2 11.4 16.6 14L13.4 17', 'M10.6 19.4L8.6 21.4'];
/** Искра — знак «волшебства». */
export const SPARK = 'M12 2C12.6 7.2 16.8 11.4 22 12C16.8 12.6 12.6 16.8 12 22C11.4 16.8 7.2 12.6 2 12C7.2 11.4 11.4 7.2 12 2Z';
const INK = '#FFF5EE';

/** Уникальный id для градиентов SVG: двоеточия из useId ломают url(#…) в браузере. */
export function useSvgId(prefix: string): string {
  return prefix + useId().replace(/[^a-zA-Z0-9_-]/g, '');
}

/**
 * Заливка «волшебным» градиентом во весь родитель (кнопки, полоски). Размер — по замеру, в пикселях: проценты у SVG
 * на Android считаются не от родителя, и пилюля выходила меньше своего текста.
 */
export function AiGradient({ radius = 0, stops = AI_STOPS, opacity = 1 }: { radius?: number; stops?: readonly string[]; opacity?: number }) {
  const id = useSvgId('aig');
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {size && size.w > 0 && size.h > 0 && (
        <Svg width={size.w} height={size.h}>
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
              {stops.map((c, i) => (
                <Stop key={i} offset={i / (stops.length - 1)} stopColor={c} stopOpacity={opacity} />
              ))}
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width={size.w} height={size.h} rx={Math.min(radius, size.h / 2)} ry={Math.min(radius, size.h / 2)} fill={`url(#${id})`} />
        </Svg>
      )}
    </View>
  );
}

/** Искра, которая тихо мерцает. */
export function Spark({ size, color = INK, style }: { size: number; color?: string; style?: StyleProp<ViewStyle> }) {
  const reduce = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    t.set(withRepeat(withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => cancelAnimation(t);
  }, [reduce, t]);
  const anim = useAnimatedStyle(() => ({
    opacity: 0.5 + 0.5 * t.get(),
    transform: [{ scale: 0.55 + 0.45 * t.get() }, { rotate: `${45 * t.get()}deg` }],
  }));
  return (
    <Animated.View style={[{ width: size, height: size }, reduce ? { opacity: 0.9 } : anim, style]} pointerEvents="none">
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d={SPARK} fill={color} />
      </Svg>
    </Animated.View>
  );
}

/**
 * Значок ИИ: сердце из значка приложения на «волшебном» градиенте и мерцающая искра.
 * `busy` — ИИ работает в фоне: вокруг значка мягко дышит сияние.
 */
export function AiIcon({ size = 40, busy = false }: { size?: number; busy?: boolean }) {
  const id = useSvgId('aii');
  const glowId = useSvgId('aiglow');
  const reduce = useReducedMotion();
  const glow = useSharedValue(0);
  useEffect(() => {
    if (!busy) {
      glow.set(withTiming(0, { duration: 400 }));
      return;
    }
    if (reduce) {
      glow.set(0.7);
      return;
    }
    glow.set(withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => cancelAnimation(glow);
  }, [busy, reduce, glow]);
  const halo = useAnimatedStyle(() => ({ opacity: glow.get(), transform: [{ scale: 0.9 + 0.25 * glow.get() }] }));
  const r = size * 0.3;
  const heart = size * 0.62;
  const H = size * 1.9;
  return (
    <View style={{ width: size, height: size }}>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: H, height: H, left: (size - H) / 2, top: (size - H) / 2 }, halo]}>
        <Svg width={H} height={H}>
          <Defs>
            <RadialGradient id={glowId} cx="50%" cy="50%" r="50%">
              <Stop offset="0.35" stopColor={AI_STOPS[1]} stopOpacity={0.55} />
              <Stop offset="0.7" stopColor={AI_STOPS[2]} stopOpacity={0.18} />
              <Stop offset="1" stopColor={AI_STOPS[2]} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width={H} height={H} fill={`url(#${glowId})`} />
        </Svg>
      </Animated.View>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={AI_ICON_STOPS[0]} />
            <Stop offset="0.6" stopColor={AI_ICON_STOPS[1]} />
            <Stop offset="1" stopColor={AI_ICON_STOPS[2]} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={size} height={size} rx={r} ry={r} fill={`url(#${id})`} />
      </Svg>
      <View style={{ position: 'absolute', left: (size - heart) / 2, top: (size - heart) / 2 }} pointerEvents="none">
        <Svg width={heart} height={heart} viewBox="0 0 24 24">
          {HEART.map((d) => (
            <Path key={d} d={d} fill="none" stroke={INK} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
          ))}
        </Svg>
      </View>
      <Spark size={size * 0.3} style={{ position: 'absolute', right: size * 0.06, top: size * 0.05 }} />
    </View>
  );
}

/** Кнопка со значком ИИ для шапки экрана. */
export function AiButton({ onPress, busy, label = 'Магия для друзей' }: { onPress: () => void; busy?: boolean; label?: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={4}
      style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1, transform: [{ scale: pressed ? 0.94 : 1 }] })}
    >
      <AiIcon size={32} busy={busy} />
    </Pressable>
  );
}
