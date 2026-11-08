import Constants from 'expo-constants';

import { deviceAi } from '../../modules/device-ai';
import { detectGenders, type GenderDeps, type GenderPerson, type GenderRun } from './genderDetect';

/** Ключ Gemini попадает в сборку из секрета репозитория; без него третья ступень — только встроенный ИИ. */
const geminiKey = (Constants.expoConfig?.extra as { gemini?: { apiKey?: string } } | undefined)?.gemini?.apiKey || undefined;

const deps: GenderDeps = {
  fetch: (url, init) => fetch(url, init),
  deviceAi: deviceAi ?? undefined,
  geminiKey,
};

/** Есть ли чем определить пол через интернет, кроме своей базы. */
export const geminiConfigured = !!geminiKey;

export function runGenderDetection(people: GenderPerson[], online: boolean, onProgress?: Parameters<typeof detectGenders>[2]['onProgress']): Promise<GenderRun> {
  return detectGenders(people, deps, { online, onProgress });
}
