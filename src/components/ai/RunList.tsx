import { memo } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { useTheme } from '@/components/ui';
import { BEND, bendPlace, rowPlace } from '@/lib/bendFlow';
import type { Gender } from '@/lib/gender';
import type { Friend } from '@/lib/types';
import { useSvgId } from './AiIcon';
import { AI_STOPS, genderTone } from './palette';

/** Ещё не проявилось. */
export const HIDDEN = 1e9;

export type RunRowData = { friend: Friend; subtitle: string; gender?: Gender; real: boolean };

/**
 * Список друзей, который изгибается и проходит полный круг через рамку. Выглядит как обычный список «Друзья»; пол
 * проявляется справа, когда друг проезжает рамку (`reveal` — в строках «какая строка в рамке»). `top` — где на экране
 * верх первой строки; рамка — на месте строки BEND.band.
 */
export function RunList({
  rows,
  top,
  clipTop,
  shift,
  bend,
  reveal,
  finished,
}: {
  rows: readonly RunRowData[];
  top: number;
  clipTop: number;
  shift: SharedValue<number>;
  bend: SharedValue<number>;
  reveal: SharedValue<number[]>;
  finished: boolean;
}) {
  const { colors, scheme } = useTheme();
  const { width } = useWindowDimensions();
  const bandTop = top + BEND.band * BEND.row;
  const n = rows.length;
  const gradId = useSvgId('runband');
  const cardStyle = useAnimatedStyle(() => ({ opacity: 1 - bend.get() }));
  const dimStyle = useAnimatedStyle(() => ({ opacity: 0.3 * bend.get() }));
  const bandStyle = useAnimatedStyle(() => {
    const e = bend.get();
    return { opacity: e, transform: [{ scaleX: 0.94 + 0.06 * e }] };
  });
  return (
    <View style={[StyleSheet.absoluteFill, { top: clipTop, overflow: 'hidden' }]} pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <View style={{ position: 'absolute', left: 0, right: 0, top: -clipTop, bottom: 0 }}>
        <Animated.View
          style={[{ position: 'absolute', left: 20, right: 20, top, height: 2000, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline, borderRadius: 20 }, cardStyle]}
        />
        {rows.map((r, i) => (
          <RunRow
            key={i}
            row={i}
            rows={n}
            data={r}
            top={bandTop}
            shift={shift}
            bend={bend}
            reveal={reveal}
            word={r.gender === 'f' ? 'Женщина' : r.gender === 'm' ? 'Мужчина' : finished ? 'Загадка' : ''}
            tone={genderTone(scheme, r.gender)}
          />
        ))}
        <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: 0, height: bandTop - 2, backgroundColor: colors.bg }, dimStyle]} />
        <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: bandTop + BEND.row + 2, height: 3000, backgroundColor: colors.bg }, dimStyle]} />
        {/* Рамка — поверх строк: они едут под ней, как под стеклом. */}
        <Animated.View style={[{ position: 'absolute', left: 12, right: 12, top: bandTop - 2, height: BEND.row + 4 }, bandStyle]}>
          <Svg width={width - 24} height={BEND.row + 4}>
            <Defs>
              <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={AI_STOPS[0]} />
                <Stop offset="0.5" stopColor={AI_STOPS[1]} />
                <Stop offset="1" stopColor={AI_STOPS[2]} />
              </LinearGradient>
            </Defs>
            <Rect x="1" y="1" width={Math.max(0, width - 26)} height={BEND.row + 2} rx={16} ry={16} fill="none" stroke={`url(#${gradId})`} strokeWidth={1.75} />
          </Svg>
        </Animated.View>
      </View>
    </View>
  );
}

const RunRow = memo(function RunRow({
  row,
  rows,
  data,
  top,
  shift,
  bend,
  reveal,
  word,
  tone,
}: {
  row: number;
  rows: number;
  data: RunRowData;
  top: number;
  shift: SharedValue<number>;
  bend: SharedValue<number>;
  reveal: SharedValue<number[]>;
  word: string;
  tone: { ring: string; fg: string; bg: string };
}) {
  const { s, colors, fonts } = useTheme();
  const real = data.real;
  const place = useAnimatedStyle(() => {
    const e = bend.get();
    const p = rowPlace(row, shift.get(), rows);
    // ровный список — только сами друзья и с первой строки; повторы и «выше верха» видны, пока список изогнут
    const visible = e > 0.02 ? p > -1.6 && p < 12 : real && p > -0.45 && p < 12;
    const b = bendPlace(p, e);
    return {
      opacity: visible ? 1 : 0,
      transform: [{ perspective: 900 }, { translateY: b.y }, { scale: b.scale }, { rotateX: `${b.angle}deg` }],
    };
  });
  const chip = useAnimatedStyle(() => {
    const at = reveal.get()[row] ?? HIDDEN;
    const k = (BEND.band + shift.get() - at + 0.2) / 0.4;
    const v = k <= 0 ? 0 : k >= 1 ? 1 : k;
    return { opacity: v, transform: [{ scale: 0.6 + 0.4 * v }] };
  });
  const chevron = useAnimatedStyle(() => {
    const at = reveal.get()[row] ?? HIDDEN;
    return { opacity: BEND.band + shift.get() >= at ? 0 : 1 };
  });
  const unknown = !data.gender;
  return (
    <Animated.View style={[{ position: 'absolute', left: 20, right: 20, top, height: BEND.row, backfaceVisibility: 'hidden' }, place]}>
      <View style={{ position: 'absolute', left: 70, right: 0, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.separator }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, height: BEND.row }}>
        <Avatar friend={data.friend} size={44} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={s.name} numberOfLines={1}>
            {data.friend.name}
          </Text>
          <Text style={[s.muted, { fontVariant: ['tabular-nums'] }]} numberOfLines={1}>
            {data.subtitle}
          </Text>
        </View>
        <View style={{ width: 84, height: 26, alignItems: 'flex-end', justifyContent: 'center' }}>
          <Animated.View style={[{ position: 'absolute', right: 0 }, chevron]}>
            <Icon name="chevronRight" size={18} color={colors.checkbox} strokeWidth={2} />
          </Animated.View>
          {word ? (
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  right: 0,
                  borderRadius: 999,
                  paddingHorizontal: 9,
                  paddingVertical: 3,
                  backgroundColor: unknown ? 'transparent' : tone.bg,
                  borderWidth: 1,
                  borderStyle: unknown ? 'dashed' : 'solid',
                  borderColor: unknown ? tone.ring : tone.bg,
                },
                chip,
              ]}
            >
              <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: tone.fg }}>{word}</Text>
            </Animated.View>
          ) : null}
        </View>
      </View>
    </Animated.View>
  );
});
