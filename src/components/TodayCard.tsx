import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { plural } from '@/lib/dates';
import type { Friend } from '@/lib/types';
import { Avatar } from './Avatar';
import { contactActions, openExternal } from './ContactButtons';
import { Icon } from './Icon';
import { useTheme } from './ui';

/**
 * Карточка «Сегодня»: тёплая подложка, имя серифом и крупная цифра возраста —
 * единственное украшение на экране. Кнопки: позвонить и поздравить в мессенджере.
 */
export function TodayCard({
  friend,
  kind,
  title,
  years,
}: {
  friend: Friend;
  kind: 'birthday' | 'date';
  /** Название важной даты (для kind = 'date'). */
  title?: string;
  /** Возраст или число лет годовщины. */
  years: number | null;
}) {
  const { colors, fonts } = useTheme();
  const actions = contactActions(friend);
  const call = actions.find((a) => a.key === 'call');
  const write = actions.find((a) => a.key !== 'call');
  const subtitle = kind === 'birthday' ? 'День рождения' : title ?? 'Важная дата';

  return (
    <Pressable
      onPress={() => router.push(`/friend/${friend.id}`)}
      style={({ pressed }) => ({ backgroundColor: colors.tint, borderRadius: 22, padding: 16, paddingBottom: 14, gap: 14, opacity: pressed ? 0.85 : 1 })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar friend={friend} size={48} bg={colors.card} fg={colors.accentText} />
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 20, lineHeight: 24, color: colors.text }} numberOfLines={1}>
            {friend.name}
          </Text>
          <Text style={{ fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.text2 }} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        {years ? (
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
            <Text style={{ fontFamily: fonts.display, fontSize: 40, lineHeight: 44, color: colors.accent, fontVariant: ['tabular-nums'] }}>{years}</Text>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: colors.accent }}>{plural(years, 'год', 'года', 'лет')}</Text>
          </View>
        ) : (
          <Icon name={kind === 'birthday' ? 'cake' : 'heart'} size={28} color={colors.accent} />
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
