import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';

import { BACKUP_PHOTO_WIDTH } from './backup';
import type { Friend } from './types';

/**
 * Фото друзей для копии: каждое ужимаем до 360 точек JPEG. Так читаются любые источники — наш файл,
 * фото из контактов (content://) и data-URI в браузере, — а копия получается лёгкой.
 */
async function photoBase64(uri: string): Promise<string | null> {
  const context = ImageManipulator.manipulate(uri);
  try {
    const image = await context.resize({ width: BACKUP_PHOTO_WIDTH }).renderAsync();
    try {
      const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.82, base64: true });
      // Временный файл в кэше больше не нужен.
      if (Platform.OS !== 'web') {
        try {
          new File(result.uri).delete();
        } catch {
          // не страшно
        }
      }
      return result.base64?.replace(/^data:[^,]*,/, '') ?? null;
    } finally {
      image.release();
    }
  } finally {
    context.release();
  }
}

/** Фото всех друзей с фото: id друга → base64. Нечитаемое фото (удалили контакт) просто пропускаем. */
export async function collectPhotos(friends: Friend[], onProgress?: (done: number, total: number) => void): Promise<Record<string, string>> {
  const withPhoto = friends.filter((f) => f.photoUri || f.thumbUri);
  const out: Record<string, string> = {};
  let done = 0;
  for (const f of withPhoto) {
    const b64 = await photoBase64((f.photoUri || f.thumbUri)!).catch(() => null);
    if (b64) out[f.id] = b64;
    onProgress?.(++done, withPhoto.length);
  }
  return out;
}
