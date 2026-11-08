import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

import { createAi } from './router';
import { PROVIDER_IDS, type AiFetch, type ProviderId } from './types';

export type { AiRequest, AiResult, AiRunner, AiTask, ProviderId } from './types';
export { TASK_PROVIDERS } from './tasks';

/**
 * Ключи попадают в сборку из секретов репозитория (GEMINI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY, HF_TOKEN —
 * см. .github/workflows/android-apk.yml). Нет ключа — сервис просто пропускается.
 */
function keysFromConfig(): Partial<Record<ProviderId, string>> {
  const extra = Constants.expoConfig?.extra as { ai?: Record<string, unknown> } | undefined;
  const keys: Partial<Record<ProviderId, string>> = {};
  for (const id of PROVIDER_IDS) {
    const v = extra?.ai?.[id];
    if (typeof v === 'string' && v.trim()) keys[id] = v.trim();
  }
  return keys;
}

const STORAGE_KEY = 'friends-notes/ai/v1';

const appFetch: AiFetch = async (url, init) => {
  const res = await fetch(url, init);
  return { status: res.status, headers: res.headers, text: () => res.text() };
};

/** ИИ приложения: один на всё приложение, паузы сервисов общие для всех задач. */
export const ai = createAi({
  keys: keysFromConfig(),
  fetch: appFetch,
  now: () => Date.now(),
  load: async () => {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  },
  save: (state) => AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)),
});

/** Есть ли хоть один ключ — иначе облачного ИИ в этой сборке нет. */
export const hasAiKeys = Object.keys(keysFromConfig()).length > 0;
