import { Text, View } from 'react-native';

import type { Release } from '@/lib/changelog';
import { formatDate } from '@/lib/dates';
import { Tag, useTheme } from './ui';

/** Одна версия: номер, дата и пункты изменений. Общая для шторки после обновления и экрана истории. */
export function ReleaseNotes({ release, current, compact }: { release: Release; current?: boolean; compact?: boolean }) {
  const { s, colors, fonts } = useTheme();
  return (
    <View style={{ gap: compact ? 8 : 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <Text style={[s.name, { fontFamily: fonts.display }]}>{release.version}</Text>
        <Text style={s.caption}>{formatDate(release.date)}</Text>
        {current && <Tag text="установлена" tone="accent" />}
      </View>
      <View style={{ gap: 8 }}>
        {release.items.map((item) => (
          <View key={item} style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent, marginTop: 8 }} />
            <Text style={[s.body, { flex: 1, fontSize: 15, lineHeight: 21 }]}>{item}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
