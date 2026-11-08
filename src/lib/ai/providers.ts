import type { AiRequest, FailureKind, ProviderId } from './types';

/**
 * Как разговаривать с каждым сервисом: адрес, ключ, тело запроса, где в ответе текст и что значит ошибка.
 * Gemini — свой формат; Groq, OpenRouter и Hugging Face — OpenAI-совместимый.
 * Ключ всегда в заголовке, не в адресе (адреса попадают в логи).
 */
export interface ProviderDef {
  id: ProviderId;
  label: string;
  /** Модели по порядку: первая — основная, остальные — если её убрали или она упёрлась в лимит. */
  models: string[];
  /** Лимит запросов общий на весь сервис или у каждой модели свой. */
  rateLimitScope: 'model' | 'provider';
  request(model: string, key: string, req: AiRequest): { url: string; init: { method: string; headers: Record<string, string>; body: string } };
  /** Текст ответа модели или null, если его нет (пустой ответ, заблокирован фильтром). */
  text(body: unknown): string | null;
  /** Свежий список моделей (например, бесплатных у OpenRouter): адрес без ключа и как выбрать подходящие. */
  discover?: { url: string; pick(body: unknown): string[] };
}

type Json = Record<string, unknown>;
const asObj = (v: unknown): Json | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null);

// ---------- Gemini ----------

const gemini: ProviderDef = {
  id: 'gemini',
  label: 'Google Gemini',
  // Псевдонимы «-latest» Google сам переводит на свежие модели; конкретные — на случай, если псевдоним уберут.
  models: ['gemini-flash-lite-latest', 'gemini-3.5-flash-lite', 'gemini-flash-latest', 'gemini-2.5-flash-lite'],
  rateLimitScope: 'model',
  request(model, key, req) {
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          ...(req.system && { systemInstruction: { parts: [{ text: req.system }] } }),
          contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
          generationConfig: {
            temperature: req.temperature ?? 0,
            // У Gemma через Gemini API нет режима JSON — формат задан в самой просьбе.
            ...(req.json && !/gemma/i.test(model) && { responseMimeType: 'application/json' }),
          },
        }),
      },
    };
  },
  text(body) {
    const parts = (body as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] })?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return null;
    const text = parts
      .filter((p) => p && !p.thought && typeof p.text === 'string')
      .map((p) => p.text)
      .join('');
    return text.trim() ? text : null;
  },
};

// ---------- OpenAI-совместимые ----------

function openAiCompatible(base: Omit<ProviderDef, 'request' | 'text'> & { url: string; headers?: Record<string, string> }): ProviderDef {
  const { url, headers, ...rest } = base;
  return {
    ...rest,
    request(model, key, req) {
      return {
        url,
        init: {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, ...headers },
          body: JSON.stringify({
            model,
            messages: [...(req.system ? [{ role: 'system', content: req.system }] : []), { role: 'user', content: req.prompt }],
            temperature: req.temperature ?? 0,
            ...(req.maxTokens && { max_tokens: req.maxTokens }),
            // response_format не отправляем: не все модели его принимают, а формат и так задан в просьбе.
          }),
        },
      };
    },
    text(body) {
      const content = (body as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message?.content;
      const text = typeof content === 'string' ? content : Array.isArray(content) ? content.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('') : '';
      return text.trim() ? text : null;
    },
  };
}

const groq = openAiCompatible({
  id: 'groq',
  label: 'Groq',
  url: 'https://api.groq.com/openai/v1/chat/completions',
  models: ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'moonshotai/kimi-k2-instruct-0905', 'llama-3.1-8b-instant'],
  rateLimitScope: 'model',
});

/** Бесплатные модели OpenRouter меняются часто — список берём у самого сервиса, эти — порядок предпочтения. */
const OPENROUTER_PREFERRED = [/llama-3\.3-70b/, /gemma-3-27b/, /deepseek-(chat|v3)/, /qwen3/, /mistral-small/, /llama-4/, /gpt-oss/];

/** Из списка моделей OpenRouter — бесплатные текстовые, сначала предпочтительные (для приложения — первые 8). */
export function pickOpenRouterFree(body: unknown): string[] {
  return listOpenRouterFree(body).slice(0, 8);
}

/** Все бесплатные текстовые модели OpenRouter, сначала предпочтительные. */
export function listOpenRouterFree(body: unknown): string[] {
  const data = asObj(body)?.data;
  if (!Array.isArray(data)) return [];
  const free = (data as Json[]).filter((m) => {
    const id = m?.id;
    const arch = asObj(m?.architecture);
    const inputs = arch?.input_modalities;
    const outputs = arch?.output_modalities;
    return (
      typeof id === 'string' &&
      id.endsWith(':free') &&
      (!Array.isArray(inputs) || inputs.includes('text')) &&
      (!Array.isArray(outputs) || (outputs.length === 1 && outputs[0] === 'text'))
    );
  });
  const rank = (id: string) => {
    const i = OPENROUTER_PREFERRED.findIndex((re) => re.test(id));
    return i < 0 ? OPENROUTER_PREFERRED.length : i;
  };
  return free
    .map((m, i) => ({ id: m.id as string, i }))
    .sort((a, b) => rank(a.id) - rank(b.id) || a.i - b.i)
    .map((m) => m.id);
}

const openrouter = openAiCompatible({
  id: 'openrouter',
  label: 'OpenRouter',
  url: 'https://openrouter.ai/api/v1/chat/completions',
  headers: { 'HTTP-Referer': 'https://github.com/Kamon1996/friends-notes', 'X-OpenRouter-Title': 'Friends Notes', 'X-Title': 'Friends Notes' },
  models: ['meta-llama/llama-3.3-70b-instruct:free', 'google/gemma-3-27b-it:free', 'deepseek/deepseek-chat-v3-0324:free', 'mistralai/mistral-small-3.2-24b-instruct:free'],
  // Дневной лимит бесплатных запросов общий на аккаунт; поминутный — у модели. Какой сработал — видно по тексту ошибки.
  rateLimitScope: 'model',
  discover: { url: 'https://openrouter.ai/api/v1/models', pick: pickOpenRouterFree },
});

const huggingface = openAiCompatible({
  id: 'huggingface',
  label: 'Hugging Face',
  url: 'https://router.huggingface.co/v1/chat/completions',
  models: ['meta-llama/Llama-3.3-70B-Instruct', 'Qwen/Qwen2.5-72B-Instruct', 'meta-llama/Llama-3.1-8B-Instruct'],
  // Бесплатные кредиты — общие на аккаунт.
  rateLimitScope: 'provider',
});

export const PROVIDERS: Record<ProviderId, ProviderDef> = { gemini, groq, openrouter, huggingface };

// ---------- Ошибки ----------

/** Сообщение и код ошибки из тела ответа — у всех сервисов в поле error, но по-разному. */
export function errorInfo(body: unknown): { message: string; code: string } {
  const error = asObj(body)?.error;
  if (typeof error === 'string') return { message: error, code: '' };
  const e = asObj(error);
  if (!e) return { message: '', code: '' };
  const raw = asObj(asObj(e.metadata)?.raw) ?? null;
  return {
    message: [e.message, raw?.message].filter((x) => typeof x === 'string').join(' '),
    code: [e.code, e.status, e.type].filter((x) => typeof x === 'string' || typeof x === 'number').join(' '),
  };
}

/** Что случилось: null — всё хорошо. */
export function classify(provider: ProviderId, status: number, body: unknown): FailureKind | null {
  const { message, code } = errorInfo(body);
  const text = `${code} ${message}`;
  const failed = status >= 400 || !!asObj(body)?.error;
  if (!failed) return null;
  if (status === 429 || /RESOURCE_EXHAUSTED|rate.?limit/i.test(text)) return 'rate-limit';
  if (/location is not supported|FAILED_PRECONDITION|unsupported.?(country|region)|not available in your (country|region)/i.test(text)) return 'region';
  if (status === 402 || /insufficient.?(credits|balance|quota)|exceeded your monthly included credits|payment required/i.test(text)) return 'credits';
  if (status === 401 || /API key not valid|invalid.?api.?key|API_KEY_INVALID|unauthori[sz]ed|invalid.?token/i.test(text)) return 'auth';
  if (status === 404 || /model_not_found|model_decommissioned|decommissioned|not a valid model|No endpoints found|model .{0,80}(does not exist|not found|not supported)/i.test(text)) {
    return 'model-missing';
  }
  if (status === 403) return provider === 'openrouter' ? 'bad-request' : 'auth'; // у OpenRouter 403 — отказ модерации конкретного запроса
  if (status === 408 || status === 498 || status >= 500) return 'server';
  if (status >= 400) return 'bad-request';
  return 'server';
}

/** Дневной лимит, общий на весь сервис (OpenRouter: «free-models-per-day»). */
export function isProviderWideLimit(provider: ProviderId, body: unknown): boolean {
  if (PROVIDERS[provider].rateLimitScope === 'provider') return true;
  const { message, code } = errorInfo(body);
  return provider === 'openrouter' && /per.?day|daily/i.test(`${code} ${message}`);
}

/** Убрать рассуждения моделей («<think>…</think>») и обёртку ```json, найти JSON в тексте. */
export function extractJson(text: string): unknown {
  const clean = text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```(?:json)?/gi, '')
    .trim();
  try {
    return JSON.parse(clean);
  } catch {
    // Модель добавила слова до или после — берём самый внешний объект или массив.
  }
  // Сначала — та скобка, что открывается раньше: это внешний объект или массив.
  const pairs = [
    ['{', '}'],
    ['[', ']'],
  ].sort((x, y) => (clean.indexOf(x[0]) + 1 || Infinity) - (clean.indexOf(y[0]) + 1 || Infinity));
  for (const [open, close] of pairs) {
    const a = clean.indexOf(open);
    const b = clean.lastIndexOf(close);
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(clean.slice(a, b + 1));
      } catch {
        // пробуем другой вид скобок
      }
    }
  }
  return undefined;
}
