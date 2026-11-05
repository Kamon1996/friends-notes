import { phoneKey } from './messengers';
import type { Friend } from './types';

type EnrichmentMap = Map<string, { links: { telegramId?: number; whatsapp?: string; viber?: string }; photoUri: string | null; thumbUri?: string | null }>;

/** Дополняет друзей мессенджерами и фото по номеру телефона. Уже заполненное не перезаписывается. */
export function applyEnrichment(friends: Friend[], map: EnrichmentMap): { friends: Friend[]; changed: number } {
  let changed = 0;
  const out = friends.map((f) => {
    const key = phoneKey(f.phone);
    const found = key.length >= 7 ? map.get(key) : undefined;
    if (!found) return f;
    const next: Friend = {
      ...f,
      telegramId: f.telegramId ?? found.links.telegramId ?? null,
      whatsapp: f.whatsapp ?? found.links.whatsapp ?? null,
      viber: f.viber ?? found.links.viber ?? null,
      photoUri: f.photoUri ?? found.photoUri ?? null,
      // Миниатюру берём вместе с фото, чтобы они были одного человека.
      thumbUri: f.photoUri ? (f.thumbUri ?? null) : (found.thumbUri ?? found.photoUri ?? null),
    };
    const differs =
      next.telegramId !== (f.telegramId ?? null) ||
      next.whatsapp !== (f.whatsapp ?? null) ||
      next.viber !== (f.viber ?? null) ||
      next.photoUri !== (f.photoUri ?? null);
    if (!differs) return f;
    changed++;
    return next;
  });
  return { friends: out, changed };
}
