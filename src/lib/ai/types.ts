/** Облачные ИИ-сервисы с бесплатными ключами. Порядок для каждой задачи — в tasks.ts. */
export type ProviderId = 'gemini' | 'groq' | 'openrouter' | 'huggingface';

export const PROVIDER_IDS: ProviderId[] = ['gemini', 'groq', 'openrouter', 'huggingface'];

/** Ответ сети — то немногое из fetch, что нужно модулю (так его легко подменить в тестах). */
export interface AiResponse {
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}

export type AiFetch = (
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<AiResponse>;

/** Что спросить у модели. */
export interface AiRequest {
  /** Правила для модели (system). */
  system?: string;
  prompt: string;
  /** Ждём JSON — где сервис умеет, попросим его явно. */
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Задача для ИИ: как спросить и как понять ответ. parse возвращает null, если ответ не годится (не тот формат),
 * — тогда модуль спросит следующую модель или сервис.
 */
export interface AiTask<I, O> {
  id: string;
  /** Сервисы в порядке приоритета: кто лучше справляется с этой задачей — первым. */
  providers: ProviderId[];
  request(input: I): AiRequest;
  parse(text: string, input: I): O | null;
}

/** Почему сервис или модель не ответили. */
export type FailureKind =
  | 'rate-limit' // лимит запросов
  | 'credits' // кончились бесплатные кредиты
  | 'auth' // ключ неверный или отозван
  | 'region' // сервис недоступен в стране
  | 'model-missing' // модель убрали или переименовали
  | 'bad-request' // сервис не принял запрос
  | 'server' // сбой у сервиса
  | 'timeout' // не ответил вовремя
  | 'network' // нет сети
  | 'unusable'; // ответил, но не по делу

export interface AiAttempt {
  provider: ProviderId;
  model?: string;
  outcome: 'ok' | 'paused' | FailureKind;
  /** До какого времени не трогаем (если поставили паузу). */
  until?: number;
}

export type AiResult<O> =
  | { status: 'ok'; value: O; provider: ProviderId; model: string; attempts: AiAttempt[] }
  /** Кто-то ответил, но никто — по делу. Повторять тот же вопрос смысла нет. */
  | { status: 'unusable'; attempts: AiAttempt[] }
  /** Никто не ответил: нет ключей, все на паузе, нет сети. Спросим позже. */
  | { status: 'unavailable'; attempts: AiAttempt[] };

export interface AiRunner {
  run<I, O>(task: AiTask<I, O>, input: I): Promise<AiResult<O>>;
}
