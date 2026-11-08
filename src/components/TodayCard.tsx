import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { plural } from '@/lib/dates';
import type { Friend } from '@/lib/types';
import { zodiacSign } from '@/lib/zodiac';
import { Avatar } from './Avatar';
import { contactActions, openExternal } from './ContactButtons';
import { Icon } from './Icon';
import { ZodiacGlyph } from './ZodiacGlyph';
import { useTheme } from './ui';

export interface TodayEvent {
  kind: 'birthday' | 'date';
  /** Название важной даты (для kind = 'date'). */
  title?: string;
  /** Возраст или число лет годовщины. */
  years: number | null;
}

const yearsText = (n: number) => `${n} ${plural(n, 'год', 'года', 'лет')}`;

/**
 * Карточка «Сегодня»: тёплая подложка, имя серифом и крупная цифра возраста —
 * единственное украшение на экране. Все сегодняшние события человека собраны в одной карточке.
 */
export function TodayCard({ friend, events, zodiac = true }: { friend: Friend; events: TodayEvent[]; zodiac?: boolean }) {
  const { colors, fonts } = useTheme();
  const actions = contactActions(friend);
  const call = actions.find((a) => a.key === 'call');
  const write = actions.find((a) => a.key !== 'call');

  // Крупная цифра — возраст именинника; если дня рождения нет, годы первой годовщины.
  const birthday = events.find((e) => e.kind === 'birthday');
  const big = birthday?.years ?? (birthday ? null : events[0]?.years ?? null);
  const lines = events.map((e) => {
    if (e.kind === 'birthday') return 'День рождения';
    const withYears = e.years && e !== events[0] ? ` · ${yearsText(e.years)}` : e.years && birthday ? ` · ${yearsText(e.years)}` : '';
    return `${e.title ?? 'Важная дата'}${withYears}`;
  });

  return (
    <Pressable
      onPress={() => router.push(`/friend/${friend.id}`)}
      style={({ pressed }) => ({ backgroundColor: colors.tint, borderRadius: 22, padding: 16, paddingBottom: 14, gap: 14, opacity: pressed ? 0.85 : 1 })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar friend={friend} size={48} bg={colors.card} fg={colors.accentText} />
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          {/* Имя — главное на карточке: на узком экране переносится на вторую строку, а не обрезается. */}
          <Text style={{ fontFamily: fonts.display, fontSize: 20, lineHeight: 24, color: colors.text }} numberOfLines={2}>
            {friend.name}
          </Text>
          {lines.map((line, i) => {
            const sign = zodiac && events[i].kind === 'birthday' ? zodiacSign(friend.birthday) : null;
            return (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Text style={{ fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.text2, flexShrink: 1 }} numberOfLines={1}>
                  {sign ? `${line} · ` : line}
                </Text>
                {sign && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} accessible accessibilityLabel={`Знак зодиака: ${sign.name}`}>
                    <ZodiacGlyph sign={sign.id} size={12} color={colors.text2} strokeWidth={2.2} />
                    <Text style={{ fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.text2 }}>{sign.name}</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
        {big ? (
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
            <Text style={{ fontFamily: fonts.display, fontSize: 40, lineHeight: 44, color: colors.accent, fontVariant: ['tabular-nums'] }}>{big}</Text>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: colors.accent }}>{plural(big, 'год', 'года', 'лет')}</Text>
          </View>
        ) : (
          <Icon name={birthday ? 'cake' : 'heart'} size={28} color={colors.accent} />
        )}
      </View>
      {(call || write) && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {call && (
            <Pressable
              onPress={() => openExternal(call.url, call.app)}
              style={({ pressed }) => ({ flex: 1, minHeight: 44, borderRadius: 14, backgroundColor: colors.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: pressed ? 0.7 : 1 })}
            >
              <Icon name="phone" size={18} color={colors.onAccent} strokeWidth={2} />
              <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.onAccent }}>Позвонить</Text>
            </Pressable>
          )}
          {write && (
            <Pressable
              onPress={() => openExternal(write.url, write.app)}
              style={({ pressed }) => ({ flex: 1, minHeight: 44, borderRadius: 14, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: pressed ? 0.7 : 1 })}
            >
              <Icon name={write.icon} size={18} color={colors.text} strokeWidth={2} />
              <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.text }}>Поздравить</Text>
            </Pressable>
          )}
        </View>
      )}
    </Pressable>
  );
}
