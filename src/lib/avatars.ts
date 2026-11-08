import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';

/**
 * Аватары, которые пользователь выбрал сам: ужимаем до двух размеров и кладём
 * в папку приложения, чтобы они не пропали вместе с временными файлами галереи.
 */
const DIR = 'avatars';
const BIG = 640;
const THUMB = 128;

const isWeb = Platform.OS === 'web';

export function avatarsDir(): Directory {
  const dir = new Directory(Paths.document, DIR);
  dir.create({ idempotent: true, intermediates: true });
  return dir;
}

/** Ужимает картинку до нужной ширины и сохраняет JPEG. На вебе — data-URI, чтобы пережить перезагрузку. */
async function shrink(uri: string, width: number): Promise<string> {
  const context = ImageManipulator.manipulate(uri);
  try {
    const image = await context.resize({ width }).renderAsync();
    try {
      const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.86, base64: isWeb });
      if (isWeb && result.base64) return `data:image/jpeg;base64,${result.base64}`;
      return result.uri;
    } finally {
      image.release();
    }
  } finally {
    context.release();
  }
}

export interface AvatarUris {
  photoUri: string;
  thumbUri: string;
}

/** Делает из выбранной картинки большую и маленькую версии и сохраняет их насовсем. */
export async function saveAvatar(friendId: string, sourceUri: string, sourceWidth?: number): Promise<AvatarUris> {
  const bigWidth = sourceWidth ? Math.min(BIG, sourceWidth) : BIG;
  const [big, thumb] = await Promise.all([shrink(sourceUri, bigWidth), shrink(sourceUri, Math.min(THUMB, bigWidth))]);
  if (isWeb) return { photoUri: big, thumbUri: thumb };

  const dir = avatarsDir();
  const stamp = Date.now();
  const photo = new File(dir, `${friendId}-${stamp}-big.jpg`);
  const small = new File(dir, `${friendId}-${stamp}.jpg`);
  await new File(big).move(photo);
  await new File(thumb).move(small);
  return { photoUri: photo.uri, thumbUri: small.uri };
}

/** Файл лежит внутри папки приложения (наш аватар или аватарка из Telegram) — его можно удалить. */
function isOwned(uri: string | null | undefined): uri is string {
  if (!uri || isWeb) return false;
  try {
    return uri.startsWith(Paths.document.uri);
  } catch {
    return false;
  }
}

/** Удаляет файлы аватара друга, кроме тех, что ещё используются. Чужие (из контактов) не трогает. */
export function cleanupAvatars(friendId: string, keep: (string | null | undefined)[] = []): void {
  if (isWeb) return;
  const used = new Set(keep.filter(Boolean));
  try {
    for (const item of avatarsDir().list()) {
      if (item instanceof File && item.name.startsWith(`${friendId}-`) && !used.has(item.uri)) item.delete();
    }
  } catch {
    // Нет папки или нет доступа — ничего страшного.
  }
}

/** Удаляет конкретные файлы, если они наши. Для аватарок из Telegram после замены или удаления друга. */
export function deleteOwnedFiles(uris: (string | null | undefined)[]): void {
  for (const uri of uris) {
    if (!isOwned(uri)) continue;
    try {
      const f = new File(uri);
      if (f.exists) f.delete();
    } catch {
      // уже удалён
    }
  }
}

/**
 * Удаляет из папки аватаров всё, на что не ссылается ни один друг (например, фото прежних данных после
 * восстановления из копии). Чужие файлы (из контактов) не в этой папке и не затрагиваются.
 */
export function pruneAvatars(keep: (string | null | undefined)[]): void {
  if (isWeb) return;
  const used = new Set(keep.filter(Boolean));
  try {
    for (const item of avatarsDir().list()) {
      if (item instanceof File && !used.has(item.uri)) item.delete();
    }
  } catch {
    // Нет папки или нет доступа — ничего страшного.
  }
}
