import { useState } from 'react';
import { Image, Text, View } from 'react-native';

import type { Friend } from '@/lib/types';
import { colors } from './ui';

/** Фото из контактов, а если его нет или оно не открылось — эмодзи. */
export function Avatar({ friend, size }: { friend: Pick<Friend, 'emoji' | 'photoUri' | 'thumbUri'>; size: number }) {
  const [failed, setFailed] = useState(false);
  const box = {
    width: size,
    height: size,
    borderRadius: size / 2,
    backgroundColor: colors.primarySoft,
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
  return (
    <View style={box}>
      <Text style={{ fontSize: size * 0.54 }}>{friend.emoji}</Text>
    </View>
  );
}
