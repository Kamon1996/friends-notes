import { pauseUntil, retryHint } from './limits';
import { PROVIDERS, classify, isProviderWideLimit, type ProviderDef } from './providers';
import type { AiAttempt, AiFetch, AiResult, AiRunner, AiTask, FailureKind, ProviderId } from './types';

/**
 * Основа для любых ИИ-задач приложения:
 * - сервисы спрашиваются в порядке приоритета задачи; нет ключа — сервис пропускается;
 * - у сервиса несколько моделей: модель убрали или упёрлась в свой лимит — пробуем следующую;
 * - не ответил (лимит, сбой, отказ) — идём к следующему сервису, а этот ставим на паузу: до времени, которое он
 *   назвал сам, иначе — по умолчанию, с каждой неудачей подряд дольше (limits.ts). До конца паузы его не трогаем;
 * - ответил — неудачи забываются;
 * - паузы и список бесплатных моделей сохраняются между запусками (load/save).
 */

/** Пауза: сервис («groq») целиком или одна его модель («groq/llama-3.3-70b-versatile»). */
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

      for (const id of task.providers) {
        const def = providers[id];
        const key = opts.keys[id];
        if (!def || !key) continue;
        let now = opts.now();
        if (pausedNow(s, id, now)) {
          attempts.push({ provider: id, outcome: 'paused', until: s.pauses[id].until });
          continue;
        }
        const models = (await modelsOf(def, s, now)).filter((m) => !pausedNow(s, `${id}/${m}`, now)).slice(0, perProvider);
        if (!models.length) attempts.push({ provider: id, outcome: 'paused' });

        for (const model of models) {
          const req = def.request(model, key, task.request(input));
          now = opts.now();
          let res;
          try {
            res = await send(req.url, req.init);
          } catch {
            attempts.push({ provider: id, model, outcome: 'network' });
            break; // нет сети или сервис недоступен отсюда — пауза не нужна, идём к следующему
          }
          if (res === TIMEOUT) {
            const until = pause(s, id, 'timeout', undefined, now);
            attempts.push({ provider: id, model, outcome: 'timeout', until });
            break;
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
              return finish({ status: 'ok', value, provider: id, model, attempts });
            }
            answered = true;
            attempts.push({ provider: id, model, outcome: 'unusable' });
            continue; // другая модель может ответить по делу
          }

          const hint = retryHint({ status: res.status, headers: res.headers, body }, now);
          const wide =
            kind === 'auth' || kind === 'region' || kind === 'credits' || kind === 'server' || (kind === 'rate-limit' && isProviderWideLimit(id, body));
          const until = pause(s, wide ? id : `${id}/${model}`, kind, hint, now);
          attempts.push({ provider: id, model, outcome: kind, until });
          if (kind === 'model-missing' && s.models[id]) s.models[id]!.at = 0; // список устарел — обновим в следующий раз
          if (wide) break;
        }
      }
      return finish(answered ? { status: 'unusable', attempts } : { status: 'unavailable', attempts });
    },
  };
}

function structuredCloneSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}
