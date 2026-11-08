import { memo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { Avatar } from '@/components/Avatar';
import { useTheme } from '@/components/ui';
import type { Gender } from '@/lib/gender';
import type { Friend } from '@/lib/types';
import { WHEEL, wheelDelta, wheelPlace } from '@/lib/wheel';
import { useSvgId } from './AiIcon';
import { AI_STOPS, genderTone } from './palette';

const RH = WHEEL.rowHeight;
const SIDE = 34;
const WORD_W = 64;
/** Ещё не проявилось. */
export const HIDDEN = 1e9;

export type WheelRow = Pick<Friend, 'id' | 'name' | 'photoUri' | 'thumbUri'> & { gender?: Gender };

/**
 * Барабан как выбор времени на iPhone: строки на цилиндре, в центре полоса выбора. Строка в полосе — яркая,
 * снаружи — приглушённая и наклонённая. Справа колонка «Пол»: слово проявляется, когда друг проезжает полосу
 * (момент — в `reveal`, в строках колеса). Всё движение считается на UI-потоке из `s` — положения колеса.
 */
export function GenderWheel({ rows, s, reveal, finished }: { rows: readonly WheelRow[]; s: SharedValue<number>; reveal: SharedValue<number[]>; finished: boolean }) {
  const { colors, scheme } = useTheme();
  const [box, setBox] = useState({ w: 0, h: 0 });
  const cy = box.h / 2;
  const n = rows.length;
  const gradId = useSvgId('band');
  const fadeId = useSvgId('fade');
  const bandW = Math.max(0, box.w - 32);
  return (
    <View
      style={{ flex: 1, overflow: 'hidden' }}
      onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      {box.h > 0 && (
        <>
          <View
            style={{
              position: 'absolute',
              left: 16,
              right: 16,
              top: cy - RH / 2,
              height: RH,
              borderRadius: 12,
              backgroundColor: scheme === 'dark' ? 'rgba(243,236,228,0.07)' : 'rgba(34,28,24,0.05)',
            }}
          />
          {rows.map((f, i) => (
            <Row
              key={i}
              row={i}
              rows={n}
              top={cy - RH / 2}
              friend={f}
              s={s}
              reveal={reveal}
              word={f.gender === 'f' ? 'жен.' : f.gender === 'm' ? 'муж.' : finished ? '—' : ''}
              wordColor={genderTone(scheme, f.gender).ring}
              bright={colors.text}
              dim={colors.text2}
            />
          ))}
          {/* Края цилиндра растворяются в фоне. */}
          <Svg width={box.w} height={box.h} style={StyleSheet.absoluteFill} pointerEvents="none">
            <Defs>
              <LinearGradient id={fadeId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={colors.bg} stopOpacity={1} />
                <Stop offset="0.12" stopColor={colors.bg} stopOpacity={0} />
                <Stop offset="0.88" stopColor={colors.bg} stopOpacity={0} />
                <Stop offset="1" stopColor={colors.bg} stopOpacity={1} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width={box.w} height={box.h} fill={`url(#${fadeId})`} />
          </Svg>
          {/* Рамка полосы — поверх строк: строки едут под ней, как под стеклом. */}
          <Svg width={bandW} height={RH} style={{ position: 'absolute', left: 16, top: cy - RH / 2 }} pointerEvents="none">
            <Defs>
              <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={AI_STOPS[0]} />
                <Stop offset="0.5" stopColor={AI_STOPS[1]} />
                <Stop offset="1" stopColor={AI_STOPS[2]} />
              </LinearGradient>
            </Defs>
            <Rect x={0.75} y={0.75} width={Math.max(0, bandW - 1.5)} height={RH - 1.5} rx={11.5} ry={11.5} fill="none" stroke={`url(#${gradId})`} strokeWidth={1.5} strokeOpacity={1} />
          </Svg>
          {/* Подписи колонок — прямо над колесом, как «часы | минуты». */}
          <View style={{ position: 'absolute', left: 0, right: 0, top: Math.max(0, cy - WHEEL.radius - 14) }}>
            <WheelColumns />
          </View>
        </>
      )}
    </View>
  );
}

const Row = memo(function Row({
  row,
  rows,
  top,
  friend,
  s,
  reveal,
  word,
  wordColor,
  bright,
  dim,
}: {
  row: number;
  rows: number;
  top: number;
  friend: WheelRow;
  s: SharedValue<number>;
  reveal: SharedValue<number[]>;
  word: string;
  wordColor: string;
  bright: string;
  dim: string;
}) {
  const { fonts } = useTheme();
  const place = useAnimatedStyle(() => {
    const p = wheelPlace(wheelDelta(s.get(), row, rows));
    if (!p.visible) return { opacity: 0, transform: [{ perspective: 900 }, { translateY: 0 }, { rotateX: '90deg' }] };
    return { opacity: p.opacity, transform: [{ perspective: 900 }, { translateY: p.y }, { rotateX: `${p.angle}deg` }] };
  });
  const name = useAnimatedStyle(() => {
    const d = Math.abs(wheelDelta(s.get(), row, rows));
    return { color: interpolateColor(Math.min(d, 0.7), [0, 0.7], [bright, dim]) };
  });
  const shown = useAnimatedStyle(() => {
    const at = reveal.get()[row] ?? HIDDEN;
    const k = (s.get() - at + 0.15) / 0.5;
    return { opacity: k <= 0 ? 0 : k >= 1 ? 1 : k };
  });
  return (
    <Animated.View
      style={[
        { position: 'absolute', left: 0, right: 0, top, height: RH, paddingHorizontal: SIDE, flexDirection: 'row', alignItems: 'center', gap: 12, backfaceVisibility: 'hidden' },
        place,
      ]}
    >
      <Avatar friend={friend} size={30} />
      <Animated.Text numberOfLines={1} style={[{ flex: 1, fontFamily: fonts.body, fontSize: 20 }, name]}>
        {friend.name}
      </Animated.Text>
      <Animated.View style={[{ width: WORD_W }, shown]}>
        <Text style={{ fontFamily: fonts.semibold, fontSize: 17, color: wordColor }}>{word}</Text>
      </Animated.View>
    </Animated.View>
  );
});

/** Подписи колонок над колесом. */
function WheelColumns() {
  const { s } = useTheme();
  const label = [s.caption, { letterSpacing: 0.8, textTransform: 'uppercase' as const }];
  return (
    <View style={{ flexDirection: 'row', paddingHorizontal: SIDE }}>
      <Text style={[label, { flex: 1, marginLeft: 42 }]}>Друг</Text>
      <Text style={[label, { width: WORD_W }]}>Пол</Text>
    </View>
  );
}
