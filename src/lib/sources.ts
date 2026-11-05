import type { RawAccount, RawDump, RawDumpItem } from '../../modules/contacts-raw';

export interface SourceDef {
  key: string;
  title: string;
  emoji: string;
  /** Какие типы аккаунтов Android относятся к источнику. */
  match: (accountType: string) => boolean;
  note?: string;
}

export const SOURCES: SourceDef[] = [
  {
    key: 'phone',
    title: 'Телефон и SIM',
    emoji: '📱',
    match: (t) => !t || /phone|sim|local|^com\.android\.contacts|sec\.contact|xiaomi|huawei|oppo|vivo/i.test(t),
  },
  { key: 'google', title: 'Google', emoji: '🔵', match: (t) => t === 'com.google' },
  { key: 'telegram', title: 'Telegram', emoji: '✈️', match: (t) => /telegram|challegram/i.test(t) },
  { key: 'whatsapp', title: 'WhatsApp', emoji: '💬', match: (t) => /whatsapp/i.test(t) },
  { key: 'viber', title: 'Viber', emoji: '💜', match: (t) => /viber/i.test(t) },
  { key: 'vk', title: 'ВКонтакте', emoji: '🟦', match: (t) => /vkontakte|^com\.vk\b|^com\.vk\./i.test(t) },
  { key: 'signal', title: 'Signal', emoji: '🔷', match: (t) => /thoughtcrime|signal/i.test(t) },
  {
    key: 'instagram',
    title: 'Instagram',
    emoji: '📸',
    match: (t) => /instagram/i.test(t),
    note: 'Instagram не записывает контакты в телефонную книгу, поэтому почти наверняка будет пусто.',
  },
];

/** Аккаунты, относящиеся к источнику. */
export function accountsFor(source: SourceDef, accounts: RawAccount[]): RawAccount[] {
  return accounts.filter((a) => source.match(a.accountType));
}

/** Аккаунты, которые не подошли ни под один известный источник. */
export function otherAccounts(accounts: RawAccount[]): RawAccount[] {
  return accounts.filter((a) => !SOURCES.some((s) => s.match(a.accountType)));
}

export const shortMime = (m: unknown) => String(m ?? '').replace(/^vnd\.android\.cursor\.item\//, '');

/** Сколько строк каждого типа (mimetype) пришло. */
export function mimeStats(items: RawDumpItem[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const it of items) for (const d of it.data) counts.set(shortMime(d.mimetype), (counts.get(shortMime(d.mimetype)) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

const fmtFields = (row: Record<string, unknown>, skip: string[] = []) =>
  Object.entries(row)
    .filter(([k]) => !skip.includes(k))
    .map(([k, v]) => `${k}=${typeof v === 'number' && Number.isInteger(v) ? v : String(v).replace(/\s+/g, ' ')}`)
    .join('  ');

/** Человекочитаемый текст: по контакту на блок, по строке данных на строку. */
export function formatDump(title: string, dumps: RawDump[]): string {
  const lines: string[] = [];
  const items = dumps.flatMap((d) => d.items);
  const total = dumps.reduce((n, d) => n + d.total, 0);
  lines.push(`=== ${title}: ${total} сырых контактов${items.length < total ? `, показано ${items.length}` : ''} ===`);
  lines.push(`Аккаунты: ${dumps.map((d) => d.accountType || '(без аккаунта)').join(', ')}`);
  lines.push('Типы данных: ' + mimeStats(items).map(([m, n]) => `${m}×${n}`).join(', '));
  items.forEach((it, i) => {
    const name = it.raw.display_name ?? it.data.find((d) => shortMime(d.mimetype) === 'name')?.data1 ?? '(без имени)';
    lines.push('');
    lines.push(`#${i + 1} ${name}`);
    lines.push(`  raw: ${fmtFields(it.raw, ['display_name'])}`);
    for (const d of it.data) lines.push(`  - ${shortMime(d.mimetype)}: ${fmtFields(d, ['mimetype'])}`);
  });
  return lines.join('\n');
}
