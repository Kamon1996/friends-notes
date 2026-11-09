import { TASK_PROVIDERS } from './ai/tasks';
import { extractJson } from './ai/providers';
import type { AiRunner, AiTask } from './ai/types';
import { countryByPhone, firstNameForLookup, genderFromName, isUnisexName, type Gender, type GenderSource } from './gender';

/**
 * Пол друзей определяется сам, в фоне, по ступеням:
 *   names → genderize → device-ai → ai (облачные ИИ из src/lib/ai: Gemini, OpenRouter, Hugging Face)
 * У каждого друга запоминается последняя ступень, которая честно ответила «не знаю» (genderStage), — в следующий раз
 * начинаем со следующей и одного и того же человека дважды не спрашиваем. Ступень отмечается только когда ответ
 * получен; сбой сети ничего не отмечает (попробуем при следующем запуске). Если Genderize отказал надолго
 * (лимит, неверный ключ) — пауза для него (backoff); паузы облачных ИИ ведёт сам модуль ИИ. Ручной выбор главнее всего.
 * Сеть и ИИ приходят снаружи (deps), поэтому всё проверяется тестами без телефона.
 */
export const GENDER_STAGES = ['names', 'genderize', 'device-ai', 'ai'] as const;
export type GenderStage = (typeof GENDER_STAGES)[number];

export interface GenderSubject {
  id: string;
  name: string;
  phone: string;
  gender?: Gender;
  genderBy?: GenderSource;
  genderStage?: GenderStage;
}

export type DeviceAiStatus = 'available' | 'downloadable' | 'downloading' | 'unavailable';

export interface GenderDeps {
  /** Для Genderize. */
  fetch: (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
  deviceAi?: { status(): Promise<DeviceAiStatus>; generate(prompt: string): Promise<string> };
  /** Облачные ИИ с приоритетами и запасными вариантами (src/lib/ai). */
  ai?: AiRunner;
}

/** До какого времени (мс) Genderize не трогаем. */
export interface GenderBackoff {
  genderize?: number;
}

export interface GenderUpdate {
  id: string;
  /** Определили: пол и кто определил. */
  gender?: Gender;
  by?: Exclude<GenderSource, 'manual'>;
  /** Не определили: до какой ступени дошли. */
  stage?: GenderStage;
}

export interface GenderPassResult {
  updates: GenderUpdate[];
  backoff: GenderBackoff;
  problems: string[];
}

const HOUR = 3_600_000;
export const BACKOFF_RATE_LIMIT = 24 * HOUR;
export const BACKOFF_REFUSED = 7 * 24 * HOUR;
/** Сервис сломался на своей стороне (5xx) — не дёргаем его при каждом возвращении в приложение. */
export const BACKOFF_SERVER = HOUR;
/** Сколько имён за один проход — по бесплатным лимитам (Genderize — 100 имён в день); остальные — в следующий раз. */
export const PASS_LIMITS = { genderize: 100, deviceAi: 100, ai: 100 };
/** Сколько имён в одном вопросе облачному ИИ — по 50 модели проверены на испытании (src/lib/ai/bench.ts). */
export const AI_BATCH = 50;

const stageIndex = (s: GenderStage | undefined) => (s ? GENDER_STAGES.indexOf(s) : -1);

/** Есть ли что ещё пробовать: пола нет, вручную не ставили, и ступени не кончились. */
export function genderPending(f: Pick<GenderSubject, 'gender' | 'genderBy' | 'genderStage'>): boolean {
  return !f.gender && f.genderBy !== 'manual' && f.genderStage !== 'ai';
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

/** Ответ Genderize → имя (в нижнем регистре) → пол или null («ответил, но не уверен»). Имени нет в ответе — не ответил. */
export function parseGenderize(body: unknown): Map<string, Gender | null> {
  const out = new Map<string, Gender | null>();
  const list = Array.isArray(body) ? body : body && typeof body === 'object' ? [body] : [];
  for (const item of list as Record<string, unknown>[]) {
    if (!item || typeof item.name !== 'string') continue;
    const p = typeof item.probability === 'number' ? item.probability : 0;
    const c = typeof item.count === 'number' ? item.count : 0;
    const sure = p >= GENDERIZE_MIN_PROBABILITY && c >= GENDERIZE_MIN_COUNT;
    out.set(item.name.toLowerCase(), sure && item.gender === 'female' ? 'f' : sure && item.gender === 'male' ? 'm' : null);
  }
  return out;
}

// ---------- ИИ ----------

/** Вопрос облачному ИИ: пачка имён, ответ — JSON. */
export function genderPrompt(names: string[]): string {
  return [
    'Ниже — имена людей, как их записали в телефонной книге: полное имя, уменьшительное или прозвище; имена русские, казахские и другие.',
    'Определи пол каждого — только если уверен: почти все люди с таким именем одного пола (Анна, Дмитрий, Айгерим).',
    'Имена и уменьшительные, которые бывают и у мужчин, и у женщин (Саша, Женя, Валя, Ника, Слава, Стася, Шура, Сима, Аля, Тоша, Ким, Крис, Алекс, Мишель), — всегда "u".',
    'Незнакомое имя, прозвище, слово вместо имени или хоть малейшее сомнение — "u". Не угадывай по тому, «как чаще»: ошибка хуже, чем "u".',
    'Ответ — только JSON вида {"answers":[{"i":0,"g":"f"}]}, где i — номер строки, g — "f" (женщина), "m" (мужчина) или "u".',
    ...names.map((n, i) => `${i}: ${n}`),
  ].join('\n');
}

/** Ответ ИИ → пол по номеру строки. null — ответ не разобрать (тогда модуль ИИ спросит другую модель). */
export function parseGenderAnswer(text: string, count: number): Map<number, Gender> | null {
  const json = extractJson(text);
  const obj = json && typeof json === 'object' && !Array.isArray(json) ? (json as Record<string, unknown>) : null;
  const list = Array.isArray(json) ? json : (obj?.answers ?? obj?.result ?? obj?.items);
  if (!Array.isArray(list)) return null;
  const out = new Map<number, Gender>();
  for (const item of list as Record<string, unknown>[]) {
    const i = typeof item?.i === 'number' ? item.i : typeof item?.i === 'string' ? Number(item.i) : NaN;
    if (!Number.isInteger(i) || i < 0 || i >= count) continue;
    const g = typeof item.g === 'string' ? item.g.toLowerCase() : '';
    if (g === 'f' || g === 'm') out.set(i, g);
  }
  return out;
}

/** Задача «пол по именам» для модуля ИИ. */
export const GENDER_TASK: AiTask<string[], Map<number, Gender>> = {
  id: 'gender',
  providers: TASK_PROVIDERS.gender,
  request: (names) => ({ prompt: genderPrompt(names), json: true, temperature: 0, maxTokens: 400 + names.length * 30 }),
  parse: (text, names) => parseGenderAnswer(text, names.length),
};

/** Вопрос встроенному ИИ телефона: модель маленькая, поэтому по одному имени и ответ одним словом. */
export function devicePrompt(name: string): string {
  return `Человек записан в телефонной книге как «${name}». Это женщина или мужчина? Отвечай «женщина» или «мужчина», только если уверен: почти все люди с таким именем одного пола. Имена вроде Саша, Женя, Валя, Ника, Слава, Стася бывают и мужскими, и женскими — тогда «неизвестно». Незнакомое имя, прозвище или малейшее сомнение — тоже «неизвестно». Ответь одним словом: женщина, мужчина или неизвестно.`;
}

export function parseDeviceAnswer(text: string): Gender | null {
  const t = text.toLowerCase();
  if (/неизвест|unknown|не знаю/.test(t)) return null;
  const f = /женщ|female|\bж\b/.test(t);
  const m = /мужч|(^|[^e])male|\bм\b/.test(t);
  return f === m ? null : f ? 'f' : 'm';
}

// ---------- Проход ----------

const chunk = <T,>(list: T[], size: number) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

class StopStage extends Error {
  constructor(
    message: string,
    readonly backoffMs = 0,
  ) {
    super(message);
  }
}

/**
 * Один проход по друзьям, которым ещё нужно определить пол. Возвращает изменения (пол или новую ступень) и паузы
 * сервисов. Ничего не сохраняет сам — это делает вызывающий.
 */
export async function genderPass(friends: GenderSubject[], deps: GenderDeps, opts: { now: number; backoff?: GenderBackoff; limits?: Partial<typeof PASS_LIMITS> }): Promise<GenderPassResult> {
  const limits = { ...PASS_LIMITS, ...opts.limits };
  const backoff: GenderBackoff = { ...opts.backoff };
  const problems: string[] = [];
  const last = new Map<string, number>(); // id → индекс последней ответившей ступени
  const found = new Map<string, { gender: Gender; by: Exclude<GenderSource, 'manual'> }>();
  const people = friends.filter(genderPending);
  for (const p of people) last.set(p.id, stageIndex(p.genderStage));
  const at = (p: GenderSubject, stage: GenderStage) => !found.has(p.id) && last.get(p.id)! === GENDER_STAGES.indexOf(stage) - 1;
  const mark = (p: GenderSubject, stage: GenderStage) => last.set(p.id, GENDER_STAGES.indexOf(stage));
  const lookup = new Map(people.map((p) => [p.id, firstNameForLookup(p.name)]));

  // 1. Своя база имён — для всех, кто ждёт: она без интернета, а в новой версии приложения могла пополниться.
  for (const p of people) {
    const g = genderFromName(p.name);
    if (g) found.set(p.id, { gender: g, by: 'names' });
    else if (at(p, 'names')) mark(p, 'names');
  }
  // Имя бывает у обоих (Валя, Ника, Саша), а другого признака нет — наружу не отправляем: Genderize и ИИ видят только
  // имя и ответили бы «как чаще». Сразу «загадка» — спросим у человека.
  for (const p of people) if (!found.has(p.id) && isUnisexName(lookup.get(p.id))) mark(p, 'ai');

  // 2. Genderize — по 10 имён, отдельно для каждой страны, одинаковые имена — один раз.
  const forGenderize = people.filter((p) => at(p, 'genderize'));
  if (forGenderize.length && (backoff.genderize ?? 0) <= opts.now) {
    for (const p of forGenderize) if (!lookup.get(p.id)) mark(p, 'genderize'); // отправлять нечего
    const byCountry = new Map<string, GenderSubject[]>();
    let budget = limits.genderize;
    for (const p of forGenderize) {
      if (!lookup.get(p.id) || budget <= 0) continue;
      budget--;
      const key = countryByPhone(p.phone) ?? '';
      byCountry.set(key, [...(byCountry.get(key) ?? []), p]);
    }
    try {
      for (const [country, group] of byCountry) {
        const names = [...new Map(group.map((p) => [lookup.get(p.id)!.toLowerCase(), lookup.get(p.id)!])).values()];
        for (const part of chunk(names, 10)) {
          let res;
          try {
            res = await deps.fetch(genderizeUrl(part, country || undefined));
          } catch {
            throw new StopStage('Genderize недоступен');
          }
          if (res.status === 429) throw new StopStage('Genderize: лимит исчерпан', BACKOFF_RATE_LIMIT);
          if (res.status === 401 || res.status === 402 || res.status === 403) throw new StopStage(`Genderize отказал (${res.status})`, BACKOFF_REFUSED);
          if (!res.ok) throw new StopStage(`Genderize: ошибка ${res.status}`, res.status >= 500 ? BACKOFF_SERVER : 0);
          const answers = parseGenderize(await res.json().catch(() => null));
          const asked = new Set(part.map((n) => n.toLowerCase()));
          for (const p of group) {
            const key = lookup.get(p.id)!.toLowerCase();
            if (!asked.has(key) || !answers.has(key)) continue;
            const g = answers.get(key);
            if (g) found.set(p.id, { gender: g, by: 'genderize' });
            else mark(p, 'genderize');
          }
        }
      }
    } catch (e) {
      const stop = e instanceof StopStage ? e : new StopStage('Genderize недоступен');
      problems.push(stop.message);
      if (stop.backoffMs) backoff.genderize = opts.now + stop.backoffMs;
    }
  }

  // 3а. Встроенный ИИ телефона — данные не уходят с устройства. Нет его — ступень пропускаем, не отмечая.
  const forDevice = people.filter((p) => at(p, 'device-ai')).slice(0, limits.deviceAi);
  if (forDevice.length && deps.deviceAi && (await deps.deviceAi.status().catch((): DeviceAiStatus => 'unavailable')) === 'available') {
    const asked = new Map<string, Gender | null>(); // одинаковые имена — один вопрос
    for (const p of forDevice) {
      const name = lookup.get(p.id);
      if (!name) {
        mark(p, 'device-ai'); // спрашивать нечего
        continue;
      }
      const key = name.toLowerCase();
      if (!asked.has(key)) {
        try {
          asked.set(key, parseDeviceAnswer(await deps.deviceAi.generate(devicePrompt(name))));
        } catch {
          continue; // сбой на этом человеке — не отмечаем, дальше его спросит облачный ИИ
        }
      }
      const g = asked.get(key);
      if (g) found.set(p.id, { gender: g, by: 'device-ai' });
      else mark(p, 'device-ai');
    }
  }

  // 3б. Облачный ИИ — после встроенного (или если его нет). Только имена; одинаковые — один раз.
  //     Модуль ИИ сам выбирает сервис по приоритету, переходит к следующему, если сервис не ответил, и ставит паузы.
  const forAi = people.filter((p) => !found.has(p.id) && last.get(p.id)! >= GENDER_STAGES.indexOf('genderize') && last.get(p.id)! < GENDER_STAGES.indexOf('ai'));
  if (forAi.length && deps.ai) {
    for (const p of forAi) if (!lookup.get(p.id)) mark(p, 'ai'); // спрашивать нечего
    const withName = forAi.filter((p) => lookup.get(p.id)).slice(0, limits.ai);
    const names = [...new Map(withName.map((p) => [lookup.get(p.id)!.toLowerCase(), lookup.get(p.id)!])).values()];
    for (const part of chunk(names, AI_BATCH)) {
      const result = await deps.ai.run(GENDER_TASK, part).catch(() => null);
      if (!result || result.status === 'unavailable') {
        problems.push('ИИ сейчас недоступен — спросим в следующий раз');
        break;
      }
      const index = new Map(part.map((n, i) => [n.toLowerCase(), i]));
      for (const p of withName) {
        const i = index.get(lookup.get(p.id)!.toLowerCase());
        if (i === undefined) continue;
        const g = result.status === 'ok' ? result.value.get(i) : undefined;
        if (g) found.set(p.id, { gender: g, by: 'ai' });
        else mark(p, 'ai'); // ответил «не знаю» или ответил не по делу — второй раз не спрашиваем
      }
    }
  }

  const updates: GenderUpdate[] = [];
  for (const p of people) {
    const f = found.get(p.id);
    if (f) updates.push({ id: p.id, gender: f.gender, by: f.by });
    else if (last.get(p.id)! > stageIndex(p.genderStage)) updates.push({ id: p.id, stage: GENDER_STAGES[last.get(p.id)!] });
  }
  return { updates, backoff, problems };
}

/**
 * Пол, который раньше угадали Genderize или ИИ по имени, общему для обоих (Валя, Ника), — снимаем: это была догадка
 * «как чаще». Друг становится «загадкой» — спросим у человека. Своя база, ручной выбор и имя с признаком
 * («Валя Сидорова», «Тётя Валя») не трогаем.
 */
export function retractUnisexGuess<T extends GenderSubject>(f: T): T {
  if (!f.gender || (f.genderBy !== 'genderize' && f.genderBy !== 'device-ai' && f.genderBy !== 'ai')) return f;
  if (genderFromName(f.name) || !isUnisexName(firstNameForLookup(f.name))) return f;
  const { gender: _g, genderBy: _b, ...rest } = f;
  return { ...rest, genderStage: 'ai' } as T;
}

/**
 * Применить изменение из прохода к другу — только если за время прохода ничего не поменялось: пол не выбрали
 * вручную, его не определили иначе и имя то же. Ступень только растёт.
 */
export function applyGenderUpdate<T extends GenderSubject>(f: T, u: GenderUpdate | undefined, nameAtStart: string | undefined): T {
  if (!u || f.genderBy === 'manual' || f.gender || f.name !== nameAtStart) return f;
  if (u.gender && u.by) {
    const { genderStage: _s, ...rest } = f;
    return { ...rest, gender: u.gender, genderBy: u.by } as T;
  }
  if (u.stage && stageIndex(u.stage) > stageIndex(f.genderStage)) return { ...f, genderStage: u.stage };
  return f;
}

/**
 * Фоновое определение: один проход за раз (повторный вызов во время прохода ничего не запускает), паузы сервисов
 * читаются и сохраняются через load/save.
 */
export function createGenderSync(opts: { deps: GenderDeps; load(): Promise<GenderBackoff>; save(b: GenderBackoff): Promise<void>; now(): number }) {
  let running = false;
  return {
    async run(friends: GenderSubject[]): Promise<GenderUpdate[]> {
      if (running || !friends.some(genderPending)) return [];
      running = true;
      try {
        const backoff = await opts.load().catch(() => ({}));
        const result = await genderPass(friends, opts.deps, { now: opts.now(), backoff });
        if (JSON.stringify(result.backoff) !== JSON.stringify(backoff)) await opts.save(result.backoff).catch(() => {});
        return result.updates;
      } finally {
        running = false;
      }
    },
  };
}
