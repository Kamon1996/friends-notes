import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { Telegram } from '../../modules/telegram';
import { floodWaitSeconds, type TgPerson } from './telegramImport';

const config = (Constants.expoConfig?.extra?.telegram ?? {}) as { apiId?: number; apiHash?: string };

export const telegramAvailable = Platform.OS === 'android' && Telegram != null;
export const telegramConfigured = !!config.apiId && !!config.apiHash;

export { Telegram };

export function startTelegram() {
  if (!Telegram) throw new Error('Модуль Telegram недоступен');
  return Telegram.start(Number(config.apiId), String(config.apiHash), Constants.expoConfig?.version ?? '1.0');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Загружает контакты Telegram с днями рождения. Профили запрашиваются по одному с паузой,
 * на «подожди N секунд» от Telegram — ждём (если недолго) или прекращаем запрашивать дни рождения.
 */
export async function fetchTelegramPeople(
  onProgress: (done: number, total: number) => void,
  isCancelled: () => boolean,
): Promise<{ people: TgPerson[]; partial: boolean }> {
  if (!Telegram) throw new Error('Модуль Telegram недоступен');
  const ids = await Telegram.getContactIds();
  const people: TgPerson[] = [];
  let partial = false;

  for (let i = 0; i < ids.length; i++) {
    if (isCancelled()) break;
    const user = await Telegram.getUser(ids[i]);
    let full: { birthdate: TgPerson['birthdate']; bio: string | null } = { birthdate: null, bio: null };
    if (!partial) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          full = await Telegram.getUserFullInfo(ids[i]);
          break;
        } catch (e) {
          const wait = floodWaitSeconds(e instanceof Error ? e.message : String(e));
          if (wait !== null && wait <= 60 && attempt === 0) {
            await sleep((wait + 1) * 1000);
            continue;
          }
          if (wait !== null) partial = true; // Telegram просит ждать слишком долго — дни рождения остальных пропускаем
          break;
        }
      }
      await sleep(120);
    }
    people.push({ ...user, birthdate: full.birthdate, bio: full.bio });
    onProgress(i + 1, ids.length);
  }
  return { people, partial };
}
