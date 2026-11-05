import { UNKNOWN_YEAR } from './dates';
import type { Friend, ISODate } from './types';

/** Контакт из телефонной книги — только то, что нам нужно. */
export interface RawContact {
  id: string;
  fullName?: string | null;
  givenName?: string | null;
  familyName?: string | null;
  phones?: { number?: string | null }[] | null;
  birthday?: { year?: number | null; month: number; day: number } | null;
  dates?: { label?: string | null; date?: { year?: number | null; month: number; day: number } | null }[] | null;
  note?: string | null;
}

export interface ImportCandidate {
  key: string;
  name: string;
  phone: string;
  birthday: ISODate | null;
  dates: { title: string; date: ISODate }[];
  note: string;
  /** Имя друга, который уже есть в приложении (по имени или телефону). */
  duplicateOf: string | null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Дата из контактов (месяц 1–12, год может отсутствовать) → ISO. */
export function contactDateToISO(d: { year?: number | null; month: number; day: number } | null | undefined): ISODate | null {
  if (!d || !d.month || !d.day) return null;
  const year = d.year && d.year > 1800 ? d.year : UNKNOWN_YEAR;
  if (d.month < 1 || d.month > 12) return null;
  if (d.day < 1 || d.day > new Date(year, d.month, 0).getDate()) return null;
  return `${year}-${pad(d.month)}-${pad(d.day)}`;
}

const DATE_LABELS: Record<string, string> = {
  anniversary: 'Годовщина',
  birthday: 'День рождения',
  other: 'Важная дата',
};

function dateTitle(label: string | null | undefined): string {
  const raw = (label ?? '').replace(/^_\$!<|>!\$_$/g, '').trim(); // iOS хранит метки как _$!<Anniversary>!$_
  if (!raw) return DATE_LABELS.other;
  const known = DATE_LABELS[raw.toLowerCase()];
  return known ?? raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** Последние 10 цифр номера — чтобы +7 999… и 8 999… считались одним номером. */
export function phoneKey(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10);
}

const nameKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

export function toCandidates(raw: RawContact[], friends: Friend[]): ImportCandidate[] {
  const byName = new Map(friends.map((f) => [nameKey(f.name), f.name]));
  const byPhone = new Map(friends.filter((f) => phoneKey(f.phone).length >= 7).map((f) => [phoneKey(f.phone), f.name]));
  const seen = new Set<string>();
  const out: ImportCandidate[] = [];

  for (const c of raw) {
    const name = (c.fullName || [c.givenName, c.familyName].filter(Boolean).join(' ')).trim();
    if (!name) continue;
    const phone = (c.phones ?? []).map((p) => p.number?.trim() ?? '').find(Boolean) ?? '';
    const birthday = contactDateToISO(c.birthday);
    const dates = (c.dates ?? [])
      .map((d) => ({ title: dateTitle(d.label), date: contactDateToISO(d.date) }))
      .filter((d): d is { title: string; date: ISODate } => !!d.date)
      .filter((d) => !(d.title === DATE_LABELS.birthday && d.date === birthday));

    // Один человек может встречаться в книге дважды (разные аккаунты) — берём первый.
    const dedupe = `${nameKey(name)}|${phoneKey(phone)}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    const pk = phoneKey(phone);
    const duplicateOf = byName.get(nameKey(name)) ?? (pk.length >= 7 ? byPhone.get(pk) : undefined) ?? null;
    out.push({ key: c.id, name, phone, birthday, dates, note: c.note?.trim() ?? '', duplicateOf });
  }

  return out.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

const EMOJIS = ['🙂', '😎', '🥰', '🤓', '🌸', '⚽', '🎸', '💼', '🐱', '🌟', '🍀', '🎨'];

export function candidateToFriend(c: ImportCandidate, id: string, idFor: () => string): Friend {
  let h = 0;
  for (const ch of c.name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return {
    id,
    name: c.name,
    emoji: EMOJIS[h % EMOJIS.length],
    birthday: c.birthday,
    phone: c.phone,
    food: '',
    flowers: '',
    gifts: '',
    notes: c.note,
    dates: c.dates.map((d) => ({ id: idFor(), title: d.title, date: d.date, yearly: true })),
    createdAt: Date.now(),
  };
}
