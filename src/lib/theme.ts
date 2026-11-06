/**
 * Дизайн-система «Тёплый альбом»: бумага, чернила и один акцентный цвет.
 * Акцент выбирается в настройках — отдельно для светлой и тёмной темы.
 */

import type { AccentId, ThemeMode } from './types';

export type { AccentId, ThemeMode };
export type Scheme = 'light' | 'dark';

export interface AccentColors {
  /** Кнопки, активная вкладка, «сегодня». */
  accent: string;
  /** Текст на акцентной кнопке. */
  onAccent: string;
  /** Текст на мягких подложках (чипы, инициалы в карточке «Сегодня»). */
  accentText: string;
  /** Подложка карточки «Сегодня». */
  tint: string;
  /** Фон чипов «через 3 дня» и подобных. */
  soft: string;
}

export interface AccentDef {
  id: AccentId;
  name: string;
  light: AccentColors;
  dark: AccentColors;
}

export const ACCENTS: AccentDef[] = [
  {
    id: 'terracotta',
    name: 'Терракота',
    light: { accent: '#C4502F', onAccent: '#FFFFFF', accentText: '#9A3E22', tint: '#F5DCCB', soft: '#F8E3DA' },
    dark: { accent: '#E0704F', onAccent: '#17130F', accentText: '#F0A58C', tint: '#3D2A21', soft: '#33241E' },
  },
  {
    id: 'honey',
    name: 'Мёд',
    light: { accent: '#A4631F', onAccent: '#FFFFFF', accentText: '#7A4A10', tint: '#F3E2C2', soft: '#F6E8CF' },
    dark: { accent: '#D9A050', onAccent: '#17130F', accentText: '#F2C98A', tint: '#3A2E18', soft: '#312715' },
  },
  {
    id: 'eucalyptus',
    name: 'Эвкалипт',
    light: { accent: '#3F7A54', onAccent: '#FFFFFF', accentText: '#2E6A42', tint: '#D6E8DC', soft: '#DDEBE1' },
    dark: { accent: '#7FB58F', onAccent: '#17130F', accentText: '#A9D4B4', tint: '#1F3328', soft: '#1B2B22' },
  },
  {
    id: 'plum',
    name: 'Слива',
    light: { accent: '#7A4E78', onAccent: '#FFFFFF', accentText: '#5E3A5C', tint: '#E8DAE6', soft: '#ECDFEA' },
    dark: { accent: '#B88AB5', onAccent: '#17130F', accentText: '#D6B5D4', tint: '#33263A', soft: '#2C2131' },
  },
  {
    id: 'indigo',
    name: 'Индиго',
    light: { accent: '#3E5A8A', onAccent: '#FFFFFF', accentText: '#2F4668', tint: '#DBE2EC', soft: '#E0E6EF' },
    dark: { accent: '#8FA7D6', onAccent: '#17130F', accentText: '#B6C6E6', tint: '#232C3D', soft: '#1F2735' },
  },
  {
    id: 'raspberry',
    name: 'Малина',
    light: { accent: '#BF3F62', onAccent: '#FFFFFF', accentText: '#8E2C48', tint: '#F5D8DF', soft: '#F8DEE5' },
    dark: { accent: '#E07A98', onAccent: '#17130F', accentText: '#F2A9BE', tint: '#3D2230', soft: '#331D29' },
  },
];

export const DEFAULT_ACCENT: AccentId = 'terracotta';

export function accentById(id: string | undefined): AccentDef {
  return ACCENTS.find((a) => a.id === id) ?? ACCENTS[0];
}

export interface Colors extends AccentColors {
  bg: string;
  card: string;
  text: string;
  text2: string;
  text3: string;
  hairline: string;
  separator: string;
  /** Нейтральный фон чипов и иконок. */
  chip: string;
  checkbox: string;
  placeholder: string;
  success: string;
  successSoft: string;
  danger: string;
  dangerSoft: string;
  info: string;
  infoSoft: string;
  warn: string;
  warnSoft: string;
  /** Тёмная плашка (ход импорта) и текст на ней. */
  banner: string;
  onBanner: string;
  /** Тень карточки (CSS boxShadow); в тёмной теме теней нет. */
  shadow: string;
}

const LIGHT = {
  bg: '#F7F3EE',
  card: '#FFFFFF',
  text: '#221C18',
  text2: '#6F655C',
  text3: '#9A8F85',
  hairline: '#EAE2D9',
  separator: '#EFE8E0',
  chip: '#F1ECE5',
  checkbox: '#CFC4B8',
  placeholder: '#9A8F85',
  success: '#4F8A63',
  successSoft: '#DDEBE1',
  danger: '#B5402C',
  dangerSoft: '#F8DFD9',
  info: '#3C5676',
  infoSoft: '#DCE4EE',
  warn: '#8A5A12',
  warnSoft: '#F4E6C4',
  banner: '#221C18',
  onBanner: '#F3ECE4',
  shadow: '0 1px 2px rgba(34, 28, 24, 0.04), 0 6px 18px rgba(34, 28, 24, 0.05)',
};

const DARK: typeof LIGHT = {
  bg: '#17130F',
  card: '#231E19',
  text: '#F3ECE4',
  text2: '#A89C90',
  text3: '#7B7066',
  hairline: '#332C26',
  separator: '#2E2722',
  chip: '#2C2620',
  checkbox: '#6A5E53',
  placeholder: '#7B7066',
  success: '#7FB58F',
  successSoft: '#1F3328',
  danger: '#E07A66',
  dangerSoft: '#3A221C',
  info: '#8FA7D6',
  infoSoft: '#232C3D',
  warn: '#D9A050',
  warnSoft: '#3A2E18',
  banner: '#332C26',
  onBanner: '#F3ECE4',
  shadow: '0 0 0 rgba(0, 0, 0, 0)',
};

export function buildColors(scheme: Scheme, accent: AccentId): Colors {
  const def = accentById(accent);
  return { ...(scheme === 'dark' ? DARK : LIGHT), ...(scheme === 'dark' ? def.dark : def.light) };
}

/** Имена шрифтов, как они загружаются через expo-font. */
export const fonts = {
  /** Lora — имена людей, заголовки экранов, большие числа. */
  display: 'Lora_600SemiBold',
  displayMedium: 'Lora_500Medium',
  displayBold: 'Lora_700Bold',
  /** Golos Text — весь интерфейс. */
  body: 'GolosText_400Regular',
  medium: 'GolosText_500Medium',
  semibold: 'GolosText_600SemiBold',
  bold: 'GolosText_700Bold',
} as const;

/** Шесть тёплых пар «фон / текст» для инициалов — оттенок выбирается по имени и не меняется. */
export const AVATAR_TINTS: { bg: string; fg: string }[] = [
  { bg: '#F6DCCB', fg: '#9A3E22' },
  { bg: '#F4E6C4', fg: '#8A5A12' },
  { bg: '#E6EBCF', fg: '#596A1E' },
  { bg: '#D8EADF', fg: '#2E6A42' },
  { bg: '#EADDE9', fg: '#6E3F6B' },
  { bg: '#DCE4EE', fg: '#3C5676' },
];

export function avatarTint(name: string): { bg: string; fg: string } {
  let h = 0;
  for (const ch of name.trim().toLowerCase()) h = (h * 31 + ch.codePointAt(0)!) % 1_000_003;
  return AVATAR_TINTS[h % AVATAR_TINTS.length];
}

/** Инициалы: первые буквы двух первых слов («Аня Смирнова» → «АС», «Мама» → «М»). */
export function initials(name: string): string {
  const words = name
    .trim()
    .split(/[\s\-–—]+/)
    .filter((w) => /\p{L}/u.test(w));
  const letters = words.slice(0, 2).map((w) => [...w].find((c) => /\p{L}/u.test(c)) ?? '');
  return letters.join('').toUpperCase() || '·';
}
