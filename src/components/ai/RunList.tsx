import { memo, useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { FRIEND_ROW_INSET, FriendGroupLabel, FriendRow } from '@/components/FriendRow';
import { Separator, groupedRowStyle, useTheme } from '@/components/ui';
import { BEND, bendPlace, wrapPlace, type RunItem } from '@/lib/bendFlow';
import { useSvgId } from './AiIcon';
import { AI_STOPS, genderTone } from './palette';

/** Ещё не проявилось. */
export const HIDDEN = 1e9;

/** Где что в списке, px от его верха: элементы, длина круга, рамка. Меряем на самом списке — до пикселя как в «Друзьях». */
export type RunGeo = {
  y: number[];
  h: number[];
  /** Длина круга. */
  lap: number;
  /** Середина рамки. */
  mid: number;
  bandTop: number;
  bandH: number;
  /** Высота строки друга — шаг для оттяжки и проявления. */
  row: number;
};

/**
 * Список «Друзья» точь-в-точь — подзаголовки, карточки групп, строки, — который изгибается и проходит полный круг
 * через рамку; у проехавших справа проявляется пол (`reveal` — в px «что сейчас в середине рамки»). Пока ровный и
 * стоит на месте — неотличим от настоящего списка: экран подменяется без проявления.
 */
export function RunList({
  items,
  top,
  clipTop,
  shift,
  bend,
  reveal,
  outro,
  geo,
  onGeo,
  today,
  zodiac,
  finished,
}: {
  items: readonly RunItem[];
  /** Где верх списка на экране (под шапкой). */
  top: number;
  /** Выше этого строки не рисуем. */
  clipTop: number;
  shift: SharedValue<number>;
  bend: SharedValue<number>;
  reveal: SharedValue<number[]>;
  /** 0 → 1: пол гаснет, метки и стрелки возвращаются — перед тем как экран уйдёт. */
  outro: SharedValue<number>;
  geo: SharedValue<RunGeo | null>;
  onGeo: (g: RunGeo) => void;
  today: string;
  zodiac: boolean;
  finished: boolean;
}) {
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();
  const gradId = useSvgId('runband');
  const [band, setBand] = useState<{ top: number; h: number } | null>(null);

  // Меряем каждый элемент; когда измерены все — отдаём размеры анимации. Состав списка не меняется (меняется только
  // пол у друзей), поэтому хватает числа элементов и того, где строки.
  const ys = useRef<number[]>([]);
  const hs = useRef<number[]>([]);
  const count = items.length;
  const rowKey = items.map((it) => (it.kind === 'row' ? 'r' : 'l')).join('');
  const measure = useCallback(
    (i: number, e: LayoutChangeEvent) => {
      ys.current[i] = e.nativeEvent.layout.y;
      hs.current[i] = e.nativeEvent.layout.height;
      for (let k = 0; k < count; k++) if (hs.current[k] === undefined) return;
      const y = ys.current.slice(0, count);
      const h = hs.current.slice(0, count);
      const last = count - 1;
      const rowIdx = [...rowKey].flatMap((c, k) => (c === 'r' ? [k] : []));
      const b = rowIdx[Math.min(BEND.bandRow, rowIdx.length - 1)] ?? 0;
      const g: RunGeo = { y, h, lap: y[last] + h[last], mid: y[b] + h[b] / 2, bandTop: y[b], bandH: h[b], row: h[rowIdx[1] ?? b] || h[b] };
      geo.set(g);
      setBand((prev) => (prev && prev.top === g.bandTop && prev.h === g.bandH ? prev : { top: g.bandTop, h: g.bandH }));
      onGeo(g);
    },
    [count, rowKey, geo, onGeo],
  );

  const dimStyle = useAnimatedStyle(() => ({ opacity: 0.3 * bend.get() }));
  const bandStyle = useAnimatedStyle(() => {
    const e = bend.get();
    return { opacity: e, transform: [{ scaleX: 0.94 + 0.06 * e }] };
  });
  const off = top - clipTop;
  return (
    <View style={[StyleSheet.absoluteFill, { top: clipTop, overflow: 'hidden' }]} pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <View style={{ position: 'absolute', left: 0, right: 0, top: off }}>
        {items.map((it, i) => (
          <RunEntry
            key={i}
            index={i}
            item={it}
            measure={measure}
            shift={shift}
            bend={bend}
            reveal={reveal}
            outro={outro}
            geo={geo}
            view={height}
            today={today}
            zodiac={zodiac}
            finished={finished}
          />
        ))}
      </View>
      {band && (
        <>
          <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: 0, height: Math.max(0, off + band.top - 2), backgroundColor: colors.bg }, dimStyle]} />
          <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: off + band.top + band.h + 2, height: 3000, backgroundColor: colors.bg }, dimStyle]} />
          {/* Рамка — поверх строк: они едут под ней, как под стеклом. */}
          <Animated.View style={[{ position: 'absolute', left: 12, right: 12, top: off + band.top - 2, height: band.h + 4 }, bandStyle]}>
            <Svg width={width - 24} height={band.h + 4}>
              <Defs>
                <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0" stopColor={AI_STOPS[0]} />
                  <Stop offset="0.5" stopColor={AI_STOPS[1]} />
                  <Stop offset="1" stopColor={AI_STOPS[2]} />
                </LinearGradient>
              </Defs>
              <Rect x="1" y="1" width={Math.max(0, width - 26)} height={band.h + 2} rx={16} ry={16} fill="none" stroke={`url(#${gradId})`} strokeWidth={1.75} />
            </Svg>
          </Animated.View>
        </>
      )}
    </View>
  );
}

/** Насколько проявился пол (0…1): строка с отметкой `at` подъезжает к середине рамки и целиком проявляется в ней. */
export function revealed(at: number, g: RunGeo | null, shift: number): number {
  'worklet';
  if (!g) return 0;
  const k = (g.mid + shift - at + 0.4 * g.row) / (0.4 * g.row);
  return k <= 0 ? 0 : k >= 1 ? 1 : k;
}

/** Тот же цвет, но прозрачный — чтобы карточка группы гасла, не темнея. */
function clear(color: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return 'transparent';
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, 0)`;
}

const RunEntry = memo(function RunEntry({
  index,
  item,
  measure,
  shift,
  bend,
  reveal,
  outro,
  geo,
  view,
  today,
  zodiac,
  finished,
}: {
  index: number;
  item: RunItem;
  measure: (i: number, e: LayoutChangeEvent) => void;
  shift: SharedValue<number>;
  bend: SharedValue<number>;
  reveal: SharedValue<number[]>;
  outro: SharedValue<number>;
  geo: SharedValue<RunGeo | null>;
  view: number;
  today: string;
  zodiac: boolean;
  finished: boolean;
}) {
  const { colors, fonts, scheme } = useTheme();
  const real = item.real;
  const place = useAnimatedStyle(() => {
    const g = geo.get();
    // пока не измерили — стоим как в обычном списке (повторы спрятаны)
    if (!g) return { opacity: real ? 1 : 0, transform: [{ translateY: 0 }, { perspective: 900 }, { scale: 1 }, { rotateX: '0deg' }] };
    const e = bend.get();
    const y = g.y[index] ?? 0;
    const h = g.h[index] ?? 0;
    const p = wrapPlace(y, shift.get(), g.lap, BEND.above * g.row);
    // ровный список — только первый круг и с верха списка; повторы и «выше верха» видны, пока список изогнут
    const visible = e > 0.02 ? p > -1.6 * g.row && p < view : real && p > -0.45 * g.row && p < view;
    const b = bendPlace(p + h / 2 - g.mid, e, BEND.radius, 900);
    // Сначала сдвиг, потом перспектива: каждую строку видно «в лоб», как на Android, даже если она приехала
    // из другого конца длинного списка (иначе в вебе дальние строки сплющивает).
    return {
      opacity: visible ? 1 : 0,
      transform: [{ translateY: g.mid + b.y - (y + h / 2) }, { perspective: 900 }, { scale: b.scale }, { rotateX: `${b.angle}deg` }],
    };
  });
  // Карточка группы гаснет, пока список изогнут: строки едут по одной. Цвета считаем здесь — на UI-потоке только числа.
  const card = [colors.card, clear(colors.card)];
  const hair = [colors.hairline, clear(colors.hairline)];
  const cardStyle = useAnimatedStyle(() => {
    const e = bend.get();
    return { backgroundColor: interpolateColor(e, [0, 1], card), borderColor: interpolateColor(e, [0, 1], hair) };
  });
  // Пол проявляется, когда друг подъезжает к середине рамки, и целиком — в ней; метки и стрелка в это время уходят.
  // Сдвиг читаем прямо в стиле: стиль пересчитывается только от общих значений, прочитанных в нём самом.
  const chip = useAnimatedStyle(() => {
    const v = revealed(reveal.get()[index] ?? HIDDEN, geo.get(), shift.get());
    return { opacity: v * (1 - outro.get()), transform: [{ scale: 0.6 + 0.4 * v }] };
  });
  const trailing = useAnimatedStyle(() => {
    const v = revealed(reveal.get()[index] ?? HIDDEN, geo.get(), shift.get());
    return { opacity: Math.max(1 - v, outro.get()) };
  });
  const onLayout = useCallback((e: LayoutChangeEvent) => measure(index, e), [measure, index]);

  if (item.kind === 'label') {
    return (
      <Animated.View onLayout={onLayout} style={[{ backfaceVisibility: 'hidden' }, place]}>
        <FriendGroupLabel title={item.title} star={item.star} />
      </Animated.View>
    );
  }
  const g = item.friend.gender;
  const word = g === 'f' ? 'Женщина' : g === 'm' ? 'Мужчина' : finished ? 'Загадка' : '';
  const tone = genderTone(scheme, g);
  return (
    <Animated.View onLayout={onLayout} style={[{ paddingHorizontal: 20, backfaceVisibility: 'hidden' }, place]}>
      <Animated.View style={[groupedRowStyle(item.first, item.last), cardStyle]}>
        {!item.first && <Separator inset={FRIEND_ROW_INSET} />}
        <FriendRow friend={item.friend} today={today} zodiac={zodiac} selected={false} selecting={false} onPress={noop} onLongPress={noop} trailingStyle={trailing} />
        {word ? (
          <View style={{ position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' }}>
            <Animated.View
              style={[
                {
                  borderRadius: 999,
                  paddingHorizontal: 9,
                  paddingVertical: 3,
                  backgroundColor: g ? tone.bg : 'transparent',
                  borderWidth: 1,
                  borderStyle: g ? 'solid' : 'dashed',
                  borderColor: g ? tone.bg : tone.ring,
                },
                chip,
              ]}
            >
              <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: tone.fg }}>{word}</Text>
            </Animated.View>
          </View>
        ) : null}
      </Animated.View>
    </Animated.View>
  );
});

function noop() {}
