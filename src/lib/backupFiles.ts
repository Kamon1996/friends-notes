import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { avatarsDir, pruneAvatars } from './avatars';
import { MAX_BACKUP_CHARS, backupFileName, buildBackup, parseBackup, restoredPhotoName, type BackupContents, type ParsedBackup } from './backup';
import { collectPhotos } from './backupPhotos';
import { APP_VERSION } from './changelog';
import type { AppData } from './types';

/** Сохранить копию: собрать фото, записать файл и открыть «Поделиться» — в Google Диск, Telegram, файлы. */
export async function saveBackup(data: AppData, onProgress?: (done: number, total: number) => void): Promise<void> {
  const photos = await collectPhotos(data.friends, onProgress);
  const now = new Date();
  // Старые копии из кэша убираем: в них личные данные, а нужны они только на время «Поделиться».
  try {
    for (const item of Paths.cache.list()) if (item instanceof File && item.name.startsWith('druzya-kopiya-')) item.delete();
  } catch {
    // не страшно
  }
  const file = new File(Paths.cache, backupFileName(now));
  file.create();
  file.write(buildBackup(data, photos, now, APP_VERSION));
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Сохранить копию «Друзей»' });
}

/** Выбрать файл копии и разобрать его. Отказались выбирать — null. */
export async function pickBackup(): Promise<ParsedBackup | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  if (res.canceled || !res.assets?.length) return null;
  const asset = res.assets[0];
  if (asset.size && asset.size > MAX_BACKUP_CHARS) return { ok: false, error: 'Файл слишком большой — это не копия «Друзей».' };
  const file = new File(asset.uri);
  try {
    return parseBackup(await file.text());
  } finally {
    try {
      file.delete();
    } catch {
      // копия в кэше — не страшно
    }
  }
}

/** Записать фото из копии в папку аватаров и вернуть данные с путями к ним. */
export async function writeRestoredPhotos(backup: BackupContents): Promise<AppData> {
  const dir = avatarsDir();
  const stamp = Date.now();
  const friends = backup.data.friends.map((f) => {
    const b64 = backup.photos[f.id];
    if (!b64) return f;
    try {
      const file = new File(dir, restoredPhotoName(f.id, stamp, b64));
      file.create({ overwrite: true });
      file.write(b64, { encoding: 'base64' });
      return { ...f, photoUri: file.uri, thumbUri: file.uri };
    } catch {
      return f;
    }
  });
  return { ...backup.data, friends };
}

/** После восстановления удалить фото прежних данных. */
export function cleanupAfterRestore(data: AppData): void {
  pruneAvatars(data.friends.flatMap((f) => [f.photoUri, f.thumbUri]));
}
