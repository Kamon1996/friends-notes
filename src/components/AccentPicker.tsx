import { Pressable, Text, View } from 'react-native';

import { ACCENTS, accentById, type AccentId, type Scheme } from '@/lib/theme';
import { Icon } from './Icon';
import { useTheme } from './ui';

/** Шесть кружков акцента для одной темы; выбранный — с кольцом и галочкой. */
export function AccentPicker({ scheme, value, onChange }: { scheme: Scheme; value: AccentId; onChange: (id: AccentId) => void }) {
  const { colors, fonts } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
      {ACCENTS.map((a) => {
        const c = a[scheme];
        const selected = a.id === value;
        return (
          <Pressable key={a.id} onPress={() => onChange(a.id)} accessibilityLabel={a.name} aria-selected={selected} style={{ alignItems: 'center', gap: 6, flex: 1 }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                borderWidth: 2,
                borderColor: selected ? colors.text : 'transparent',
                padding: 3,
              }}
            >
              <View style={{ flex: 1, borderRadius: 17, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
                {selected && <Icon name="check" size={16} color={c.onAccent} strokeWidth={3} />}
              </View>
            </View>
            <Text style={{ fontFamily: selected ? fonts.semibold : fonts.body, fontSize: 10, lineHeight: 12, color: selected ? colors.text : colors.text3 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {a.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Две точки выбранных цветов — светлой и тёмной темы — для строки в настройках. */
export function AccentDots({ light, dark }: { light: AccentId; dark: AccentId }) {
  const { colors } = useTheme();
  const dot = (bg: string, first: boolean) => ({ width: 22, height: 22, borderRadius: 11, backgroundColor: bg, borderWidth: 2, borderColor: colors.card, marginLeft: first ? 0 : -8 });
  return (
    <View style={{ flexDirection: 'row' }} accessible accessibilityLabel={`Цвета: ${accentById(light).name} и ${accentById(dark).name}`}>
      <View style={dot(accentById(light).light.accent, true)} />
      <View style={dot(accentById(dark).dark.accent, false)} />
    </View>
  );
}
