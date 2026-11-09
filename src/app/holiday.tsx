import { Stack, useLocalSearchParams } from 'expo-router';
import { Linking, ScrollView, Text, View } from 'react-native';

import { KindIcon } from '@/components/CalendarIcons';
import { Button, Card, Tag, useTheme } from '@/components/ui';
import { formatDateLong, parseISODate, relativeDay, todayISO } from '@/lib/dates';
import { formatHolidayDays, holidayCountry, holidayDatesInYear, holidayInfo, holidayName, holidaysIn } from '@/lib/holidays';

/**
 * Праздник подробно: что за день, в каких странах, все его дни в году и описание из Википедии со ссылкой на статью.
 * Открывается из списка дня в календаре. Параметры: id праздника, date — какой день смотрели, also — тот же праздник
 * других выбранных стран в этот день.
 */
export default function HolidayScreen() {
  const { id = '', date = todayISO(), also = '' } = useLocalSearchParams<{ id?: string; date?: string; also?: string }>();
  const { s, colors, fonts } = useTheme();
  const info = holidayInfo(id);
  const ids = [id, ...also.split(',').filter(Boolean)];
  const countries = ids.map((h) => holidayCountry(h.split(':')[0])).filter((c) => c !== undefined);
  const year = parseISODate(date).getFullYear();
  const days = holidayDatesInYear(id, year);
  const estimated = holidaysIn([id.split(':')[0]], date, date).some((h) => h.id === id && h.estimated);
  const today = todayISO();

  if (!info) {
    return (
      <View style={[s.screen, s.content]}>
        <Stack.Screen options={{ title: 'Праздник' }} />
        <Text style={s.muted}>Такого праздника в базе нет — возможно, база обновилась.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.content, { paddingBottom: 40 }]}>
      <Stack.Screen options={{ title: 'Праздник' }} />
      <View style={{ alignItems: 'center', gap: 8, paddingTop: 4 }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center' }}>
          <KindIcon kind="holiday" size={30} strokeWidth={1.9} />
        </View>
        <Text style={[s.h2, { fontSize: 24, lineHeight: 30, textAlign: 'center' }]} accessibilityRole="header">
          {holidayName(id)}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={s.muted}>{formatDateLong(date)}</Text>
          <Tag text={relativeDay(date, today)} tone={date === today ? 'solid' : 'neutral'} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, paddingTop: 2 }}>
          {countries.map((c) => (
            <View key={c.code} style={[s.chip, { minHeight: 32 }]}>
              <Text style={{ fontSize: 16 }}>{c.flag}</Text>
              <Text style={s.chipText}>{c.name}</Text>
            </View>
          ))}
        </View>
      </View>

      {(days.length > 1 || estimated) && (
        <Card>
          {days.length > 1 && <Text style={s.body}>{`В ${year} году — ${formatHolidayDays(days)}.`}</Text>}
          {estimated && (
            <Text style={[s.muted, days.length > 1 && { marginTop: 6 }]}>
              Дата примерная: праздник считают по лунному календарю, точный день объявляют ближе к делу.
            </Text>
          )}
        </Card>
      )}

      <Card>
        {info.text ? (
          <Text style={[s.body, { fontFamily: fonts.body }]}>{info.text}</Text>
        ) : (
          <Text style={s.muted}>Описания пока нет.</Text>
        )}
        {/* Статьи нет — поиск по Википедии: название и страна. */}
        <Button
          title={info.url ? 'Читать в Википедии' : 'Поискать в Википедии'}
          icon={info.url ? 'link' : 'search'}
          variant="soft"
          style={{ marginTop: 12 }}
          onPress={() => {
            const url = info.url ?? `https://ru.wikipedia.org/w/index.php?search=${encodeURIComponent(`${holidayName(id)} ${countries[0]?.name ?? ''}`.trim())}`;
            Linking.openURL(url).catch(() => {});
          }}
        />
      </Card>
      {info.text ? <Text style={[s.caption, { textAlign: 'center' }]}>Текст — из Википедии, лицензия CC BY-SA 4.0.</Text> : null}
    </ScrollView>
  );
}
