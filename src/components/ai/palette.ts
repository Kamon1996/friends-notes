import type { Gender } from '@/lib/gender';
import type { Scheme } from '@/lib/theme';

/** «Волшебный» градиент ИИ: от цветов значка приложения (терракота → роза) к лавандовому. */
export const AI_STOPS = ['#F08A5D', '#E0607E', '#9B7BE0'] as const;
/** Градиент самого значка ИИ — чуть глубже, чтобы белое сердце читалось. */
export const AI_ICON_STOPS = ['#E07050', '#C04060', '#9B5FC0'] as const;

export interface GenderTone {
  /** Кольцо, точка, слово на барабане. */
  ring: string;
  /** Текст на мягком фоне. */
  fg: string;
  /** Мягкий фон пилюли. */
  bg: string;
}

const TONES: Record<Scheme, Record<Gender | 'u', GenderTone>> = {
  dark: {
    f: { ring: '#E8879B', fg: '#F4B3C1', bg: '#3A2228' },
    m: { ring: '#8FA7D6', fg: '#B6C6E6', bg: '#1F2638' },
    u: { ring: '#7B7066', fg: '#A89C90', bg: '#2C2620' },
  },
  light: {
    f: { ring: '#D0607C', fg: '#A23A57', bg: '#F8DEE5' },
    m: { ring: '#5F7DB5', fg: '#34508A', bg: '#DFE6F1' },
    u: { ring: '#9A8F85', fg: '#6F655C', bg: '#F1ECE5' },
  },
};

/** Цвета пола: тёплый розовый и спокойный индиго; «не знаю» — нейтральный. */
export function genderTone(scheme: Scheme, g: Gender | undefined): GenderTone {
  return TONES[scheme][g ?? 'u'];
}
