import type { IconName } from '@/components/Icon';

/** Блоки «что любит» в карточке друга. */
export type PrefField = 'food' | 'flowers' | 'gifts' | 'notes';

/** Блоки карточки друга, которые правятся шторкой. Порядок — как в карточке. */
export const PREF_FIELDS: { field: PrefField; label: string; icon: IconName; placeholder: string; hint?: string }[] = [
  { field: 'food', label: 'Еда', icon: 'food', placeholder: 'Любит суши, не ест острое…' },
  { field: 'flowers', label: 'Цветы', icon: 'flower', placeholder: 'Пионы, белые розы…' },
  { field: 'gifts', label: 'Подарки', icon: 'gift', placeholder: 'Хотела книгу…', hint: 'Каждая идея с новой строки — в карточке будет список.' },
  { field: 'notes', label: 'Заметки', icon: 'note', placeholder: 'Всё, что важно не забыть' },
];

/** Текст для сохранения: пустые строки и пробелы в конце не нужны, переносы внутри остаются. */
export const cleanPref = (text: string) => text.replace(/[ \t]+$/gm, '').replace(/^\s*\n/, '').trimEnd();
