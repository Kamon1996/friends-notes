import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

import { deviceAi } from '../../modules/device-ai';
import { createGenderSync, type GenderBackoff } from './genderDetect';

/** Ключ Gemini попадает в сборку из секрета репозитория; без него третья ступень — только встроенный ИИ. */
const geminiKey = (Constants.expoConfig?.extra as { gemini?: { apiKey?: string } } | undefined)?.gemini?.apiKey || undefined;

const KEY = 'friends-notes/gender/v1';

/** Фоновое определение пола в приложении: интернет, встроенный ИИ, ключ Gemini и паузы сервисов в хранилище. */
export const genderSync = createGenderSync({
  deps: { fetch: (url, init) => fetch(url, init), deviceAi: deviceAi ?? undefined, geminiKey },
  load: async () => {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as GenderBackoff) : {};
  },
  save: (b) => AsyncStorage.setItem(KEY, JSON.stringify(b)),
  now: () => Date.now(),
});
