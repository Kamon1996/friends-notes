import { GENDER_TASK } from '../genderDetect';
import { retryHint } from './limits';
import { PROVIDERS, classify, errorInfo, extractJson, isProviderWideLimit, listOpenRouterFree } from './providers';
import type { AiFetch, FailureKind, ProviderId } from './types';

/**
 * Испытание бесплатных моделей на задаче приложения: всем моделям — один и тот же набор имён тем же запросом, что
 * в приложении; меряем время ответа и качество. Запускается на машине GitHub (scripts/ai-bench, workflow «AI bench»),
 * где есть ключи; результаты — в логе и артефакте.
 */

export type Label = 'f' | 'm' | 'u';

export interface BenchCase {
  name: string;
  /** Правильный ответ: f/m — пол ясен любому носителю; u — по имени понять нельзя, угадывать нельзя. */
  want: Label;
  group: string;
}

const cases = (group: string, want: Label, names: string) => names.split(/\s+/).filter(Boolean).map((name) => ({ name, want, group }));

/**
 * 100 имён — в основном трудные: на них модели и различаются. Только то, что приложение отправляет ИИ: одно имя,
 * без фамилии. Ответ «u» на неоднозначное — правильный; f/m на неоднозначное — ошибка.
 */
export const GENDER_BENCH: BenchCase[] = [
  ...cases('ru-easy', 'f', 'Анна Ольга Ксения Полина'),
  ...cases('ru-easy', 'm', 'Иван Дмитрий Сергей Артём'),
  ...cases('ru-a-male', 'm', 'Никита Илья Данила Кузьма Лука'),
  ...cases('ru-dim', 'f', 'Катюха Ксюша Машуля Алёнка'),
  ...cases('ru-dim', 'm', 'Димон Лёха Серёга Санёк Шурик Тёмыч'),
  ...cases('ambiguous', 'u', 'Саша Женя Валя Слава Шура Сашка Женька Саня Стася Мишель Женечка'),
  ...cases('nickname', 'u', 'Котик Зайка Солнышко Босс Сосед Сантехник Малыш'),
  ...cases('kin', 'f', 'Мама Бабуля Тёща Сестрёнка'),
  ...cases('kin', 'm', 'Папа Дедуля Тесть Сынок'),
  ...cases('kz', 'f', 'Айгерим Алуа Аружан Жансая Сымбат Акерке Жулдыз Алуашка Айгеримка'),
  ...cases('kz', 'm', 'Нурлан Ерлан Бауыржан Айдос Темирлан Ерасыл Куаныш Ерик'),
  ...cases('kz', 'u', 'Жанат'),
  ...cases('tatar', 'm', 'Рамиль Наиль Камиль'),
  ...cases('tatar', 'f', 'Рамиля Наиля Камила Ляйсан'),
  ...cases('caucasus', 'm', 'Ашот Вахтанг'),
  ...cases('caucasus', 'f', 'Гаяне Нино Хадижат'),
  ...cases('ua', 'm', 'Тарас Микола'),
  ...cases('ua', 'f', 'Олеся'),
  ...cases('central-asia', 'f', 'Дильноза Мохира Айпери'),
  ...cases('central-asia', 'm', 'Шахзод Улугбек'),
  ...cases('rare', 'f', 'Нинель Эсфирь Ассоль Есения'),
  ...cases('rare', 'm', 'Демид'),
  ...cases('latin', 'f', 'Aigerim Olga'),
  ...cases('latin', 'm', 'Nurlan Dmitry'),
  ...cases('latin', 'u', 'Sasha Zhenya Alex Kim'),
];

// ---------- Оценка ----------

/** Ответ модели → метка на каждое имя: f, m, u или «-» (пропустила). */
export function benchLabels(text: string | null, count: number): string {
  const out = Array<string>(count).fill('-');
  if (!text) return out.join('');
  const json = extractJson(text);
  const obj = json && typeof json === 'object' && !Array.isArray(json) ? (json as Record<string, unknown>) : null;
  const list = Array.isArray(json) ? json : (obj?.answers ?? obj?.result ?? obj?.items);
  if (!Array.isArray(list)) return out.join('');
  for (const item of list as Record<string, unknown>[]) {
    const i = typeof item?.i === 'number' ? item.i : typeof item?.i === 'string' ? Number(item.i) : NaN;
    const g = typeof item?.g === 'string' ? item.g.toLowerCase() : '';
    if (Number.isInteger(i) && i >= 0 && i < count && (g === 'f' || g === 'm' || g === 'u')) out[i] = g;
  }
  return out.join('');
}

export interface BenchScore {
  total: number;
  /** f/m угадано верно. */
  correct: number;
  /** «u» на неоднозначное — верно. */
  correctUnknown: number;
  /** На ясное имя ответила «не знаю» — не страшно, но пользы нет. */
  missed: number;
  /** Перепутала пол. */
  wrong: number;
  /** Уверенно ответила на неоднозначное. */
  guessed: number;
  /** Пропустила имя или не ответила вовсе. */
  omitted: number;
  /** Вредные ошибки: перепутала или угадывала. Главное — чтобы их не было. */
  harmful: number;
  /** Итог: верные ответы минус вредные ошибки втрое. */
  score: number;
}

export function scoreLabels(benchCases: BenchCase[], labels: string): BenchScore {
  const s = { total: benchCases.length, correct: 0, correctUnknown: 0, missed: 0, wrong: 0, guessed: 0, omitted: 0 };
  benchCases.forEach((c, i) => {
    const got = labels[i] ?? '-';
    if (got === '-') s.omitted++;
    else if (c.want === 'u') {
      if (got === 'u') s.correctUnknown++;
      else s.guessed++;
    } else if (got === c.want) s.correct++;
    else if (got === 'u') s.missed++;
    else s.wrong++;
  });
  const harmful = s.wrong + s.guessed;
  return { ...s, harmful, score: s.correct + s.correctUnknown - 3 * harmful };
}

/** Ошибки по группам имён: где модель путается. */
export function groupErrors(benchCases: BenchCase[], labels: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  benchCases.forEach((c, i) => {
    const got = labels[i] ?? '-';
    if (got !== c.want) (out[c.group] ??= []).push(`${c.name}:${got}`);
  });
  return out;
}

// ---------- Какие модели испытывать ----------

const NOT_TEXT = /tts|image|audio|embedding|live|vision-only|computer|robotics|aqa|transcribe|translate|native|veo|imagen|lyria|guard|whisper|orpheus|playai|safety/i;

export const BENCH_LISTS: Record<ProviderId, { url: string; auth: boolean; pick(body: unknown): string[] }> = {
  gemini: {
    url: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000',
    auth: true,
    pick(body) {
      const models = (body as { models?: { name?: string; supportedGenerationMethods?: string[] }[] })?.models ?? [];
      return models
        .filter((m) => typeof m.name === 'string' && m.supportedGenerationMethods?.includes('generateContent'))
        .map((m) => m.name!.replace(/^models\//, ''))
        .filter((id) => /^(gemini|gemma)-/.test(id) && !NOT_TEXT.test(id));
    },
  },
  openrouter: { url: 'https://openrouter.ai/api/v1/models', auth: false, pick: listOpenRouterFree },
  huggingface: {
    url: 'https://router.huggingface.co/v1/models',
    auth: true,
    pick(body) {
      const data = (body as { data?: { id?: string }[] })?.data ?? [];
      const ids = data.map((m) => m.id).filter((id): id is string => typeof id === 'string' && !NOT_TEXT.test(id));
      // Кредиты Hugging Face копеечные — испытываем только крупные модели общего назначения.
      const wanted = [/Llama-3\.3-70B-Instruct$/, /Qwen2\.5-72B-Instruct$/, /Qwen3-235B-A22B/, /Qwen3-32B$/, /DeepSeek-V3/, /gemma-3-27b-it$/, /Llama-4-Maverick/, /gpt-oss-120b$/, /Kimi-K2-Instruct/, /GLM-4\.[5-9]/, /Mistral-Small-3/];
      return wanted.map((re) => ids.find((id) => re.test(id))).filter((id): id is string => !!id);
    },
  },
  groq: {
    url: 'https://api.groq.com/openai/v1/models',
    auth: true,
    pick(body) {
      const data = (body as { data?: { id?: string; active?: boolean }[] })?.data ?? [];
      return data.filter((m) => typeof m.id === 'string' && m.active !== false && !NOT_TEXT.test(m.id)).map((m) => m.id!);
    },
  },
};

// ---------- Прогон ----------

export interface BenchRequest {
  batch: number;
  status: number | 'timeout' | 'network';
  ms: number;
  kind: FailureKind | 'ok';
  labels: string;
  /** Приложение поняло бы этот ответ. */
  appParsed: boolean;
  usage?: unknown;
  /** Начало ответа или ошибки — когда что-то не так. */
  note?: string;
}

export interface BenchModelResult {
  provider: ProviderId;
  model: string;
  requests: BenchRequest[];
  labels: string;
  score: BenchScore;
  /** Время ответа по запросам, мс. */
  ms: number[];
  skipped?: string;
}

export interface BenchOptions {
  providers: ProviderId[];
  keys: Partial<Record<ProviderId, string>>;
  fetch: AiFetch;
  now(): number;
  sleep(ms: number): Promise<void>;
  log(line: string): void;
  cases?: BenchCase[];
  batch?: number;
  maxModels?: number;
  /** Только эти модели («openrouter:google/gemma-3-27b-it:free»). */
  only?: string[];
  timeoutMs?: number;
  /** Сколько запросов к OpenRouter можно за прогон: бесплатных — 50 в день. */
  openRouterBudget?: number;
}

/** Пауза между запросами к одному сервису — по бесплатным поминутным лимитам. */
const GAP: Record<ProviderId, number> = { gemini: 4500, openrouter: 3200, huggingface: 500, groq: 2100 };

const chunk = <T,>(list: T[], size: number) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

export async function runBench(opts: BenchOptions): Promise<BenchModelResult[]> {
  const benchCases = opts.cases ?? GENDER_BENCH;
  const batches = chunk(benchCases, opts.batch ?? 50);
  const timeoutMs = opts.timeoutMs ?? 90_000;

  async function send(url: string, init: Parameters<AiFetch>[1]) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await opts.fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async function modelsOf(id: ProviderId, key: string): Promise<string[]> {
    const only = (opts.only ?? []).filter((m) => m.startsWith(`${id}:`)).map((m) => m.slice(id.length + 1));
    if (only.length) return only;
    const list = BENCH_LISTS[id];
    try {
      const auth: Record<string, string> = id === 'gemini' ? { 'x-goog-api-key': key } : { authorization: `Bearer ${key}` };
      const res = await send(list.url, { method: 'GET', headers: list.auth ? auth : {} });
      const body = JSON.parse(await res.text());
      const models = list.pick(body);
      opts.log(`[${id}] моделей в списке сервиса: ${models.length}`);
      if (models.length) return models.slice(0, opts.maxModels ?? 40);
    } catch (e) {
      opts.log(`[${id}] список моделей не получен: ${String(e).slice(0, 120)}`);
    }
    return PROVIDERS[id].models;
  }

  async function lane(id: ProviderId): Promise<BenchModelResult[]> {
    const key = opts.keys[id];
    if (!key) {
      opts.log(`[${id}] нет ключа — пропускаю`);
      return [];
    }
    const def = PROVIDERS[id];
    const models = await modelsOf(id, key);
    opts.log(`[${id}] испытываю: ${models.join(', ')}`);
    const results: BenchModelResult[] = [];
    let stopReason: string | undefined;
    let spent = 0;
    let last = 0;

    for (const model of models) {
      if (stopReason) {
        results.push({ provider: id, model, requests: [], labels: '', score: scoreLabels(benchCases, ''), ms: [], skipped: stopReason });
        continue;
      }
      const requests: BenchRequest[] = [];
      let labels = '';
      for (const [b, part] of batches.entries()) {
        if (id === 'openrouter' && spent >= (opts.openRouterBudget ?? 48)) {
          stopReason = 'бюджет запросов OpenRouter на сегодня';
          break;
        }
        let attempt = 0;
        for (;;) {
          const wait = last + GAP[id] - opts.now();
          if (wait > 0) await opts.sleep(wait);
          const names = part.map((c) => c.name);
          const req = def.request(model, key, GENDER_TASK.request(names));
          const started = opts.now();
          last = started;
          spent++;
          let r: BenchRequest;
          try {
            const res = await send(req.url, req.init);
            const raw = await res.text();
            const ms = opts.now() - started;
            let body: unknown = raw;
            try {
              body = JSON.parse(raw);
            } catch {
              // не JSON — оставим текстом
            }
            const kind = classify(id, res.status, body);
            const text = kind ? null : def.text(body);
            const usage = (body as { usage?: unknown; usageMetadata?: unknown })?.usage ?? (body as { usageMetadata?: unknown })?.usageMetadata;
            const partLabels = benchLabels(text, names.length);
            r = {
              batch: b,
              status: res.status,
              ms,
              kind: kind ?? 'ok',
              labels: partLabels,
              appParsed: !!text && GENDER_TASK.parse(text, names) !== null,
              ...(usage !== undefined && { usage }),
            };
            if (kind) r.note = `${errorInfo(body).code} ${errorInfo(body).message || String(raw).slice(0, 200)}`.trim().slice(0, 300);
            else if (!r.appParsed || partLabels.includes('-')) r.note = String(text ?? raw).slice(0, 300);
            if (kind === 'rate-limit' && !(id === 'openrouter' && isProviderWideLimit(id, body)) && attempt === 0) {
              const hint = retryHint({ status: res.status, headers: res.headers, body }, opts.now());
              const pause = Math.min(Math.max((hint ?? opts.now() + 20_000) - opts.now(), 5_000), 65_000);
              opts.log(`[${id}] ${model} #${b + 1}: лимит в минуту — жду ${Math.round(pause / 1000)} с`);
              await opts.sleep(pause);
              attempt++;
              continue;
            }
            if (kind === 'rate-limit' && id === 'openrouter' && isProviderWideLimit(id, body)) stopReason = 'дневной лимит OpenRouter';
            if (kind === 'auth' || kind === 'credits' || kind === 'region') stopReason = `сервис отказал: ${kind}`;
          } catch (e) {
            const ms = opts.now() - started;
            const timeout = (e as Error)?.name === 'AbortError';
            r = { batch: b, status: timeout ? 'timeout' : 'network', ms, kind: timeout ? 'timeout' : 'network', labels: '-'.repeat(names.length), appParsed: false, note: String(e).slice(0, 200) };
          }
          requests.push(r);
          labels += r.labels;
          opts.log(`[${id}] ${model} #${b + 1}: ${r.status} ${(r.ms / 1000).toFixed(1)} с ${r.kind}${r.kind === 'ok' ? ` ${scoreLabels(part, r.labels).correct + scoreLabels(part, r.labels).correctUnknown}/${part.length}` : ''}`);
          break;
        }
        const lastReq = requests[requests.length - 1];
        if (stopReason || (lastReq && lastReq.kind !== 'ok' && lastReq.kind !== 'rate-limit' && lastReq.kind !== 'timeout' && lastReq.kind !== 'server')) break; // модель не работает — дальше не мучаем
      }
      labels = labels.padEnd(benchCases.length, '-');
      results.push({ provider: id, model, requests, labels, score: scoreLabels(benchCases, labels), ms: requests.filter((r) => r.kind === 'ok').map((r) => r.ms) });
    }
    return results;
  }

  const all = await Promise.all(opts.providers.map(lane));
  return all.flat();
}

/** Порядок в итоговой таблице: меньше вредных ошибок, больше верных, быстрее. */
export function rankResults(results: BenchModelResult[]): BenchModelResult[] {
  const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : Infinity);
  return [...results].sort(
    (a, b) =>
      Number(!!a.skipped) - Number(!!b.skipped) ||
      b.score.score - a.score.score ||
      a.score.harmful - b.score.harmful ||
      median(a.ms) - median(b.ms),
  );
}

