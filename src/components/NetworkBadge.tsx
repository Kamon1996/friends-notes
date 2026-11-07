import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { BRAND_GLYPHS, EVENODD_GLYPHS } from '@/lib/brandGlyphs';
import { networkById } from '@/lib/socials';
import { Icon } from './Icon';
import { useTheme } from './ui';

/** Монограмма для сети без своего значка: «Од» → «OD», «Buy Me a Coffee» → «BM», «500px» → «5P». */
export function networkMonogram(name: string): string {
  const parts = name.replace(/[()]/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (/^\d/.test(parts[0])) {
    const letter = parts[0].replace(/[^A-Za-zА-Яа-я]/g, '')[0] ?? '';
    return (parts[0][0] + letter).toUpperCase();
  }
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2)).toUpperCase();
}

/** Значок сети без подложки: эмблема сети, глобус для сайта или монограмма — для чипов и строк. */
export function NetworkGlyph({ network, size = 16, color }: { network: string; size?: number; color: string }) {
  const { fonts } = useTheme();
  const n = networkById(network);
  const d = BRAND_GLYPHS[n.id];
  if (d) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d={d} fill={color} fillRule={EVENODD_GLYPHS.has(n.id) ? 'evenodd' : 'nonzero'} />
      </Svg>
    );
  }
  if (n.icon) return <Icon name={n.icon} size={size} color={color} strokeWidth={2} />;
  return (
    <Text style={{ fontFamily: fonts.semibold, fontSize: Math.round(size * 0.68), lineHeight: size, color, letterSpacing: 0.3 }} maxFontSizeMultiplier={1.2}>
      {networkMonogram(n.name)}
    </Text>
  );
}

/** Значок сети в кружке — для строк списка и шторки. */
export function NetworkBadge({ network, size = 36, tone = 'neutral' }: { network: string; size?: number; tone?: 'neutral' | 'accent' }) {
  const { colors } = useTheme();
  const bg = tone === 'accent' ? colors.soft : colors.chip;
  const fg = tone === 'accent' ? colors.accent : colors.text;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <NetworkGlyph network={network} size={Math.round(size / 2)} color={fg} />
    </View>
  );
}
