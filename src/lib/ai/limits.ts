import type { FailureKind } from './types';

/**
 * Когда сервис снова можно трогать. Сервисы сами говорят, когда обновится лимит, — каждый по-своему:
 * - заголовок Retry-After (секунды или дата) и retry-after-ms — Groq, OpenAI-совместимые;
 * - X-RateLimit-Reset (момент времени в мс или с) — OpenRouter, иногда внутри error.metadata.headers;
 * - x-ratelimit-reset-requests / -tokens («2m59.56s») — Groq;
 * - error.details[RetryInfo].retryDelay («33s») и квота «PerDay» — Gemini (дневная квота обновляется в полночь
 *   по тихоокеанскому времени).
 * Если сервис ничего не сказал — пауза по умолчанию, с каждой неудачей подряд длиннее.
 */

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Пауза не короче этого (чтобы не долбить сервис в том же запуске) и не длиннее месяца (защита от странных ответов). */
export const PAUSE_MIN = 30 * SECOND;
export const PAUSE_MAX = 31 * DAY;

/** «2m59.56s», «7.66s», «500ms», «1h2m», «33s» → мс. */
export function parseDuration(text: string | null | undefined): number | undefined {
  if (!text) return undefined;
  const s = text.trim();
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s) * SECOND;
  const re = /(\d+(?:\.\d+)?)(ms|h|m|s)/g;
  let total = 0;
  let matched = '';
  for (let m = re.exec(s); m; m = re.exec(s)) {
    const n = parseFloat(m[1]);
    total += m[2] === 'ms' ? n : m[2] === 's' ? n * SECOND : m[2] === 'm' ? n * MINUTE : n * HOUR;
    matched += m[0];
  }
  return matched && matched === s.replace(/\s+/g, '') ? total : undefined;
}

/** Момент времени из «X-RateLimit-Reset»: мс или секунды с 1970-го. */
function epoch(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' && /^\d+(\.\d+)?$/.test(value.trim()) ? parseFloat(value) : NaN;
  if (!Number.isFinite(n)) return undefined;
  if (n > 1e12) return n;
  if (n > 1e9) return n * SECOND;
  return undefined;
}

/** Следующая полночь по тихоокеанскому времени — с запасом берём зимнее время (UTC−8): летом это на час позже сброса. */
export function nextPacificMidnight(now: number): number {
  const d = new Date(now);
  const today = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 8);
  return today > now ? today : today + DAY;
}

/** Первое число следующего месяца, 00:00 UTC — когда обновляются месячные кредиты. */
export function nextMonthStart(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}

interface HintSource {
  status: number;
  headers: { get(name: string): string | null };
  body: unknown;
}

/** Когда сервис просит прийти снова (абсолютное время, мс) — или undefined, если не сказал. */
export function retryHint({ status, headers, body }: HintSource, now: number): number | undefined {
  const found: number[] = [];
  const add = (t: number | undefined) => {
    if (t !== undefined && Number.isFinite(t) && t > now) found.push(t);
  };

  const ms = headers.get('retry-after-ms');
  if (ms && /^\d+(\.\d+)?$/.test(ms.trim())) add(now + parseFloat(ms));
  const after = headers.get('retry-after');
  if (after) {
    if (/^\d+(\.\d+)?$/.test(after.trim())) add(now + parseFloat(after) * SECOND);
    else add(Date.parse(after));
  }
  add(epoch(headers.get('x-ratelimit-reset')));

  const error = (body as { error?: Record<string, unknown> } | null)?.error;
  const meta = (error?.metadata as { headers?: Record<string, unknown> } | undefined)?.headers;
  if (meta) add(epoch(meta['X-RateLimit-Reset'] ?? meta['x-ratelimit-reset']));

  // Gemini: RetryInfo и квоты.
  const details = Array.isArray(error?.details) ? (error.details as Record<string, unknown>[]) : [];
  for (const d of details) {
    const type = String(d?.['@type'] ?? '');
    if (type.endsWith('RetryInfo')) {
      const delay = parseDuration(String(d.retryDelay ?? ''));
      if (delay !== undefined) add(now + delay);
    }
    if (type.endsWith('QuotaFailure') && Array.isArray(d.violations)) {
      const daily = (d.violations as Record<string, unknown>[]).some((v) => /PerDay/i.test(String(v?.quotaId ?? '') + String(v?.quotaMetric ?? '')));
      if (daily) add(nextPacificMidnight(now));
    }
  }

  // Groq: когда обновятся счётчики запросов и токенов — только если лимит уже упёрся.
  if (status === 429 && !found.length) {
    for (const h of ['x-ratelimit-reset-requests', 'x-ratelimit-reset-tokens']) {
      const d = parseDuration(headers.get(h));
      if (d !== undefined) add(now + d);
    }
  }

  if (!found.length) return undefined;
  return Math.min(Math.max(...found), now + PAUSE_MAX);
}

/** Пауза, если сервис не сказал, когда приходить: strikes — сколько неудач подряд уже было. */
export function defaultPause(kind: FailureKind, strikes: number): number {
  const grow = (base: number, cap: number) => Math.min(base * 2 ** Math.min(strikes, 10), cap);
  switch (kind) {
    case 'rate-limit':
      return grow(15 * MINUTE, DAY);
    case 'server':
    case 'timeout':
      return grow(5 * MINUTE, 6 * HOUR);
    case 'credits':
    case 'auth':
    case 'region':
    case 'model-missing':
      return 7 * DAY;
    case 'bad-request':
      return DAY;
    default:
      return 0;
  }
}

/** Итоговое время, до которого не трогаем: подсказка сервиса или пауза по умолчанию, в разумных пределах. */
export function pauseUntil(kind: FailureKind, hint: number | undefined, strikes: number, now: number): number {
  const wanted = hint ?? now + defaultPause(kind, strikes);
  return Math.min(Math.max(wanted, now + PAUSE_MIN), now + PAUSE_MAX);
}
