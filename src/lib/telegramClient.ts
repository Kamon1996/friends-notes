import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { Telegram } from '../../modules/telegram';

const config = (Constants.expoConfig?.extra?.telegram ?? {}) as { apiId?: number; apiHash?: string };

export const telegramAvailable = Platform.OS === 'android' && Telegram != null;
export const telegramConfigured = !!config.apiId && !!config.apiHash;

export { Telegram };

export function startTelegram() {
  if (!Telegram) throw new Error('Модуль Telegram недоступен');
  return Telegram.start(Number(config.apiId), String(config.apiHash), Constants.expoConfig?.version ?? '1.0');
}
