import { telegramUrl, viberUrl, whatsappUrl } from './messengers';
import type { Friend } from './types';

/** Куда написать человеку — для кнопок «Поздравить» и «Написать» в подробностях дня календаря. */
export interface MessageChannel {
  key: string;
  /** Как называется приложение — для подписи и сообщения, если не открылось. */
  app: string;
  url: string;
  icon: 'send' | 'bubble' | 'bubble2';
}

/** Соцсети, где можно написать человеку, — по порядку. */
const SOCIAL_CHAT: [network: string, app: string][] = [
  ['vk', 'VK'],
  ['instagram', 'Instagram'],
  ['max', 'MAX'],
  ['facebook', 'Facebook'],
  ['ok', 'Одноклассники'],
];

/**
 * Лучший способ написать: Telegram (по id из импорта или по нику), WhatsApp, Viber, потом соцсети с личными
 * сообщениями. Нет ни одного — null, и кнопки не будет.
 */
export function messageChannel(friend: Pick<Friend, 'telegramId' | 'whatsapp' | 'viber' | 'socials'>, os = 'android'): MessageChannel | null {
  if (friend.telegramId) return { key: 'tg', app: 'Telegram', url: telegramUrl(friend.telegramId, os), icon: 'send' };
  const tg = friend.socials?.find((s) => s.network === 'telegram' && (s.url || s.handle));
  if (tg) return { key: 'tg', app: 'Telegram', url: tg.url || `https://t.me/${tg.handle}`, icon: 'send' };
  if (friend.whatsapp) return { key: 'wa', app: 'WhatsApp', url: whatsappUrl(friend.whatsapp), icon: 'bubble' };
  if (friend.viber) return { key: 'vb', app: 'Viber', url: viberUrl(friend.viber), icon: 'bubble2' };
  for (const [network, app] of SOCIAL_CHAT) {
    const s = friend.socials?.find((x) => x.network === network && x.url);
    if (s) return { key: network, app, url: s.url, icon: 'bubble' };
  }
  return null;
}
