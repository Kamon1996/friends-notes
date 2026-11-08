import Svg, { Path } from 'react-native-svg';
import { Text, View } from 'react-native';

import { useTheme } from '@/lib/themeContext';
import { zodiacColors, zodiacSign, type ZodiacId } from '@/lib/zodiac';

/**
 * Знаки зодиака в стиле иконок приложения: линия 1,75 на сетке 24, скруглённые концы, без заливки.
 * Читаются и в 12–14 точек. Нарисованы вручную, чтобы не тянуть шрифт с символами ♈…♓ (на разных телефонах
 * он разный, а часто — цветные эмодзи).
 */
const GLYPHS: Record<ZodiacId, string> = {
  aries: 'M12 20V10.5 M12 10.5C12 6 10 3.5 7.5 3.5S3.5 5.5 3.5 7.5c0 1.3.6 2.3 1.6 2.8 M12 10.5C12 6 14 3.5 16.5 3.5s4 2 4 4c0 1.3-.6 2.3-1.6 2.8',
  taurus: 'M3.5 4c.8 3.6 4.4 6 8.5 6s7.7-2.4 8.5-6 M12 10a5 5 0 1 0 0 10a5 5 0 1 0 0-10',
  gemini: 'M4.5 4.5c4.7 1.6 10.3 1.6 15 0 M4.5 19.5c4.7-1.6 10.3-1.6 15 0 M9 5.6v12.8 M15 5.6v12.8',
  cancer: 'M4 9.5a2.75 2.75 0 1 0 5.5 0a2.75 2.75 0 1 0-5.5 0 M6.75 6.75C10.5 4 16.5 4.5 20 8 M14.5 14.5a2.75 2.75 0 1 0 5.5 0a2.75 2.75 0 1 0-5.5 0 M17.25 17.25C13.5 20 7.5 19.5 4 16',
  leo: 'M4 15.5a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M9.6 14.2C8.6 11.8 8.3 9.4 8.8 7.4 9.5 4.8 11.4 3.5 13.5 3.5c2.6 0 4.5 1.9 4.5 4.6 0 2.4-1.6 4-2.7 6-1 1.9-.9 3.9.4 5.2 1.1 1.1 2.7 1 3.8 0',
  virgo: 'M3.5 6.5c1.1 0 2 .9 2 2V18 M5.5 8.5c0-1.1.9-2 2-2s2 .9 2 2V18 M9.5 8.5c0-1.1.9-2 2-2s2 .9 2 2v5.8c0 3 2.6 4.6 5 3.2 M13.5 12.5c1.2-1.4 3.6-1.6 5-.4 1.6 1.4 1.3 4.1-.7 5.6-1 .7-2.2 1.4-3.6 2.3',
  libra: 'M4 19.5h16 M4 15.5h4.4a5 5 0 1 1 7.2 0H20',
  scorpio: 'M3.5 6.5c1.1 0 2 .9 2 2V18 M5.5 8.5c0-1.1.9-2 2-2s2 .9 2 2V18 M9.5 8.5c0-1.1.9-2 2-2s2 .9 2 2v8.5c0 1.4.9 2 2.2 2H20 M17.8 16.7l2.3 2.3-2.3 2.3',
  sagittarius: 'M4.5 19.5l15-15 M12 4.5h7.5V12 M7 10.5l6.5 6.5',
  capricorn: 'M3.5 6c1.2 0 2.2 1 2.2 2.2V17 M5.7 9.2C5.7 7.2 7.2 5.5 9.2 5.5s3.3 1.6 3.3 3.6v8.3c0 1.7 1.2 3 2.9 3 2 0 3.6-1.6 3.6-3.6 0-1.9-1.4-3.4-3.3-3.4-1.6 0-2.8 1-3.2 2.4',
  aquarius: 'M3.5 10l2.8-2.8L9.2 10l2.8-2.8L14.8 10l2.8-2.8L20.5 10 M3.5 16.5l2.8-2.8 2.9 2.8 2.8-2.8 2.8 2.8 2.8-2.8 2.9 2.8',
  pisces: 'M6 3.5c2.8 4.9 2.8 12.1 0 17 M18 3.5c-2.8 4.9-2.8 12.1 0 17 M5.5 12h13',
};

export function ZodiacGlyph({ sign, size = 14, color, strokeWidth = 2 }: { sign: ZodiacId; size?: number; color: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d={GLYPHS[sign]} />
    </Svg>
  );
}

/** Чип «♒ Водолей» рядом с отсчётом до дня рождения: цвет — по стихии знака. Тех же размеров, что чип «через N дней». */
export function ZodiacChip({ birthday }: { birthday: string | null | undefined }) {
  const { scheme, fonts } = useTheme();
  const sign = zodiacSign(birthday);
  if (!sign) return null;
  const c = zodiacColors(sign.element, scheme);
  return (
    <View
      accessible
      accessibilityLabel={`Знак зодиака: ${sign.name}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.bg, borderRadius: 999, paddingLeft: 6, paddingRight: 8, paddingVertical: 3 }}
    >
      <ZodiacGlyph sign={sign.id} size={12} color={c.icon} strokeWidth={2.2} />
      <Text style={{ color: c.text, fontFamily: fonts.semibold, fontSize: 11, lineHeight: 14 }}>{sign.name}</Text>
    </View>
  );
}
