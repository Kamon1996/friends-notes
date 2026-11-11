import { Pressable, Text, View } from 'react-native';

import { parseISODate, toISODate, todayISO } from '@/lib/dates';
import { type AccentId, type Scheme } from '@/lib/theme';
import { ThemeScope } from '@/lib/themeContext';
import type { Friend, Reminder } from '@/lib/types';
import { Icon, type IconName } from './Icon';
import { ReminderRow } from './ReminderRow';
import { Chip, useTheme } from './ui';

const SCHEMES: { key: Scheme; label: string; a11y: string }[] = [
  { key: 'light', label: 'Светлая', a11y: 'Предпросмотр светлой темы' },
  { key: 'dark', label: 'Тёмная', a11y: 'Предпросмотр тёмной темы' },
];
// Вкладки — как в приложении.
const TABS: { icon: IconName; label: string }[] = [
  { icon: 'bell', label: 'Напоминания' },
  { icon: 'people', label: 'Друзья' },
  { icon: 'calendar', label: 'Календарь' },
];

/**
 * Два дела для предпросмотра: позвонить Насте сегодня и важный подарок Андрею через две недели. Звонок — «до конца дня»,
 * без точного часа: иначе вечером предпросмотр показывал бы его просроченным.
 */
function samples(today: string) {
  const d = parseISODate(today);
  const nastya: Friend = { id: 'preview-nastya', name: 'Настя', emoji: '', birthday: null, phone: '', food: '', flowers: '', gifts: '', notes: '', dates: [], createdAt: 0 };
  const base = { note: '', repeat: null, advance: 0 as const, done: false, createdAt: d.getTime() - 7 * 86_400_000 };
  const call: Reminder = { ...base, id: 'preview-call', title: 'Позвонить Насте', friendId: nastya.id, date: today, time: '19:00', minutes: 20 };
  const gift: Reminder = {
    ...base,
    id: 'preview-gift',
    title: 'Подарок Андрею',
    friendId: null,
    date: toISODate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 15)),
    time: '12:00',
    minutes: 60,
    priority: 3,
  };
  return { nastya, call, gift };
}

/**
 * Живой фрагмент вкладки «Напоминания» в выбранной теме и цвете: те же компоненты, что в приложении, только без
 * нажатий. Переключатель в углу показывает другую тему.
 */
export function ThemePreview({ scheme, accentId, onSchemeChange }: { scheme: Scheme; accentId: AccentId; onSchemeChange: (s: Scheme) => void }) {
  return (
    <ThemeScope scheme={scheme} accentId={accentId}>
      <Body scheme={scheme} onSchemeChange={onSchemeChange} />
    </ThemeScope>
  );
}

function Body({ scheme, onSchemeChange }: { scheme: Scheme; onSchemeChange: (s: Scheme) => void }) {
  const { s, colors, fonts } = useTheme();
  const today = todayISO();
  const { nastya, call, gift } = samples(today);
  return (
    <View style={{ borderRadius: 22, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.bg, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, paddingTop: 16 }}>
        <View style={{ gap: 2, flex: 1 }}>
          {/* Рядом — переключатель темы: на узком экране длинное слово переносилось по буквам («Напоминан-ия»). */}
          <Text style={[s.h1, { fontSize: 22, lineHeight: 28 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
            Напоминания
          </Text>
          <Text style={[s.muted, { fontSize: 13 }]}>2 дела · 1 на сегодня</Text>
        </View>
        <View style={{ flexDirection: 'row', borderRadius: 999, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.card, overflow: 'hidden' }}>
          {SCHEMES.map((x) => {
            const on = x.key === scheme;
            return (
              <Pressable
                key={x.key}
                onPress={() => onSchemeChange(x.key)}
                accessibilityRole="button"
                accessibilityLabel={x.a11y}
                aria-selected={on}
                hitSlop={{ top: 8, bottom: 8 }}
                style={({ pressed }) => ({ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: on ? colors.text : 'transparent', opacity: pressed ? 0.7 : 1 })}
              >
                <Text style={{ fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, color: on ? colors.bg : colors.text2 }}>{x.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <View pointerEvents="none" importantForAccessibility="no-hide-descendants" style={{ paddingHorizontal: 12, paddingTop: 12, paddingBottom: 14, gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip label="Все" selected onPress={() => {}} />
          <Chip label="Важные" icon="chevronsUp" onPress={() => {}} />
        </View>
        <View style={s.group}>
          <ReminderRow detailed reminder={call} friend={nastya} onPress={() => {}} />
          <View style={{ height: 1, backgroundColor: colors.separator, marginLeft: 70 }} />
          <ReminderRow detailed reminder={gift} onPress={() => {}} />
        </View>
        {/* Кнопка «+» — цветом оформления, как в приложении. */}
        <View style={{ alignSelf: 'flex-end', width: 48, height: 48, borderRadius: 24, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="plus" size={24} color={colors.onAccent} strokeWidth={2.2} />
        </View>
      </View>
      <View pointerEvents="none" importantForAccessibility="no-hide-descendants" style={{ flexDirection: 'row', backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.hairline, paddingTop: 8, paddingBottom: 10 }}>
        {TABS.map((t, i) => (
          <View key={t.icon} style={{ flex: 1, alignItems: 'center', gap: 3 }}>
            <Icon name={t.icon} size={24} color={i === 0 ? colors.accent : colors.text3} strokeWidth={i === 0 ? 2 : 1.75} />
            <Text style={{ fontFamily: fonts.medium, fontSize: 11, lineHeight: 13, color: i === 0 ? colors.accent : colors.text3 }}>{t.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
