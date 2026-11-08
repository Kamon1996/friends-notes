import { networkForHost, splitHost } from './socials';

/**
 * Официальные приложения соцсетей на Android: ссылку на профиль сначала отдаём им напрямую,
 * чтобы она открылась в приложении, даже если Android не связал с ним домен. Список пакетов
 * повторяется в modules/open-in-app/android/src/main/AndroidManifest.xml (<queries>) — их совпадение проверяет тест.
 */
export const ANDROID_APPS: Record<string, string[]> = {
  telegram: ['org.telegram.messenger', 'org.telegram.messenger.web', 'org.thunderdog.challegram'],
  instagram: ['com.instagram.android'],
  tiktok: ['com.zhiliaoapp.musically', 'com.ss.android.ugc.trill'],
  youtube: ['com.google.android.youtube'],
  vk: ['com.vkontakte.android'],
  ok: ['ru.ok.android'],
  facebook: ['com.facebook.katana'],
  x: ['com.twitter.android'],
  threads: ['com.instagram.barcelona'],
  snapchat: ['com.snapchat.android'],
  pinterest: ['com.pinterest'],
  reddit: ['com.reddit.frontpage'],
  linkedin: ['com.linkedin.android'],
  max: ['ru.oneme.app'],
  dzen: ['ru.zen.android'],
  discord: ['com.discord'],
  twitch: ['tv.twitch.android.app'],
  rutube: ['ru.rutube.app'],
  vimeo: ['com.vimeo.android.videoapp'],
  soundcloud: ['com.soundcloud.android'],
  spotify: ['com.spotify.music'],
  yandexmusic: ['ru.yandex.music'],
  behance: ['com.behance.behance'],
  github: ['com.github.android'],
  medium: ['com.medium.reader'],
  bluesky: ['xyz.blueskyweb.app'],
  strava: ['com.strava'],
  duolingo: ['com.duolingo'],
  steam: ['com.valvesoftware.android.steam.community'],
  pikabu: ['ru.pikabu.android'],
  kinopoisk: ['ru.kinopoisk'],
};

/** Ссылки не из каталога соцсетей, у которых тоже есть своё приложение. */
const EXTRA_HOSTS: Record<string, string[]> = {
  'wa.me': ['com.whatsapp', 'com.whatsapp.w4b'],
  'api.whatsapp.com': ['com.whatsapp', 'com.whatsapp.w4b'],
};

/**
 * Куда сначала отдать веб-ссылку: список пакетов приложений (может быть пустым — тогда любое приложение, кроме браузера)
 * или null, если ссылку нужно сразу открыть как обычно (личный сайт, не веб-адрес).
 */
export function appTarget(url: string): string[] | null {
  const host = splitHost(url);
  if (!host) return null;
  const bare = host.replace(/^www\./, '');
  if (EXTRA_HOSTS[bare]) return EXTRA_HOSTS[bare];
  const network = networkForHost(host);
  if (!network) return null;
  return ANDROID_APPS[network.id] ?? [];
}
