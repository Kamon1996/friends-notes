import { getPermissionsAsync } from 'expo-contacts';
import { Platform } from 'react-native';

import { loadContacts, type ContactsResult } from './contacts';
import type { RawContact } from './contactsImport';

export interface ContactsSnapshot {
  contacts: RawContact[];
  limited: boolean;
  sample: boolean;
  /** Когда прочитано (мс). */
  at: number;
}

let snapshot: ContactsSnapshot | null = null;
let inflight: Promise<ContactsResult> | null = null;
const listeners = new Set<(s: ContactsSnapshot) => void>();

/** Последняя прочитанная телефонная книга — экран импорта показывает её сразу, не дожидаясь чтения. */
export const getContactsSnapshot = () => snapshot;

export function subscribeContacts(fn: (s: ContactsSnapshot) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Перечитать книгу. Параллельные вызовы делят одно чтение. */
export function refreshContacts(): Promise<ContactsResult> {
  if (inflight) return inflight;
  inflight = loadContacts()
    .then((res) => {
      if (res.status === 'granted') {
        snapshot = { contacts: res.contacts, limited: res.limited, sample: res.sample, at: Date.now() };
        listeners.forEach((l) => l(snapshot!));
      }
      return res;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/**
 * Прогрев при запуске: если доступ к контактам уже дан, читаем книгу в фоне после первой отрисовки,
 * чтобы экран импорта открывался с готовым списком. Разрешение здесь не запрашиваем.
 */
export function warmContacts(): void {
  if (Platform.OS === 'web') return;
  getPermissionsAsync()
    .then((p) => {
      if (!p.granted) return;
      // Чуть позже первой отрисовки, чтобы не мешать старту.
      setTimeout(() => refreshContacts().catch(() => {}), 1500);
    })
    .catch(() => {});
}
