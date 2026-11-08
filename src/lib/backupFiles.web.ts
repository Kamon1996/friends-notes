import * as DocumentPicker from 'expo-document-picker';

import { MAX_BACKUP_CHARS, backupFileName, buildBackup, imageMime, parseBackup, type BackupContents, type ParsedBackup } from './backup';
import { collectPhotos } from './backupPhotos';
import { APP_VERSION } from './changelog';
import type { AppData } from './types';

/** В браузере копия просто скачивается. */
export async function saveBackup(data: AppData, onProgress?: (done: number, total: number) => void): Promise<void> {
  const photos = await collectPhotos(data.friends, onProgress);
  const now = new Date();
  const url = URL.createObjectURL(new Blob([buildBackup(data, photos, now, APP_VERSION)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = backupFileName(now);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function pickBackup(): Promise<ParsedBackup | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: false });
  if (res.canceled || !res.assets?.length) return null;
  const asset = res.assets[0];
  if (asset.size && asset.size > MAX_BACKUP_CHARS) return { ok: false, error: 'Файл слишком большой — это не копия «Друзей».' };
  const text = asset.file ? await asset.file.text() : await (await fetch(asset.uri)).text();
  return parseBackup(text);
}

/** В браузере фото живут прямо в данных — как data-URI. */
export async function writeRestoredPhotos(backup: BackupContents): Promise<AppData> {
  const friends = backup.data.friends.map((f) => {
    const b64 = backup.photos[f.id];
    if (!b64) return f;
    const uri = `data:${imageMime(b64) ?? 'image/jpeg'};base64,${b64}`;
    return { ...f, photoUri: uri, thumbUri: uri };
  });
  return { ...backup.data, friends };
}

export function cleanupAfterRestore(_data: AppData): void {}
