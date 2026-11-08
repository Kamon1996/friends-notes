import { FEMALE_NAMES, FEMALE_WORDS, MALE_NAMES, MALE_WORDS } from './genderNames';

/**
 * Пол друга — для поздравлений с 8 Марта и 23 Февраля. Определяется по ступеням:
 * 1) своя база имён и правила — только то, что точно (здесь, без интернета);
 * 2) Genderize.io — по имени, с подсказкой страны;
 * 3) ИИ: сначала встроенный в телефон (Gemini Nano), если его нет — Gemini по ключу.
 * Что не определилось — человек выбирает сам. Ручной выбор ничем не перезаписывается.
 */
export type Gender = 'f' | 'm';
export type GenderSource = 'manual' | 'names' | 'genderize' | 'device-ai' | 'gemini';

export const GENDER_SOURCE_LABEL: Record<GenderSource, string> = {
  manual: 'вручную',
  names: 'по имени',
  genderize: 'Genderize',
  'device-ai': 'ИИ телефона',
  gemini: 'Gemini',
};

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');

/** Слова имени: только буквы и дефисы, без эмодзи, скобок и цифр. */
export function nameWords(name: string): string[] {
  return norm(name)
    .split(/[^\p{L}-]+/u)
    .map((w) => w.replace(/^-+|-+$/g, ''))
    .filter((w) => w.length >= 2);
}

type Vote = { gender: Gender; strong: boolean };

/** Что говорит одно слово: имя из базы, «мама», отчество, «кызы/улы», фамилия по окончанию. */
function voteOf(word: string, alone: boolean): Vote | null {
  if (FEMALE_NAMES.has(word) || FEMALE_WORDS.has(word)) return { gender: 'f', strong: true };
  if (MALE_NAMES.has(word) || MALE_WORDS.has(word)) return { gender: 'm', strong: true };
  // Казахские «дочь/сын»: Айгерим Нурланкызы, Ерлан Серикулы.
  if (/^(кызы|қызы|гызы)$/.test(word) || (word.length > 6 && /(кызы|қызы)$/.test(word))) return { gender: 'f', strong: true };
  if (/^(улы|ұлы|уулу|оглы)$/.test(word) || (word.length > 5 && /(улы|ұлы)$/.test(word))) return { gender: 'm', strong: true };
  if (word.length < 5 || !/^[а-я-]+$/.test(word)) return null;
  // Отчество: Ивановна, Ильинична, Кузьминична / Иванович, Сергеевич.
  if (/(овна|евна|ична|инична)$/.test(word)) return { gender: 'f', strong: true };
  if (/(ович|евич)$/.test(word)) return { gender: 'm', strong: true };
  // Фамилия по окончанию — только если рядом есть ещё слово (одно «Петрова» может быть и прозвищем).
  if (alone) return null;
  if (/(ова|ева|ина|ына|ская|цкая)$/.test(word)) return { gender: 'f', strong: false };
  if (/(ов|ев|ин|ын|ский|цкий)$/.test(word)) return { gender: 'm', strong: false };
  return null;
}

/**
 * Ступень 1: пол по имени без интернета — только если уверены. Уверенные признаки (имя из базы, «мама», отчество,
 * «кызы/улы») должны совпасть, иначе не знаем («Анна Сергеевич»). Если уверенных нет, решает окончание фамилии
 * («Саша Иванова» — женщина), но только когда в имени есть ещё слово.
 */
export function genderFromName(name: string): Gender | null {
  const words = nameWords(name);
  const votes = words.map((w) => voteOf(w, words.length === 1)).filter((v): v is Vote => v !== null);
  // Уверенные признаки (имя из базы, «мама», отчество) главнее окончания фамилии: «Аня Магазин» — женщина.
  const strong = votes.filter((v) => v.strong);
  const deciding = strong.length ? strong : votes;
  if (!deciding.length) return null;
  const genders = new Set(deciding.map((v) => v.gender));
  return genders.size === 1 ? deciding[0].gender : null;
}

/** Страна для подсказки Genderize — по коду номера: казахские имена лучше узнаются с KZ. */
export function countryByPhone(phone: string | null | undefined): string | undefined {
  const digits = (phone ?? '').replace(/\D/g, '');
  const intl = digits.length === 11 && digits.startsWith('8') ? `7${digits.slice(1)}` : digits;
  if (/^7[67]\d{9}$/.test(intl)) return 'KZ';
  if (/^7\d{10}$/.test(intl)) return 'RU';
  if (intl.startsWith('375')) return 'BY';
  if (intl.startsWith('380')) return 'UA';
  if (intl.startsWith('998')) return 'UZ';
  if (intl.startsWith('996')) return 'KG';
  return undefined;
}

/**
 * Имя, которое отправим в Genderize: первое слово, которое не похоже на фамилию, отчество или «маму».
 * Фамилии и телефоны не отправляем никогда.
 */
export function firstNameForLookup(name: string): string | null {
  const raw = name.split(/[^\p{L}-]+/u).filter((w) => w.length >= 2);
  for (const w of raw) {
    const n = norm(w);
    if (/(овна|евна|ична|ович|евич|кызы|улы)$/.test(n)) continue;
    if (raw.length > 1 && n.length >= 5 && /(ова|ева|ина|ына|ская|цкая|ов|ев|ин|ын|ский|цкий)$/.test(n)) continue;
    return w;
  }
  return null;
}

/**
 * Пол по имени для нового или изменённого друга — только своя база, без интернета. Выбранный вручную или
 * определённый сервисом не трогаем; определённый по имени пересчитываем, если имя поменяли.
 */
export function withNameGender<T extends { name: string; gender?: Gender; genderBy?: GenderSource }>(f: T): T {
  if (f.genderBy && f.genderBy !== 'names') return f;
  const g = genderFromName(f.name);
  if (g) return f.gender === g && f.genderBy === 'names' ? f : { ...f, gender: g, genderBy: 'names' };
  if (f.genderBy === 'names') {
    const { gender: _g, genderBy: _b, ...rest } = f;
    return rest as T;
  }
  return f;
}
