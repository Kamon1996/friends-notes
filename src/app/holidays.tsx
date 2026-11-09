import { Pressable, ScrollView, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { Group, useTheme } from '@/components/ui';
import { HOLIDAY_COUNTRIES, HOLIDAY_YEARS, holidayCountries, holidayCountryCount } from '@/lib/holidays';
import { useStore } from '@/lib/store';
import { plural } from '@/lib/dates';

const holidayCountLabel = (n: number) => `${n} ${plural(n, 'праздник', 'праздника', 'праздников')} в году`;

/**
 * Праздники каких стран показывать в календаре — галочками, можно несколько. Открывается флажком в шапке календаря.
 * Сначала выбрана страна телефона; база — в приложении, ничего не скачивается.
 */
export default function HolidaysScreen() {
  const { data, updateSettings } = useStore();
  const { s, colors, fonts } = useTheme();
  const chosen = new Set(holidayCountries(data.settings));
  const toggle = (code: string) => {
    const next = new Set(chosen);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    updateSettings({ holidayCountries: HOLIDAY_COUNTRIES.filter((c) => next.has(c.code)).map((c) => c.code) });
  };
  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.content, { paddingBottom: 40 }]}>
      <Text style={s.muted}>
        Отметь страны — их официальные праздники появятся в календаре флажком. Нажми на праздник в списке дня — там описание.
      </Text>
      <Text style={[s.sectionLabel, { marginTop: 8 }]}>{chosen.size ? `Выбрано: ${chosen.size}` : 'Ничего не выбрано'}</Text>
      <Group inset={62}>
        {HOLIDAY_COUNTRIES.map((c) => {
          const on = chosen.has(c.code);
          return (
            <Pressable
              key={c.code}
              onPress={() => toggle(c.code)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={c.name}
              style={({ pressed }) => [s.row, s.rowPad, pressed && { opacity: 0.6 }]}
            >
              <Text style={{ fontSize: 26, width: 36, textAlign: 'center' }}>{c.flag}</Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.title}>{c.name}</Text>
                <Text style={s.caption}>{holidayCountLabel(holidayCountryCount(c.code))}</Text>
              </View>
              {/* Квадратная галочка — «можно несколько», не кружок-переключатель. Квадрат — отдельным видом и заново
                  при смене: на Android смена фона у скруглённого вида теряла скругление. */}
              <View
                key={on ? 'on' : 'off'}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 7,
                  borderWidth: 1.5,
                  borderColor: on ? colors.accent : colors.checkbox,
                  backgroundColor: on ? colors.accent : colors.card,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {on && <Icon name="check" size={14} color={colors.onAccent} strokeWidth={3} />}
              </View>
            </Pressable>
          );
        })}
      </Group>
      <Text style={[s.caption, { textAlign: 'center', paddingTop: 6, fontFamily: fonts.body }]}>
        {`Даты на ${HOLIDAY_YEARS[0]}–${HOLIDAY_YEARS[1]} годы — из открытой базы праздников python-holidays, описания — из Википедии.`}
      </Text>
    </ScrollView>
  );
}
