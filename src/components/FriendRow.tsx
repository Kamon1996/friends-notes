import type { ComponentProps } from 'react';
import { Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { ZodiacMark } from '@/components/ZodiacGlyph';
import { ListRow, Tag, useTheme } from '@/components/ui';
import { ageOn, daysBetween, formatDate, hasYear, nextAnniversary, plural, relativeDay } from '@/lib/dates';
import type { Friend } from '@/lib/types';

/** Вторая строка друга в списке: дата рождения и возраст, иначе цветы и еда. */
export function friendSubtitle(friend: Friend, today: string): string {
  const next = friend.birthday ? nextAnniversary(friend.birthday, today) : null;
  const age = friend.birthday && next && hasYear(friend.birthday) ? ageOn(friend.birthday, next) : null;
  return friend.birthday
    ? `${formatDate(friend.birthday, false)}${age ? ` · ${age} ${plural(age, 'год', 'года', 'лет')}` : ''}`
    : [friend.flowers, friend.food].filter(Boolean).join(' · ') || 'Без дня рождения';
}

/** Отступ разделителя между строками друзей в группе — под аватаркой не тянется. */
export const FRIEND_ROW_INSET = 70;

/** Подзаголовок группы в списке «Друзья»: «Избранные» со звёздочкой или буква. */
export function FriendGroupLabel({ title, star }: { title: string; star?: boolean }) {
  const { s, colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 24, paddingTop: 10, paddingBottom: 6 }}>
      {star && <Icon name="star" size={13} color={colors.accent} fill={colors.accent} />}
      <Text style={[s.name, { fontSize: 13, color: star ? colors.accentText : s.caption.color }]}>{title}</Text>
    </View>
  );
}

/** Строка друга в списке «Друзья». */
export function FriendRow({
  friend,
  today,
  selected,
  selecting,
  zodiac,
  onPress,
  onLongPress,
  trailingStyle,
}: {
  friend: Friend;
  today: string;
  /** Показывать маленький знак зодиака после даты. */
  zodiac: boolean;
  selected: boolean;
  selecting: boolean;
  onPress: () => void;
  onLongPress: () => void;
  /** Стиль правой части (метки и стрелка) — «Пол друзей» прячет её, когда на её месте проявляется пол. */
  trailingStyle?: ComponentProps<typeof Animated.View>['style'];
}) {
  const { s, colors } = useTheme();
  const next = friend.birthday ? nextAnniversary(friend.birthday, today) : null;
  const diff = next ? daysBetween(today, next) : null;
  const sub = friendSubtitle(friend, today);

  return (
    <ListRow
      onPress={onPress}
      onLongPress={onLongPress}
      leading={
        <View>
          <Avatar friend={friend} size={44} />
          {selected && (
            <View
              style={{
                position: 'absolute',
                right: -3,
                bottom: -3,
                width: 20,
                height: 20,
                borderRadius: 10,
                backgroundColor: colors.success,
                borderWidth: 2,
                borderColor: colors.card,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="check" size={11} color="#FFFFFF" strokeWidth={3} />
            </View>
          )}
        </View>
      }
      title={<Text style={s.name} numberOfLines={1}>{friend.name}</Text>}
      subtitle={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Text style={[s.muted, { fontVariant: ['tabular-nums'], flexShrink: 1 }]} numberOfLines={1}>
            {sub}
          </Text>
          {zodiac && friend.birthday ? <ZodiacMark birthday={friend.birthday} color={colors.text3} /> : null}
        </View>
      }
      trailing={
        // Стрелка — соседом меток, как у ListRow, но со своим стилем: так её можно спрятать вместе с метками.
        <>
          <Animated.View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8 }, trailingStyle]}>
            {friend.muted && <Icon name="bellOff" size={16} color={colors.text3} />}
            {diff === 0 ? <Tag text="сегодня" tone="solid" /> : diff !== null && diff <= 7 ? <Tag text={relativeDay(next!, today)} tone="accent" /> : null}
          </Animated.View>
          {!selecting && (diff === null || diff > 7) && (
            <Animated.View style={trailingStyle}>
              <Icon name="chevronRight" size={18} color={colors.checkbox} strokeWidth={2} />
            </Animated.View>
          )}
        </>
      }
      style={{ paddingVertical: 10, backgroundColor: selected ? colors.soft : undefined }}
    />
  );
}
