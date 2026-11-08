import { requireOptionalNativeModule } from 'expo';

interface NativeOpenInApp {
  open(url: string, packages: string[]): Promise<boolean>;
}

/** Есть только в собранном Android-приложении (не в Expo Go, не на iOS и не в браузере). */
const native = requireOptionalNativeModule<NativeOpenInApp>('OpenInApp');

/**
 * Открыть веб-ссылку в приложении: в одном из пакетов, иначе в любом не-браузерном.
 * false — приложения нет или модуль недоступен; тогда ссылку открывают обычным способом.
 */
export async function openInApp(url: string, packages: string[]): Promise<boolean> {
  if (!native) return false;
  try {
    return await native.open(url, packages);
  } catch {
    return false;
  }
}
