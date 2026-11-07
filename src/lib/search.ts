/**
 * Умный поиск по именам. Находит человека, как бы его ни записали:
 * «ninel» ↔ «Нинель», «Yulia» / «Julia» / «Iuliia» ↔ «Юлия», «Alexey» ↔ «Алексей»,
 * без учёта регистра, ё/е, й/и и диакритики, а также если запрос набран не в той раскладке («ybytk» → «нинел»).
 *
 * Принцип: и имя, и запрос приводятся к одному «скелету» — латинице без гласных-йотаций и
 * вариантов транслитерации (sh/sch, kh/h, ts/c, y/i/j…). Двойные буквы склеиваются (Алла = Ала, Филипп = Filip),
 * а три и больше одинаковых подряд остаются как есть: «ззз» — не «з». Совпадение — по началу слов.
 */

const CYR_TO_LAT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  і: 'i', ї: 'yi', є: 'ye', ґ: 'g', ў: 'u',
};

/** QWERTY → ЙЦУКЕН: та же клавиша в другой раскладке. */
const LAT_TO_CYR_KEYS: Record<string, string> = {
  q: 'й', w: 'ц', e: 'у', r: 'к', t: 'е', y: 'н', u: 'г', i: 'ш', o: 'щ', p: 'з', '[': 'х', ']': 'ъ',
  a: 'ф', s: 'ы', d: 'в', f: 'а', g: 'п', h: 'р', j: 'о', k: 'л', l: 'д', ';': 'ж', "'": 'э',
  z: 'я', x: 'ч', c: 'с', v: 'м', b: 'и', n: 'т', m: 'ь', ',': 'б', '.': 'ю',
};
const CYR_TO_LAT_KEYS: Record<string, string> = Object.fromEntries(Object.entries(LAT_TO_CYR_KEYS).map(([k, v]) => [v, k]));

/** Запрос, набранный не в той раскладке: «ybytk» → «нинел», «Ефтнф» → «tanya». */
export function swapLayout(text: string): string {
  let out = '';
  for (const ch of text.toLowerCase()) out += LAT_TO_CYR_KEYS[ch] ?? CYR_TO_LAT_KEYS[ch] ?? ch;
  return out;
}

/** Сводит варианты латинской записи к одному виду. Применяется и к транслиту кириллицы, и к «родной» латинице. */
function reduceLatin(s: string): string {
  let r = s
    .replace(/shch|sch/g, 'sh')
    .replace(/kh/g, 'h')
    .replace(/ph/g, 'f')
    .replace(/th/g, 't')
    .replace(/ck/g, 'k')
    .replace(/t[sz]/g, 'c')
    .replace(/j/g, 'y')
    .replace(/w/g, 'v')
    .replace(/x/g, 'ks')
    .replace(/q/g, 'k')
    .replace(/c(?=[eiy])/g, 's')
    .replace(/c/g, 'k')
    .replace(/yo/g, 'e');
  // Йотация перед гласной не несёт смысла для поиска: yulia / iuliia / julia → ulia.
  for (let i = 0; i < 2; i++) r = r.replace(/[yi](?=[aeou])/g, '');
  return r
    .replace(/y/g, 'i')
    .replace(/ee/g, 'i')
    .replace(/oo/g, 'u')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/([a-z0-9])\1+/g, (run, ch: string) => (run.length === 2 ? ch : run))
    .replace(/\s+/g, ' ')
    .trim();
}

const cache = new Map<string, string>();

/** «Скелет» текста для сравнения. Результаты кэшируются: список на 10 тысяч имён не пересчитывается на каждую букву. */
export function searchKey(text: string): string {
  const hit = cache.get(text);
  if (hit !== undefined) return hit;
  // NFD раскладывает ё → е + ̈ и й → и + ̆, диакритику убираем — так же исчезают акценты латиницы (é → e).
  const base = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  let latin = '';
  for (const ch of base) {
    const mapped = CYR_TO_LAT[ch];
    if (mapped !== undefined) latin += mapped;
    else if (/[a-z0-9]/.test(ch)) latin += ch;
    else latin += ' ';
  }
  const key = reduceLatin(latin);
  if (cache.size > 30_000) cache.clear();
  cache.set(text, key);
  return key;
}

export interface SearchQuery {
  /** Исходный запрос в нижнем регистре — для обычного вхождения в заметки, телефоны и т. п. */
  raw: string;
  /** Варианты скелета: как набрано и в другой раскладке; каждый — список слов. */
  variants: string[][];
}

export function prepareQuery(query: string): SearchQuery | null {
  const raw = query.trim().toLowerCase();
  if (!raw) return null;
  const variants = [searchKey(raw), searchKey(swapLayout(raw))]
    .map((k) => k.split(' ').filter(Boolean))
    .filter((words, i, arr) => words.length > 0 && arr.findIndex((w) => w.join(' ') === words.join(' ')) === i);
  return { raw, variants };
}

/** Каждое слово запроса — начало какого-то слова имени (в любом из вариантов записи). */
export function matchesName(name: string, q: SearchQuery): boolean {
  if (name.toLowerCase().includes(q.raw)) return true;
  const words = searchKey(name).split(' ');
  return q.variants.some((variant) => variant.every((qw) => words.some((w) => w.startsWith(qw))));
}

/** Поиск по имени умный, по остальным полям — обычное вхождение. */
export function matchesAny(name: string, fields: string[], q: SearchQuery): boolean {
  return matchesName(name, q) || fields.some((f) => f.toLowerCase().includes(q.raw));
}
