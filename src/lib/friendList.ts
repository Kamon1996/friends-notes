import { daysBetween, nextAnniversary } from './dates';
import { matchesAny, prepareQuery } from './search';
import type { Friend } from './types';

export type FriendSort = 'name' | 'date';

export type FriendListItem =
  | { type: 'label'; key: string; title: string; star?: boolean }
  | { type: 'friend'; key: string; friend: Friend; first: boolean; last: boolean };

export const byName = (a: Friend, b: Friend) => a.name.localeCompare(b.name, 'ru');

/** Избранные идут первыми, внутри групп порядок задаёт `cmp`. */
export const favoritesFirst =
  (cmp: (a: Friend, b: Friend) => number) =>
  (a: Friend, b: Friend) =>
    Number(!!b.favorite) - Number(!!a.favorite) || cmp(a, b);

/** Буква для группы в списке; имена без букв (номера, эмодзи) попадают в «#». */
export function letterOf(f: Friend): string {
  const ch = (f.name.trim()[0] ?? '').toUpperCase();
  return /\p{L}/u.test(ch) ? ch : '#';
}

/** По имени — умно (латиница, кириллица, раскладка), по еде, цветам, подаркам, заметкам и телефону — обычным вхождением. */
export function matchesQuery(f: Friend, query: string): boolean {
  const q = prepareQuery(query);
  return !q || matchesAny(f.name, [f.food, f.flowers, f.gifts, f.notes, f.phone], q);
}

/**
 * Строки для экрана «Друзья»: сверху группа «Избранные», дальше остальные —
 * по буквам или, при сортировке по дате, одним списком «Остальные».
 */
export function buildFriendList(friends: Friend[], query: string, sort: FriendSort, today: string): FriendListItem[] {
  const q = prepareQuery(query);
  const list = q ? friends.filter((f) => matchesAny(f.name, [f.food, f.flowers, f.gifts, f.notes, f.phone], q)) : [...friends];
  const next = (f: Friend) => (f.birthday ? daysBetween(today, nextAnniversary(f.birthday, today)) : 10_000);
  const cmp = sort === 'date' ? (a: Friend, b: Friend) => next(a) - next(b) || byName(a, b) : byName;
  list.sort(favoritesFirst(cmp));

  const out: FriendListItem[] = [];
  const pushGroup = (key: string, title: string | null, items: Friend[], star = false) => {
    if (!items.length) return;
    if (title) out.push({ type: 'label', key: `l-${key}`, title, star });
    items.forEach((f, i) => out.push({ type: 'friend', key: f.id, friend: f, first: i === 0, last: i === items.length - 1 }));
  };

  const favorites = list.filter((f) => f.favorite);
  const rest = list.filter((f) => !f.favorite);
  pushGroup('fav', 'Избранные', favorites, true);

  if (sort === 'date') {
    pushGroup('rest', favorites.length ? 'Остальные' : null, rest);
    return out;
  }
  let i = 0;
  while (i < rest.length) {
    const letter = letterOf(rest[i]);
    let j = i;
    while (j < rest.length && letterOf(rest[j]) === letter) j++;
    pushGroup(letter, letter, rest.slice(i, j));
    i = j;
  }
  return out;
}
