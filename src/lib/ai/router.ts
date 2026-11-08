import { pauseUntil, retryHint } from './limits';
import { PROVIDERS, classify, isProviderWideLimit, type ProviderDef } from './providers';
import { tierPlan, type Ratings } from './tiers';
import type { AiAttempt, AiFetch, AiResult, AiRunner, AiTask, FailureKind, ProviderId } from './types';

/**
 * Основа для любых ИИ-задач приложения:
 * - сначала модели, которые лучше всех показали себя на испытании (тир-лист, tiers.ts), потом ещё не испытанные —
 *   в порядке приоритета сервисов задачи; модели с тиром F не спрашиваются никогда; нет ключа — сервис пропускается;
 * - у сервиса несколько моделей: модель убрали или упёрлась в свой лимит — пробуем следующую;
 * - не ответил (лимит, сбой, отказ) — идём к следующему сервису, а этот ставим на паузу: до времени, которое он
 *   назвал сам, иначе — по умолчанию, с каждой неудачей подряд дольше (limits.ts). До конца паузы его не трогаем;
 * - ответил — неудачи забываются;
 * - паузы и список бесплатных моделей сохраняются между запусками (load/save).
 */

/** Пауза: сервис («openrouter») целиком или одна его модель («gemini/gemini-flash-lite-latest»). */
export interface AiPause {
  until: number;
  /** Сколько неудач подряд — чтобы пауза по умолчанию росла. */
  strikes: number;
  reason: FailureKind;
}

export interface AiState {
  pauses: Record<string, AiPause>;
  /** Свежие списки моделей (OpenRouter) и когда их получили. */
  models: Partial<Record<ProviderId, { list: string[]; at: number }>>;
}

export interface AiOptions {
  keys: Partial<Record<ProviderId, string>>;
  fetch: AiFetch;
  now(): number;
  load(): Promise<unknown>;
  save(state: AiState): Promise<void>;
  /** Сколько ждать ответа, мс. */
  timeoutMs?: number;
  /** Сколько моделей одного сервиса пробовать за один вопрос — чтобы не сжечь лимиты перебором. */
  modelsPerProvider?: number;
  providers?: Record<ProviderId, ProviderDef>;
  /** Тир-лист: оценки моделей по задачам (ratings.ts). Нет — порядок по приоритету сервисов. */
  ratings?: Ratings;
}

const DAY = 24 * 3_600_000;
export const MODEL_LIST_TTL = 7 * DAY;
export const DEFAULT_TIMEOUT = 25_000;

const KINDS: FailureKind[] = ['rate-limit', 'credits', 'auth', 'region', 'model-missing', 'bad-request', 'server', 'timeout', 'network', 'unusable'];

/** Сохранённое состояние — только то, что понятно; остальное выбрасываем. */
export function sanitizeState(raw: unknown): AiState {
  const out: AiState = { pauses: {}, models: {} };
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const pauses = obj.pauses && typeof obj.pauses === 'object' ? (obj.pauses as Record<string, unknown>) : {};
  for (const [key, p] of Object.entries(pauses)) {
    const v = p as Partial<AiPause> | null;
    if (v && typeof v.until === 'number' && Number.isFinite(v.until) && typeof v.strikes === 'number' && KINDS.includes(v.reason as FailureKind)) {
      out.pauses[key] = { until: v.until, strikes: Math.max(0, Math.floor(v.strikes)), reason: v.reason as FailureKind };
    }
  }
  const models = obj.models && typeof obj.models === 'object' ? (obj.models as Record<string, unknown>) : {};
  for (const [id, m] of Object.entries(models)) {
    const v = m as { list?: unknown; at?: unknown } | null;
    if (id in PROVIDERS && v && Array.isArray(v.list) && v.list.every((x) => typeof x === 'string') && typeof v.at === 'number') {
      out.models[id as ProviderId] = { list: v.list as string[], at: v.at };
    }
  }
  return out;
}

const TIMEOUT = Symbol('timeout');

export function createAi(opts: AiOptions): AiRunner & { state(): Promise<AiState> } {
  const providers = opts.providers ?? PROVIDERS;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT;
  const perProvider = opts.modelsPerProvider ?? 3;
  let state: AiState | null = null;

  const ensure = async () => (state ??= sanitizeState(await opts.load().catch(() => null)));
  const pausedNow = (s: AiState, key: string, now: number) => (s.pauses[key]?.until ?? 0) > now;

  /** fetch с ограничением по времени. */
  async function send(url: string, init: Parameters<AiFetch>[1]) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        opts.fetch(url, { ...init, ...(controller && { signal: controller.signal }) }),
        new Promise<typeof TIMEOUT>((resolve) => {
          timer = setTimeout(() => {
            controller?.abort();
            resolve(TIMEOUT);
          }, timeoutMs);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Модели сервиса: свежий список, если сервис его даёт (раз в неделю), иначе — заданные. */
  async function modelsOf(def: ProviderDef, s: AiState, now: number): Promise<string[]> {
    if (!def.discover) return def.models;
    const cached = s.models[def.id];
    if (cached?.list.length && now - cached.at < MODEL_LIST_TTL) return cached.list;
    try {
      const res = await send(def.discover.url, { method: 'GET' });
      if (res !== TIMEOUT && res.status === 200) {
        const list = def.discover.pick(JSON.parse(await res.text()));
        if (list.length) {
          s.models[def.id] = { list, at: now };
          return list;
        }
      }
    } catch {
      // не получилось — берём, что есть
    }
    return cached?.list.length ? cached.list : def.models;
  }

  function pause(s: AiState, key: string, kind: FailureKind, hint: number | undefined, now: number): number {
    const strikes = s.pauses[key]?.strikes ?? 0;
    const until = pauseUntil(kind, hint, strikes, now);
    s.pauses[key] = { until, strikes: strikes + 1, reason: kind };
    return until;
  }

  /** Старые паузы, которые давно кончились, выбрасываем, чтобы состояние не росло. */
  function prune(s: AiState, now: number) {
    for (const [key, p] of Object.entries(s.pauses)) if (p.until < now - DAY) delete s.pauses[key];
  }

  return {
    async state() {
      return structuredCloneSafe(await ensure());
    },

    async run<I, O>(task: AiTask<I, O>, input: I): Promise<AiResult<O>> {
      const s = await ensure();
      const before = JSON.stringify(s);
      const attempts: AiAttempt[] = [];
      let answered = false;
      const finish = async <R extends AiResult<O>>(result: R): Promise<R> => {
        prune(s, opts.now());
        if (JSON.stringify(s) !== before) await opts.save(structuredCloneSafe(s)).catch(() => {});
        return result;
      };

      // Порядок: проверенные хорошие модели по тир-листу → ещё не испытанные по приоритету сервисов → слабые (C).
      const plan = tierPlan(opts.ratings?.[task.id], task.providers);
      const tried = new Set<string>();
      const stopped = new Set<ProviderId>(); // сервис выбыл из этого вопроса
      const used: Partial<Record<ProviderId, number>> = {};
      const providerPaused = (id: ProviderId) => {
        if (!pausedNow(s, id, opts.now())) return false;
        if (!stopped.has(id)) attempts.push({ provider: id, outcome: 'paused', until: s.pauses[id].until });
        stopped.add(id);
        return true;
      };

      /** Спросить одну модель. Вернёт результат, если она ответила по делу. */
      const ask = async (id: ProviderId, model: string): Promise<AiResult<O> | null> => {
        const def = providers[id];
        const key = opts.keys[id];
        const pairKey = `${id}:${model}`;
        if (!def || !key || stopped.has(id) || tried.has(pairKey) || plan.banned.has(pairKey)) return null;
        tried.add(pairKey);
        if (providerPaused(id)) return null;
        const now = opts.now();
        if (pausedNow(s, `${id}/${model}`, now) || (used[id] ?? 0) >= perProvider) return null;
        used[id] = (used[id] ?? 0) + 1;

        const req = def.request(model, key, task.request(input));
        let res;
        try {
          res = await send(req.url, req.init);
        } catch {
          attempts.push({ provider: id, model, outcome: 'network' });
          stopped.add(id); // нет сети или сервис недоступен отсюда — пауза не нужна, идём к следующему
          return null;
        }
        if (res === TIMEOUT) {
          const until = pause(s, id, 'timeout', undefined, now);
          attempts.push({ provider: id, model, outcome: 'timeout', until });
          stopped.add(id);
          return null;
        }
        const raw = await res.text().catch(() => '');
        let body: unknown = null;
        try {
          body = raw ? JSON.parse(raw) : null;
        } catch {
          body = raw;
        }
        const kind = classify(id, res.status, body);

        if (!kind) {
          const text = def.text(body);
          const value = text === null ? null : task.parse(text, input);
          if (value !== null) {
            delete s.pauses[id];
            delete s.pauses[`${id}/${model}`];
            attempts.push({ provider: id, model, outcome: 'ok' });
            return { status: 'ok', value, provider: id, model, attempts };
          }
          answered = true;
          attempts.push({ provider: id, model, outcome: 'unusable' });
          return null; // другая модель может ответить по делу
        }

        const hint = retryHint({ status: res.status, headers: res.headers, body }, now);
        const wide = kind === 'auth' || kind === 'region' || kind === 'credits' || kind === 'server' || (kind === 'rate-limit' && isProviderWideLimit(id, body));
        const until = pause(s, wide ? id : `${id}/${model}`, kind, hint, now);
        attempts.push({ provider: id, model, outcome: kind, until });
        if (kind === 'model-missing' && s.models[id]) s.models[id]!.at = 0; // список устарел — обновим в следующий раз
        if (wide) stopped.add(id);
        return null;
      };

      for (const p of plan.first) {
        const r = await ask(p.provider, p.model);
        if (r) return finish(r);
      }
      const later = new Set(plan.last.map((p) => `${p.provider}:${p.model}`));
      for (const id of task.providers) {
        const def = providers[id];
        if (!def || !opts.keys[id] || stopped.has(id) || providerPaused(id)) continue;
        for (const model of await modelsOf(def, s, opts.now())) {
          if (later.has(`${id}:${model}`)) continue; // слабые — после всех остальных
          const r = await ask(id, model);
          if (r) return finish(r);
          if (stopped.has(id) || (used[id] ?? 0) >= perProvider) break;
        }
      }
      for (const p of plan.last) {
        const r = await ask(p.provider, p.model);
        if (r) return finish(r);
      }
      return finish(answered ? { status: 'unusable', attempts } : { status: 'unavailable', attempts });
    },
  };
}

function structuredCloneSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}
