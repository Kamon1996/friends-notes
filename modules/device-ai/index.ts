import { requireOptionalNativeModule } from 'expo';

import type { DeviceAiStatus } from '@/lib/genderDetect';

interface NativeDeviceAi {
  status(): Promise<DeviceAiStatus>;
  generate(prompt: string): Promise<string>;
}

/** Есть только в собранном Android-приложении; на iOS, в браузере и в Expo Go — нет. */
const native = requireOptionalNativeModule<NativeDeviceAi>('DeviceAi');

/** Встроенный ИИ телефона (Gemini Nano). null — модуля нет вовсе. */
export const deviceAi = native
  ? {
      status: () => native.status().catch((): DeviceAiStatus => 'unavailable'),
      generate: (prompt: string) => native.generate(prompt),
    }
  : null;
