import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { buildQr } from '@/lib/qr';

/** QR-код из строки: белая подложка и один SVG-путь со всеми тёмными модулями. */
export function QrCode({ value, size }: { value: string; size: number }) {
  const qr = useMemo(() => buildQr(value), [value]);
  const quiet = 2; // тихая зона в модулях
  const total = qr.size + quiet * 2;
  return (
    <View style={{ width: size, height: size, borderRadius: 12, overflow: 'hidden' }}>
      <Svg width={size} height={size} viewBox={`0 0 ${total} ${total}`}>
        <Rect x={0} y={0} width={total} height={total} fill="#fff" />
        <Path d={qr.path} fill="#1F1D1A" transform={`translate(${quiet} ${quiet})`} />
      </Svg>
    </View>
  );
}
