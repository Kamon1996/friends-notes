import { countryByPhone, firstNameForLookup, genderFromName, type Gender, type GenderSource } from './gender';

/**
 * Определение пола по ступеням. Сеть и ИИ приходят снаружи (deps), поэтому всё проверяется тестами без телефона.
 *  1. своя база имён — сразу, без интернета;
 *  2. Genderize.io — только имя (без фамилии и телефона) и страна по коду номера; только с согласия;
 *  3. ИИ: встроенный в телефон (данные не уходят) — если он есть; иначе Gemini по ключу — только с согласия
 *     и тоже только имя. Ответ ИИ «не знаю» — честный ответ: такие люди остаются на ручной выбор.
 */
export interface GenderPerson {
  id: string;
  name: string;
  phone: string;
}

export interface GenderFound {
  id: string;
  gender: Gender;
  by: GenderSource;
}

export type DeviceAiStatus = 'available' | 'downloadable' | 'downloading' | 'unavailable';

export interface GenderDeps {
  fetch: (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
  deviceAi?: { status(): Promise<DeviceAiStatus>; generate(prompt: string): Promise<string> };
  geminiKey?: string;
  geminiModels?: string[];
}

export interface GenderRun {
  found: GenderFound[];
  unknown: string[];
  /** Что не сработало — для короткой строки «Genderize недоступен» в интерфейсе. */
  problems: string[];
}

// ---------- Genderize ----------

const GENDERIZE = 'https://api.genderize.io';
/** Принимаем ответ, только если сервис уверен и видел имя много раз. */
export const GENDERIZE_MIN_PROBABILITY = 0.95;
export const GENDERIZE_MIN_COUNT = 30;

export function genderizeUrl(names: string[], country?: string): string {
  const q = names.map((n) => `name[]=${encodeURIComponent(n)}`).join('&');
  return `${GENDERIZE}?${q}${country ? `&country_id=${country}` : ''}`;
}

/** Ответ Genderize → пол по имени (в нижнем регистре). Неуверенные и странные ответы пропускаем. */
export function parseGenderize(body: unknown): Map<string, Gender> {
  const out = new Map<string, Gender>();
  const list = Array.isArray(body) ? body : body && typeof body === 'object' ? [body] : [];
  for (const item of list as Record<string, unknown>[]) {
    if (!item || typeof item.name !== 'string') continue;
    const p = typeof item.probability === 'number' ? item.probability : 0;
    const c = typeof item.count === 'number' ? item.count : 0;
    if (p < GENDERIZE_MIN_PROBABILITY || c < GENDERIZE_MIN_COUNT) continue;
    if (item.gender === 'female') out.set(item.name.toLowerCase(), 'f');
    else if (item.gender === 'male') out.set(item.name.toLowerCase(), 'm');
  }
  return out;
}

// ---------- ИИ ----------

/** Запрос к Gemini: пачка имён, ответ — JSON-массив. */
export function geminiPrompt(names: string[]): string {
  return [
    'Ниже — как люди записаны в телефонной книге: имя, уменьшительное или прозвище; имена русские, казахские и другие.',
    'Определи пол каждого. Если по записи нельзя понять уверенно, ответь "u". Не угадывай.',
    'Ответ — только JSON-массив вида [{"i":0,"g":"f"}], где g — "f" (женщина), "m" (мужчина) или "u".',
    ...names.map((n, i) => `${i}: ${n}`),
  ].join('\n');
}

export function geminiBody(names: string[]): string {
  return JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: geminiPrompt(names) }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json' },
  });
}

/** Ответ Gemini → пол по номеру строки. Всё, кроме f/m, — «не знаем». */
export function parseGemini(body: unknown, count: number): Map<number, Gender> {
  const out = new Map<number, Gender>();
  const parts = (body as { candidates?: { content?: { parts?: { text?: string }[] } }[] })?.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p) => p?.text ?? '').join('');
  let list: unknown;
  try {
    list = JSON.parse(text.replace(/^```(?:json)?|```$/g, '').trim());
  } catch {
    return out;
  }
  if (!Array.isArray(list)) return out;
  for (const item of list as Record<string, unknown>[]) {
    const i = typeof item?.i === 'number' ? item.i : NaN;
    if (!Number.isInteger(i) || i < 0 || i >= count) continue;
    if (item.g === 'f' || item.g === 'm') out.set(i, item.g);
  }
  return out;
}

/** Вопрос встроенному ИИ телефона: модель маленькая, поэтому по одному имени и ответ одним словом. */
export function devicePrompt(name: string): string {
  return `Человек записан в телефонной книге как «${name}». Это женщина или мужчина? Если нельзя понять уверенно, ответь «неизвестно». Ответь одним словом: женщина, мужчина или неизвестно.`;
}

export function parseDeviceAnswer(text: string): Gender | null {
  const t = text.toLowerCase();
  if (/неизвест|unknown|не знаю/.test(t)) return null;
  const f = /женщ|female|\bж\b/.test(t);
  const m = /мужч|(^|[^e])male|\bм\b/.test(t);
  return f === m ? null : f ? 'f' : 'm';
}

// ---------- Ступени вместе ----------

const chunk = <T,>(list: T[], size: number) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

/**
 * Определить пол людей. `online` — согласие отправить имена в Genderize и Gemini; без него работают только своя база
 * и встроенный ИИ телефона. `onProgress` — для строки «Проверяю…» в интерфейсе.
 */
export async function detectGenders(
  people: GenderPerson[],
  deps: GenderDeps,
  options: { online: boolean; onProgress?: (stage: 'names' | 'genderize' | 'device-ai' | 'gemini') => void },
): Promise<GenderRun> {
  const found: GenderFound[] = [];
  const problems: string[] = [];
  let left: GenderPerson[] = [];

  options.onProgress?.('names');
  for (const p of people) {
    const g = genderFromName(p.name);
    if (g) found.push({ id: p.id, gender: g, by: 'names' });
    else left.push(p);
  }

  // Ступень 2: Genderize — по 10 имён, отдельно для каждой страны.
  if (options.online && left.length) {
    options.onProgress?.('genderize');
    const lookup = new Map(left.map((p) => [p.id, firstNameForLookup(p.name)]));
    const byCountry = new Map<string, GenderPerson[]>();
    for (const p of left) {
      if (!lookup.get(p.id)) continue;
      const key = countryByPhone(p.phone) ?? '';
      byCountry.set(key, [...(byCountry.get(key) ?? []), p]);
    }
    const answered = new Set<string>();
    try {
      for (const [country, group] of byCountry) {
        for (const part of chunk(group, 10)) {
          const names = [...new Set(part.map((p) => lookup.get(p.id)!))];
          const res = await deps.fetch(genderizeUrl(names, country || undefined));
          if (!res.ok) throw new Error(res.status === 429 ? 'Genderize: лимит на сегодня исчерпан' : `Genderize: ошибка ${res.status}`);
          const genders = parseGenderize(await res.json());
          for (const p of part) {
            const g = genders.get(lookup.get(p.id)!.toLowerCase());
            if (g) {
              found.push({ id: p.id, gender: g, by: 'genderize' });
              answered.add(p.id);
            }
          }
        }
      }
    } catch (e) {
      problems.push(e instanceof Error && e.message.startsWith('Genderize') ? e.message : 'Genderize недоступен');
    }
    left = left.filter((p) => !answered.has(p.id));
  }

  // Ступень 3а: встроенный ИИ телефона — данные не уходят с устройства.
  let deviceReady = false;
  if (left.length && deps.deviceAi) {
    deviceReady = (await deps.deviceAi.status().catch(() => 'unavailable' as DeviceAiStatus)) === 'available';
  }
  if (deviceReady && left.length) {
    options.onProgress?.('device-ai');
    const answered = new Set<string>();
    for (const p of left) {
      const text = await deps.deviceAi!.generate(devicePrompt(p.name)).catch(() => '');
      const g = parseDeviceAnswer(text);
      if (g) {
        found.push({ id: p.id, gender: g, by: 'device-ai' });
        answered.add(p.id);
      }
    }
    left = left.filter((p) => !answered.has(p.id));
  }

  // Ступень 3б: Gemini — только если встроенного ИИ нет, есть ключ и согласие. Отправляем только имя.
  if (!deviceReady && options.online && deps.geminiKey && left.length) {
    options.onProgress?.('gemini');
    const withName = left.filter((p) => firstNameForLookup(p.name));
    const answered = new Set<string>();
    try {
      for (const part of chunk(withName, 30)) {
        const names = part.map((p) => firstNameForLookup(p.name)!);
        const body = await askGemini(deps, names);
        const genders = parseGemini(body, names.length);
        part.forEach((p, i) => {
          const g = genders.get(i);
          if (g) {
            found.push({ id: p.id, gender: g, by: 'gemini' });
            answered.add(p.id);
          }
        });
      }
    } catch (e) {
      problems.push(e instanceof Error ? e.message : 'Gemini недоступен');
    }
    left = left.filter((p) => !answered.has(p.id));
  }

  return { found, unknown: left.map((p) => p.id), problems };
}

async function askGemini(deps: GenderDeps, names: string[]): Promise<unknown> {
  const models = deps.geminiModels?.length ? deps.geminiModels : ['gemini-flash-lite-latest', 'gemini-flash-latest'];
  let last = 'Gemini недоступен';
  for (const model of models) {
    const res = await deps.fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': deps.geminiKey! },
      body: geminiBody(names),
    });
    if (res.ok) return res.json();
    const err = (await res.json().catch(() => null)) as { error?: { status?: string; message?: string } } | null;
    if (res.status === 404) continue; // модель переименовали — пробуем следующую
    if (err?.error?.status === 'FAILED_PRECONDITION' || /location is not supported/i.test(err?.error?.message ?? '')) {
      throw new Error('Gemini недоступен в этой стране');
    }
    if (res.status === 429) throw new Error('Gemini: лимит бесплатного ключа исчерпан');
    last = `Gemini: ошибка ${res.status}`;
  }
  throw new Error(last);
}
