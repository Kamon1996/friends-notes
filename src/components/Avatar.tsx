import { useState } from 'react';
import { Image, Text, View } from 'react-native';

import { avatarTint, fonts, initials } from '@/lib/theme';
import { Icon } from './Icon';
import type { Friend } from '@/lib/types';

/** Фото из контактов, а без него — инициалы серифом на мягком оттенке, выбранном по имени. */
export function Avatar({
  friend,
  size,
  bg,
  fg,
}: {
  friend: Pick<Friend, 'name' | 'photoUri' | 'thumbUri'>;
  size: number;
  /** Переопределить цвета (например, белый кружок на карточке «Сегодня»). */
  bg?: string;
  fg?: string;
}) {
  const [failed, setFailed] = useState(false);
  const tint = avatarTint(friend.name);
  const box = {
    width: size,
    height: size,
    borderRadius: size / 2,
    backgroundColor: bg ?? tint.bg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    overflow: 'hidden' as const,
  };
  // В списках — маленькая версия (быстрее и легче), в карточке — большая.
  const uri = size <= 64 ? (friend.thumbUri ?? friend.photoUri) : (friend.photoUri ?? friend.thumbUri);
  if (uri && !failed) {
    return (
      <View style={box}>
        <Image source={{ uri }} style={{ width: size, height: size }} onError={() => setFailed(true)} />
      </View>
    );
  }
  const letters = initials(friend.name);
  if (letters === '·') {
    return (
      <View style={box}>
        <Icon name="person" size={Math.round(size * 0.46)} color={fg ?? tint.fg} />
      </View>
    );
  }
  return (
    <View style={box}>
      <Text style={{ fontFamily: fonts.display, fontSize: Math.round(size * 0.37), color: fg ?? tint.fg, lineHeight: Math.round(size * 0.5) }}>
        {letters}
      </Text>
    </View>
  );
}
