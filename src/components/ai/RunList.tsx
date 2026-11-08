import { memo, useRef } from 'react';
import { Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { FRIEND_ROW_INSET, FriendGroupLabel, FriendRow } from '@/components/FriendRow';
import { Separator, groupedRowStyle, useTheme } from '@/components/ui';
import { BEND, bendPlace, wrapPlace, type RunGeo, type RunItem } from '@/lib/bendFlow';
import type { Friend } from '@/lib/types';
import { useSvgId } from './AiIcon';
import { AI_STOPS, genderTone } from './palette';

/** Ещё не проявилось. */
export const HIDDEN = 1e9;

/** Перспектива для наклона строк, px. */
const PERSPECTIVE = 900;
/**
 * Строки стоят в середине рамки и сдвигаются от неё не дальше экрана. Android и веб складывают сдвиг с перспективой
 * по-разному (на Android сдвиг перед перспективой искажает строку, в вебе — после), поэтому порядок свой у каждого.
 */
const SHIFT_FIRST = Platform.OS === 'web';
// Неизменные значения: стиль, который не поменялся, Reanimated не отправляет в натив — строки за экраном не стоят ничего.
const OFF = [{ translateY: 0 }, { perspective: PERSPECTIVE }, { scale: 1 }, { rotateX: '0deg' }];
const CHIP_OFF = [{ scale: 0.6 }];
const CHIP_ON = [{ scale: 1 }];

/** Насколько проявился пол (0…1): строка с отметкой `at` подъезжает к середине рамки и целиком проявляется в ней. */
export function revealed(at: number, mid: number, row: number, shift: number): number {
  'worklet';
  const k = (mid + shift - at + 0.4 * row) / (0.4 * row);
  return k <= 0 ? 0 : k >= 1 ? 1 : k;
}

/**
 * Список «Друзья» точь-в-точь — подзаголовки, карточки групп, строки — на ходу: чуть изгибается сверху и снизу и
 * проходит полный круг через рамку; у проехавших справа проявляется пол (`reveal` — в px «что в середине рамки»).
 * Все элементы стоят в середине рамки и сдвигаются на своё место трансформацией: в покое — ровно туда, где они
 * в настоящем списке. Координаты — от верха списка (верх этого слоя).
 */
export function RunList({
  items,
  geo,
  viewH,
  shift,
  bend,
  reveal,
  outro,
  today,
  zodiac,
  finished,
}: {
  items: readonly RunItem[];
  geo: RunGeo;
  /** Высота видимой части списка. */
  viewH: number;
  shift: SharedValue<number>;
  bend: SharedValue<number>;
  reveal: SharedValue<number[]>;
  /** 0 → 1: пол гаснет, метки и стрелки возвращаются — перед тем как слой уйдёт. */
  outro: SharedValue<number>;
  today: string;
  zodiac: boolean;
  finished: boolean;
}) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const gradId = useSvgId('runband');
  const dimStyle = useAnimatedStyle(() => ({ opacity: 0.3 * bend.get() }));
  const bandStyle = useAnimatedStyle(() => {
    const e = bend.get();
    return { opacity: e, transform: [{ scaleX: 0.94 + 0.06 * e }] };
  });
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {items.map((it, i) => (
        <RunEntry
          key={it.key}
          index={i}
          item={it}
          geo={geo}
          viewH={viewH}
          shift={shift}
          bend={bend}
          reveal={reveal}
          outro={outro}
          today={today}
          zodiac={zodiac}
          finished={finished}
        />
      ))}
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            height: Math.max(0, geo.bandTop - 2),
            backgroundColor: colors.bg,
          },
          dimStyle,
        ]}
      />
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            top: geo.bandTop + geo.bandH + 2,
            bottom: 0,
            backgroundColor: colors.bg,
          },
          dimStyle,
        ]}
      />
      {/* Рамка — поверх строк: они едут под ней, как под стеклом. */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 12,
            right: 12,
            top: geo.bandTop - 2,
            height: geo.bandH + 4,
          },
          bandStyle,
        ]}
      >
        <Svg width={width - 24} height={geo.bandH + 4}>
          <Defs>
            <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={AI_STOPS[0]} />
              <Stop offset="0.5" stopColor={AI_STOPS[1]} />
              <Stop offset="1" stopColor={AI_STOPS[2]} />
            </LinearGradient>
          </Defs>
          <Rect x="1" y="1" width={Math.max(0, width - 26)} height={geo.bandH + 2} rx={16} ry={16} fill="none" stroke={`url(#${gradId})`} strokeWidth={1.75} />
        </Svg>
      </Animated.View>
    </View>
  );
}

/**
 * Замеры для геометрии: подзаголовок и строка в середине группы — те же компоненты, невидимые. Остальное считается
 * (runGeometry), поэтому каждую строку мерить не нужно.
 */
export function RunProbe({
  friend,
  today,
  zodiac,
  onMeasure,
}: {
  friend: Friend;
  today: string;
  zodiac: boolean;
  onMeasure: (label: number, row: number) => void;
}) {
  const { colors } = useTheme();
  const got = useRef<{ label?: number; row?: number }>({});
  const report = () => {
    const { label, row } = got.current;
    if (label && row) onMeasure(label, row);
  };
  return (
    <View
      style={{ position: 'absolute', left: 0, right: 0, top: 0, opacity: 0 }}
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <View
        onLayout={(e) => {
          got.current.label = e.nativeEvent.layout.height;
          report();
        }}
      >
        <FriendGroupLabel title="А" />
      </View>
      <View
        style={[
          {
            marginHorizontal: 20,
            backgroundColor: colors.card,
            borderColor: colors.hairline,
          },
          groupedRowStyle(false, false),
        ]}
        onLayout={(e) => {
          got.current.row = e.nativeEvent.layout.height;
          report();
        }}
      >
        <Separator inset={FRIEND_ROW_INSET} />
        <FriendRow friend={friend} today={today} zodiac={zodiac} selected={false} selecting={false} onPress={noop} onLongPress={noop} />
      </View>
    </View>
  );
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
  geo,
  viewH,
  shift,
  bend,
  reveal,
  outro,
  today,
  zodiac,
  finished,
}: {
  index: number;
  item: RunItem;
  geo: RunGeo;
  viewH: number;
  shift: SharedValue<number>;
  bend: SharedValue<number>;
  reveal: SharedValue<number[]>;
  outro: SharedValue<number>;
  today: string;
  zodiac: boolean;
  finished: boolean;
}) {
  const { colors, fonts, scheme } = useTheme();
  const y = geo.y[index] ?? 0;
  const h = geo.h[index] ?? 0;
  const { lap, mid, row, radius } = geo;
  const above = BEND.above * row;
  const isRow = item.kind === 'row';
  // Карточка группы гаснет, пока список изогнут: строки едут по одной. Цвета — здесь, на UI-потоке только числа.
  const card = isRow ? [colors.card, clear(colors.card)] : null;
  const hair = isRow ? [colors.hairline, clear(colors.hairline)] : null;

  const place = useAnimatedStyle(() => {
    const e = bend.get();
    const p = wrapPlace(y, shift.get(), lap, above);
    // ровный список — с верха списка; «выше верха» видно, только пока список изогнут
    const visible = p < viewH && p > (e > 0.02 ? -1.6 * row : -0.45 * row);
    const colorsNow =
      card && hair
        ? {
            backgroundColor: interpolateColor(e, [0, 1], card),
            borderColor: interpolateColor(e, [0, 1], hair),
          }
        : {};
    if (!visible) return { opacity: 0, transform: OFF, ...colorsNow };
    const b = bendPlace(p + h / 2 - mid, e, radius, PERSPECTIVE);
    const ty = b.y - h / 2;
    return {
      opacity: 1,
      transform: SHIFT_FIRST
        ? [{ translateY: ty }, { perspective: PERSPECTIVE }, { scale: b.scale }, { rotateX: `${b.angle}deg` }]
        : [{ perspective: PERSPECTIVE }, { translateY: ty }, { scale: b.scale }, { rotateX: `${b.angle}deg` }],
      ...colorsNow,
    };
  });
  const chip = useAnimatedStyle(() => {
    const v = revealed(reveal.get()[index] ?? HIDDEN, mid, row, shift.get());
    return {
      opacity: v * (1 - outro.get()),
      transform: v <= 0 ? CHIP_OFF : v >= 1 ? CHIP_ON : [{ scale: 0.6 + 0.4 * v }],
    };
  });
  const trailing = useAnimatedStyle(() => {
    const v = revealed(reveal.get()[index] ?? HIDDEN, mid, row, shift.get());
    return { opacity: Math.max(1 - v, outro.get()) };
  });

  if (item.kind === 'label') {
    return (
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            top: mid,
            backfaceVisibility: 'hidden',
          },
          place,
        ]}
      >
        <FriendGroupLabel title={item.title} star={item.star} />
      </Animated.View>
    );
  }
  const g = item.friend.gender;
  const word = g === 'f' ? 'Женщина' : g === 'm' ? 'Мужчина' : finished ? 'Загадка' : '';
  const tone = genderTone(scheme, g);
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: 20,
          right: 20,
          top: mid,
          backfaceVisibility: 'hidden',
        },
        groupedRowStyle(item.first, item.last),
        place,
      ]}
    >
      {!item.first && <Separator inset={FRIEND_ROW_INSET} />}
      <FriendRow
        friend={item.friend}
        today={today}
        zodiac={zodiac}
        selected={false}
        selecting={false}
        onPress={noop}
        onLongPress={noop}
        trailingStyle={trailing}
      />
      {word ? (
        <View
          style={{
            position: 'absolute',
            right: 14,
            top: 0,
            bottom: 0,
            justifyContent: 'center',
          }}
        >
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
            <Text
              style={{
                fontFamily: fonts.semibold,
                fontSize: 12,
                color: tone.fg,
              }}
            >
              {word}
            </Text>
          </Animated.View>
        </View>
      ) : null}
    </Animated.View>
  );
});

function noop() {}
