import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { useSvgId } from '@/components/ai/AiIcon';
import { Icon } from '@/components/Icon';
import { useTheme } from '@/components/ui';
import type { CalendarEvent } from '@/lib/calendar';

/**
 * Цвета значков событий: торт — градиент от персика к розе (линия тоньше), сердце — пыльная роза,
 * встречи — спокойный голубой, праздники — кирпичный «красный день». В светлой теме — те же оттенки темнее, чтобы читались
 * на бумаге.
 */
const KIND_PALETTE = {
  dark: { birthday: ['#FFB089', '#F0708C'], date: ['#E45D7B'], meeting: ['#86B6E0'], holiday: ['#D9534A'] },
  light: { birthday: ['#E07F55', '#C94A6B'], date: ['#C2405F'], meeting: ['#3F78AE'], holiday: ['#B5402C'] },
} as const satisfies Record<'dark' | 'light', Record<CalendarEvent['kind'], readonly string[]>>;

export function useKindColors() {
  const { scheme } = useTheme();
  return KIND_PALETTE[scheme === 'dark' ? 'dark' : 'light'];
}

/** Значок события: цвет или градиент из палитры. */
export function KindIcon({ kind, size, strokeWidth }: { kind: CalendarEvent['kind']; size: number; strokeWidth?: number }) {
  const stops = useKindColors()[kind];
  // Торт — тоньше: так он читается легче остальных значков.
  strokeWidth ??= kind === 'birthday' ? 1.6 : 2.2;
  return <Icon name={KIND_ICON[kind]} size={size} strokeWidth={strokeWidth} color={stops[stops.length - 1]} gradient={stops.length > 1 ? stops : undefined} />;
}

/**
 * Значок события — в днях месяца, в подписи под ним и на аватаре в списке (набор «Линии»). Праздник в сетке — красным
 * числом, а в списке дня — листком «красный день».
 */
const KIND_ICON = { birthday: 'cake', date: 'heart', meeting: 'clock', holiday: 'redDay' } as const;

/** Значок типа события в углу аватара: кружок цвета события (у дня рождения — градиентом) с белым значком. */
export function KindBadge({ kind }: { kind: CalendarEvent['kind'] }) {
  const { colors, scheme } = useTheme();
  const stops = useKindColors()[kind];
  const id = useSvgId('badge');
  // Торт на светлом персике в тёмной теме — тёмно-шоколадный: белый там почти не читался.
  const glyph = kind === 'birthday' && scheme === 'dark' ? '#4A2416' : '#FFFFFF';
  return (
    <View style={{ position: 'absolute', right: -3, bottom: -3, width: 18, height: 18, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={18} height={18} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={id} x1="2" y1="2" x2="16" y2="16" gradientUnits="userSpaceOnUse">
            {stops.map((c, i) => (
              <Stop key={i} offset={i / Math.max(1, stops.length - 1)} stopColor={c} />
            ))}
          </LinearGradient>
        </Defs>
        <Circle cx={9} cy={9} r={8} fill={`url(#${id})`} stroke={colors.card} strokeWidth={2} />
      </Svg>
      {/* Значок — поверх кружка (на вебе абсолютный кружок иначе ложится сверху). */}
      <View style={{ zIndex: 1 }}>
        <Icon name={KIND_ICON[kind]} size={9} color={glyph} strokeWidth={2.6} />
      </View>
    </View>
  );
}

