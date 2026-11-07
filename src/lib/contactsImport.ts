import { UNKNOWN_YEAR } from './dates';
import { isServiceNumber, phoneKey, type Links } from './messengers';
import { mergeLinks, parseSocialInput, linkFromInput } from './socials';
import type { Friend, ISODate, SocialLink } from './types';

export { phoneKey };

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
  /** Нормализованные номера (+375…) из телефонной книги Android. */
  normalizedPhones?: string[];
  /** Мессенджеры, в которых есть человек. */
  links?: Links;
  /** Соцсети, уже разобранные источником (Telegram). */
  socials?: SocialLink[];
  /** Адреса сайтов из телефонной книги — разбираем по каталогу сетей. */
  websites?: string[];
  photoUri?: string | null;
  thumbUri?: string | null;
  /** Это ты сам (своя запись Telegram в телефонной книге). */
  isSelf?: boolean;
}

type LooseDate = { year?: number; month: number; day: number };

/**
 * Разбор даты из телефонной книги. Приложения пишут даты по-разному:
 * 1990-05-12, 1990-05-12T00:00:00Z, --05-12, 12.05.1990, 12.05, 1990/05/12, 19900512.
 */
export function parseLooseDate(value: string | null | undefined): LooseDate | null {
  const s = (value ?? '').trim();
  let m: RegExpExecArray | null;
  if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s))) return { year: +m[1], month: +m[2], day: +m[3] };
  if ((m = /^--(\d{2})-?(\d{2})$/.exec(s))) return { month: +m[1], day: +m[2] };
  if ((m = /^(\d{4})(\d{2})(\d{2})$/.exec(s))) return { year: +m[1], month: +m[2], day: +m[3] };
  if ((m = /^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?$/.exec(s))) return { year: m[3] ? +m[3] : undefined, month: +m[2], day: +m[1] };
  if ((m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/.exec(s))) {
    const a = +m[1];
    const b = +m[2];
    // Порядок день/месяц неоднозначен: если второе число > 12, это MM/DD, иначе считаем DD/MM.
    const [day, month] = b > 12 ? [b, a] : [a, b];
    return { year: m[3] ? +m[3] : undefined, month, day };
  }
  return null;
}

/** Контакт из старого API expo-contacts (месяцы с 0, на Android есть исходные строки дат). */
export interface LegacyContact {
  id?: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phoneNumbers?: { number?: string | null }[] | null;
  birthday?: { year?: number | null; month: number; day: number } | null;
  dates?: { year?: number | null; month: number; day: number; label?: string | null }[] | null;
  rawDates?: { type?: string | null; value?: string | null }[] | null;
  note?: string | null;
}

export function fromLegacyContact(c: LegacyContact, index: number): RawContact {
  const base: RawContact = {
    id: c.id ?? `legacy-${index}`,
    fullName: c.name,
    givenName: c.firstName,
    familyName: c.lastName,
    phones: (c.phoneNumbers ?? []).map((p) => ({ number: p.number })),
    note: c.note,
  };
  if (c.rawDates?.length) {
    // Android: разбираем исходные строки сами — так не теряются даты в нестандартном формате.
    const dates: NonNullable<RawContact['dates']> = [];
    for (const r of c.rawDates) {
      const date = parseLooseDate(r.value);
      if (!date) continue;
      if (isBirthdayLabel(r.type) && !base.birthday) base.birthday = date;
      else dates.push({ label: r.type, date });
    }
    return { ...base, dates };
  }
  const shift = (d: { year?: number | null; month: number; day: number }) => ({ year: d.year, month: d.month + 1, day: d.day });
  return {
    ...base,
    birthday: c.birthday ? shift(c.birthday) : null,
    dates: (c.dates ?? []).map((d) => ({ label: d.label, date: shift(d) })),
  };
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
  links: Links;
  socials: SocialLink[];
  photoUri: string | null;
  thumbUri: string | null;
}

let seq = 0;
const linkId = () => `cl-${Date.now().toString(36)}-${(seq++).toString(36)}`;

/** Соцсети контакта: готовые от источника плюс адреса сайтов, разобранные по каталогу. */
function contactSocials(c: RawContact): SocialLink[] {
  const fromSites = (c.websites ?? []).map((w) => linkFromInput(parseSocialInput(w), null, linkId(), 'contacts')).filter((l): l is SocialLink => !!l);
  return mergeLinks(c.socials, fromSites);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Метка даты означает день рождения: стандартная «birthday» или своя («День рождения», «ДР»…). */
export const isBirthdayLabel = (label: string | null | undefined) => /birth|рожд|^др$/i.test((label ?? '').trim());

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

const nameKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

const hasLetters = (s: string) => /\p{L}/u.test(s);

/** Номера контакта без служебных; нормализованные (+375…) — в приоритете. */
function personPhones(c: RawContact): { valid: string[]; hadAny: boolean } {
  const all = [...(c.normalizedPhones ?? []), ...(c.phones ?? []).map((p) => p.number?.trim() ?? '')].filter(Boolean);
  return { valid: all.filter((p) => !isServiceNumber(p)), hadAny: all.length > 0 };
}

export function toCandidates(raw: RawContact[], friends: Friend[]): ImportCandidate[] {
  const byName = new Map(friends.map((f) => [nameKey(f.name), f.name]));
  const byPhone = new Map(friends.filter((f) => phoneKey(f.phone).length >= 7).map((f) => [phoneKey(f.phone), f.name]));
  const seen = new Set<string>();
  const out: ImportCandidate[] = [];
  const byPhoneIndex = new Map<string, ImportCandidate>();
  const contactName = (c: RawContact) => (c.fullName || [c.givenName, c.familyName].filter(Boolean).join(' ')).trim();
  const hasPhone = (c: RawContact) => personPhones(c).valid.length > 0;
  // Мессенджеры добавляют в книгу свои копии людей без номера. Если тот же человек есть с номером — копию пропускаем.
  const namesWithPhone = new Set(raw.filter(hasPhone).map((c) => nameKey(contactName(c))));

  for (const c of raw) {
    if (c.isSelf) continue;
    const { valid, hadAny } = personPhones(c);
    // Только служебные номера («Баланс *100#», «Скорая 101») — это не человек.
    if (hadAny && !valid.length) continue;
    if (!valid.length && namesWithPhone.has(nameKey(contactName(c)))) continue;
    const name = contactName(c);
    if (!name) continue;
    if (!hasLetters(name) && !valid.length) continue;
    const phone = valid[0] ?? '';
    // На Android день рождения приходит как дата с меткой «birthday».
    const birthdayDate = c.birthday ?? (c.dates ?? []).find((d) => isBirthdayLabel(d.label))?.date;
    const birthday = contactDateToISO(birthdayDate);
    const dates = (c.dates ?? [])
      .map((d) => ({ title: dateTitle(d.label), date: contactDateToISO(d.date) }))
      .filter((d): d is { title: string; date: ISODate } => !!d.date)
      .filter((d) => !(isBirthdayLabel(d.title) && d.date === birthday));

    // Один человек может встречаться в книге дважды (разные аккаунты) — берём первый.
    const dedupe = `${nameKey(name)}|${phoneKey(phone)}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    const pk = phoneKey(phone);
    const links = c.links ?? {};
    const photoUri = c.photoUri ?? null;
    const thumbUri = c.thumbUri ?? photoUri;

    // Тот же номер уже встречался (копия из Google/Telegram/WhatsApp) — дополняем первую запись.
    const same = pk.length >= 7 ? byPhoneIndex.get(pk) : undefined;
    if (same) {
      same.links = { ...links, ...same.links };
      same.socials = mergeLinks(same.socials, contactSocials(c));
      if (!same.photoUri && photoUri) {
        same.photoUri = photoUri;
        same.thumbUri = thumbUri;
      }
      same.birthday = same.birthday ?? birthday;
      if (!hasLetters(same.name) && hasLetters(name)) same.name = name;
      continue;
    }

    const duplicateOf = byName.get(nameKey(name)) ?? (pk.length >= 7 ? byPhone.get(pk) : undefined) ?? null;
    const candidate: ImportCandidate = { key: c.id, name, phone, birthday, dates, note: c.note?.trim() ?? '', duplicateOf, links, socials: contactSocials(c), photoUri, thumbUri };
    if (pk.length >= 7) byPhoneIndex.set(pk, candidate);
    out.push(candidate);
  }

  // Контакты без имени (вместо имени номер) — в конец списка.
  const noName = (c: ImportCandidate) => !hasLetters(c.name);
  return out.sort((a, b) => Number(noName(a)) - Number(noName(b)) || a.name.localeCompare(b.name, 'ru'));
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
    telegramId: c.links.telegramId ?? null,
    whatsapp: c.links.whatsapp ?? null,
    viber: c.links.viber ?? null,
    socials: c.socials.length ? c.socials : undefined,
    photoUri: c.photoUri,
    thumbUri: c.thumbUri,
  };
}
