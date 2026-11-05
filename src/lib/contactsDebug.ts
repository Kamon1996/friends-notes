import { Contact, ContactField, Container, getPermissionsAsync } from 'expo-contacts';
import * as Legacy from 'expo-contacts/legacy';
import { Platform } from 'react-native';

export type DebugContact = { id: string; name: string; legacy?: unknown; next?: unknown };

export interface DebugReport {
  platform: string;
  permission: unknown;
  summary: Record<string, unknown>;
  /** Сколько контактов заполнили каждое поле: { 'legacy.birthday': 12, ... }. */
  fieldStats: Record<string, number>;
  errors: Record<string, string>;
  contacts: DebugContact[];
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

const isFilled = (v: unknown) =>
  v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0);

function countFields(prefix: string, list: Record<string, unknown>[], stats: Record<string, number>) {
  for (const item of list) {
    for (const [k, v] of Object.entries(item)) {
      if (isFilled(v)) stats[`${prefix}.${k}`] = (stats[`${prefix}.${k}`] ?? 0) + 1;
    }
  }
}

/** Поля нового API, которые поддерживает текущая платформа (без тяжёлых картинок). */
function nextFields(): ContactField[] {
  const skip = new Set<ContactField>([ContactField.IMAGE]);
  if (Platform.OS === 'android') {
    [ContactField.BIRTHDAY, ContactField.NON_GREGORIAN_BIRTHDAY, ContactField.MAIDEN_NAME, ContactField.NICKNAME, ContactField.IM_ADDRESSES, ContactField.SOCIAL_PROFILES].forEach((f) => skip.add(f));
  } else {
    skip.add(ContactField.NOTE); // на iOS нужно отдельное разрешение Apple
  }
  return Object.values(ContactField).filter((f) => !skip.has(f));
}

/** Собирает всё, что телефон отдаёт приложению о контактах. Только чтение. */
export async function collectContactsDebug(): Promise<DebugReport> {
  const report: DebugReport = {
    platform: `${Platform.OS} ${Platform.Version}`,
    permission: null,
    summary: {},
    fieldStats: {},
    errors: {},
    contacts: [],
  };
  const byId = new Map<string, DebugContact>();
  const entry = (id: string, name: string) => {
    let e = byId.get(id);
    if (!e) {
      e = { id, name };
      byId.set(id, e);
    }
    if (!e.name && name) e.name = name;
    return e;
  };

  try {
    report.permission = await getPermissionsAsync();
  } catch (e) {
    report.errors.permission = errText(e);
  }

  try {
    report.summary.count = await Contact.getCount();
  } catch (e) {
    report.errors.count = errText(e);
  }

  try {
    const containers = await Container.getAll();
    report.summary.containers = await Promise.all(
      containers.map(async (c) => ({ id: c.id, name: await c.getName().catch(() => null), type: await c.getType().catch(() => null) })),
    );
  } catch (e) {
    report.errors.containers = errText(e);
  }

  // Старый API — все поля, кроме картинок.
  try {
    const fields = Object.values(Legacy.Fields).filter(
      (f) => f !== Legacy.Fields.Image && f !== Legacy.Fields.RawImage && !(Platform.OS === 'ios' && f === Legacy.Fields.Note),
    );
    const { data } = await Legacy.getContactsAsync({ fields });
    report.summary.legacyTotal = data.length;
    countFields('legacy', data as unknown as Record<string, unknown>[], report.fieldStats);
    for (const c of data) entry(c.id ?? '?', c.name ?? '').legacy = c;
  } catch (e) {
    report.errors.legacy = errText(e);
  }

  // Новый API — все поддерживаемые поля.
  try {
    const details = await Contact.getAllDetails(nextFields());
    report.summary.nextTotal = details.length;
    countFields('next', details as unknown as Record<string, unknown>[], report.fieldStats);
    for (const d of details as unknown as ({ id: string; fullName?: string })[]) entry(d.id, d.fullName ?? '').next = d;
  } catch (e) {
    report.errors.next = errText(e);
  }

  // «Сырые» контакты: по одному на каждый аккаунт (Google, Telegram, WhatsApp…), без склейки.
  try {
    const raw = await Contact.getAllDetails([ContactField.FULL_NAME, ContactField.PHONES] as const, { rawContacts: true });
    report.summary.rawContactsTotal = raw.length;
  } catch (e) {
    report.errors.rawContacts = errText(e);
  }

  report.contacts = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  return report;
}
