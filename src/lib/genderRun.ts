import AsyncStorage from '@react-native-async-storage/async-storage';

import { deviceAi } from '../../modules/device-ai';
import { ai } from './ai';
import { createGenderSync, type GenderBackoff } from './genderDetect';

const KEY = 'friends-notes/gender/v1';

/** Фоновое определение пола в приложении: Genderize, встроенный ИИ, облачный ИИ и пауза Genderize в хранилище. */
export const genderSync = createGenderSync({
  deps: { fetch: (url, init) => fetch(url, init), deviceAi: deviceAi ?? undefined, ai },
  load: async () => {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as GenderBackoff) : {};
  },
  save: (b) => AsyncStorage.setItem(KEY, JSON.stringify(b)),
  now: () => Date.now(),
});
