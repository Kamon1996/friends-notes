import { AMBIGUOUS_NAMES, FEMALE_NAMES, FEMALE_WORDS, MALE_NAMES, MALE_WORDS, SURNAME_LOOKALIKES } from './genderNames';

/**
 * Пол друга — для поздравлений с 8 Марта и 23 Февраля. Определяется по ступеням:
 * 1) своя база имён и правила — только то, что точно (здесь, без интернета);
 * 2) Genderize.io — по имени, с подсказкой страны;
 * 3) ИИ: сначала встроенный в телефон (Gemini Nano), если он есть; что он не понял или если его нет — облачный ИИ
 *    (src/lib/ai: Gemini, OpenRouter, Hugging Face — по тир-листу и приоритету, с запасными вариантами).
 * Всё происходит само, при запуске; каждая ступень спрашивается про человека один раз (см. genderDetect.ts).
 * Что не определилось — человек выбирает сам в карточке друга. Ручной выбор ничем не перезаписывается.
 */
export type Gender = 'f' | 'm';
export type GenderSource = 'manual' | 'names' | 'genderize' | 'device-ai' | 'ai';

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');

/** Слова имени: только буквы, без эмодзи, скобок и цифр; «Анна-Мария» и «Дима-сантехник» — по частям. */
export function nameWords(name: string): string[] {
  return norm(name)
    .split(/[^\p{L}]+/u)
    .filter((w) => w.length >= 2);
}

type Vote = { gender: Gender; strong: boolean };

/** Что говорит одно слово: имя из базы, «мама», отчество, «кызы/улы», фамилия по окончанию. */
function voteOf(word: string, alone: boolean): Vote | null {
  if (AMBIGUOUS_NAMES.has(word) || SURNAME_LOOKALIKES.has(word)) return null;
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
  // Основа перед окончанием — хотя бы три буквы: «Ильин», «Петрова», но не случайные короткие слова.
  if (/^[а-я]{3,}(ова|ева|ина|ына|ская|цкая)$/.test(word)) return { gender: 'f', strong: false };
  if (/^[а-я]{3,}(ов|ев|ин|ын|ский|цкий)$/.test(word)) return { gender: 'm', strong: false };
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
 * Имя, которое отправим в Genderize и ИИ: само имя, без фамилии, отчества и пометок («Сантехник Валя» → «Валя»).
 * Сначала ищем слово, похожее на имя (из базы или неоднозначное), иначе — первое слово, не похожее на фамилию.
 * Фамилии и телефоны не отправляем никогда.
 */
export function firstNameForLookup(name: string): string | null {
  const raw = name.split(/[^\p{L}]+/u).filter((w) => w.length >= 2);
  const candidates = raw.filter((w) => {
    const n = norm(w);
    if (/(овна|евна|ична|ович|евич|кызы|улы)$/.test(n)) return false;
    if (FEMALE_WORDS.has(n) || MALE_WORDS.has(n) || SURNAME_LOOKALIKES.has(n)) return false;
    if (raw.length > 1 && /^[а-я]{3,}(ова|ева|ина|ына|ская|цкая|ов|ев|ин|ын|ский|цкий)$/.test(n)) return false;
    return true;
  });
  const known = candidates.find((w) => {
    const n = norm(w);
    return AMBIGUOUS_NAMES.has(n) || FEMALE_NAMES.has(n) || MALE_NAMES.has(n);
  });
  return known ?? candidates[0] ?? null;
}

/** Поля пола у друга (тип повторяет Friend, чтобы gender.ts не зависел от остального приложения). */
export interface GenderFields {
  name: string;
  gender?: Gender;
  genderBy?: GenderSource;
  genderStage?: 'names' | 'genderize' | 'device-ai' | 'ai';
}

const pickGender = ({ gender, genderBy, genderStage }: GenderFields): Omit<GenderFields, 'name'> => ({
  ...(gender && { gender }),
  ...(genderBy && { genderBy }),
  ...(genderStage && !gender && { genderStage }),
});

/**
 * Пол при сохранении друга:
 * - выбран вручную — сохраняем как выбрали, и дальше автоматика его не трогает;
 * - пол уже есть (определился сам) — оставляем как есть, даже если друга переименовали;
 * - пола нет, имя то же — оставляем, до какой ступени дошли (фоновый проход мог продвинуться, пока была открыта форма);
 * - пола нет, имя другое (или друг новый) — пробуем заново: сразу своя база имён, остальное доделает фоновый проход.
 */
export function genderOnSave<T extends GenderFields>(prev: GenderFields | undefined, next: T): T {
  const { gender: _g, genderBy: _b, genderStage: _s, ...rest } = next;
  if (next.genderBy === 'manual') return { ...rest, ...(next.gender && { gender: next.gender }), genderBy: 'manual' } as T;
  if (prev && (prev.gender || prev.genderBy === 'manual' || prev.name === next.name)) return { ...rest, ...pickGender(prev) } as T;
  const g = genderFromName(next.name);
  return (g ? { ...rest, gender: g, genderBy: 'names' } : { ...rest, genderStage: 'names' }) as T;
}
