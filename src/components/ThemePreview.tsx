import { Pressable, Text, View } from 'react-native';

import { formatDateLong, formatDayShort, parseISODate, relativeDay, toISODate, todayISO } from '@/lib/dates';
import { type AccentId, type Scheme } from '@/lib/theme';
import { ThemeScope } from '@/lib/themeContext';
import type { Friend } from '@/lib/types';
import { Avatar } from './Avatar';
import { Icon, type IconName } from './Icon';
import { TodayCard } from './TodayCard';
import { ListRow, Tag, useTheme } from './ui';

const SCHEMES: { key: Scheme; label: string; a11y: string }[] = [
  { key: 'light', label: 'Светлая', a11y: 'Предпросмотр светлой темы' },
  { key: 'dark', label: 'Тёмная', a11y: 'Предпросмотр тёмной темы' },
];
const TABS: { icon: IconName; label: string }[] = [
  { icon: 'calendar', label: 'Скоро' },
  { icon: 'people', label: 'Друзья' },
  { icon: 'bell', label: 'Напоминания' },
];

function sample(name: string, birthday: string, phone = ''): Friend {
  return { id: `preview-${name}`, name, emoji: '', birthday, phone, food: '', flowers: '', gifts: '', notes: '', dates: [], createdAt: 0, whatsapp: phone ? phone.replace(/\D/g, '') : null };
}

/** Именинница сегодня и день рождения через две недели — чтобы на предпросмотре были карточка «Сегодня», строка и чип. */
function samples(today: string) {
  const d = parseISODate(today);
  const birthdayToday = toISODate(new Date(d.getFullYear() - 28, d.getMonth(), d.getDate()));
  const soon = toISODate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 15));
  return { nastya: sample('Настя', birthdayToday, '+7 900 000-00-00'), andrey: sample('Андрей', toISODate(new Date(d.getFullYear() - 30, d.getMonth(), d.getDate() + 15))), soon };
}

/**
 * Живой фрагмент экрана «Скоро» в выбранной теме и цвете: те же компоненты, что в приложении,
 * только без нажатий. Переключатель в углу показывает другую тему.
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
  const { nastya, andrey, soon } = samples(today);
  return (
    <View style={{ borderRadius: 22, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.bg, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, paddingTop: 16 }}>
        <View style={{ gap: 2, flex: 1 }}>
          <Text style={[s.h1, { fontSize: 26, lineHeight: 30 }]}>Скоро</Text>
          <Text style={[s.muted, { fontSize: 13 }]}>{formatDateLong(today)}</Text>
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
      <View pointerEvents="none" importantForAccessibility="no-hide-descendants" style={{ padding: 12, gap: 10 }}>
        <TodayCard friend={nastya} events={[{ kind: 'birthday', years: 28 }]} />
        <View style={s.group}>
          <ListRow
            leading={<Avatar friend={andrey} size={40} />}
            title={<Text style={[s.name, { fontSize: 16 }]}>Андрей</Text>}
            subtitle="День рождения"
            trailing={
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={[s.title, { fontSize: 13, fontVariant: ['tabular-nums'] }]}>{formatDayShort(soon)}</Text>
                <Tag text={relativeDay(soon, today)} tone="accent" />
              </View>
            }
          />
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
