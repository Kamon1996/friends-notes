import { loadContacts } from './contacts';

export type DebugContact = { id: string; name: string; legacy?: unknown; next?: unknown };

export interface DebugReport {
  platform: string;
  permission: unknown;
  summary: Record<string, unknown>;
  fieldStats: Record<string, number>;
  errors: Record<string, string>;
  contacts: DebugContact[];
}

/** В браузере телефонной книги нет — показываем пример на демо-контактах. */
export async function collectContactsDebug(): Promise<DebugReport> {
  const res = await loadContacts();
  const contacts = res.status === 'granted' ? res.contacts : [];
  const fieldStats: Record<string, number> = {};
  for (const c of contacts) {
    for (const [k, v] of Object.entries(c)) {
      if (v != null && v !== '' && !(Array.isArray(v) && !v.length)) fieldStats[`sample.${k}`] = (fieldStats[`sample.${k}`] ?? 0) + 1;
    }
  }
  return {
    platform: 'web (пример)',
    permission: { granted: false, note: 'в браузере нет доступа к контактам' },
    summary: { count: contacts.length },
    fieldStats,
    errors: {},
    contacts: contacts.map((c) => ({ id: c.id, name: c.fullName ?? '', next: c })),
  };
}
