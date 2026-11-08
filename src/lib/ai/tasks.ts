import type { ProviderId } from './types';

/**
 * Кто лучше справляется с какой задачей — первым. Добавляя новую ИИ-задачу, впиши её сюда.
 *
 * gender — пол по имени (русские, казахские, татарские, кавказские имена и уменьшительные):
 *   Gemini лучше всех знает редкие и неславянские имена; Groq (Llama 3.3 70B) — быстрый и с щедрыми лимитами;
 *   OpenRouter — бесплатные модели разных компаний, но 50 запросов в день; Hugging Face — копеечные месячные
 *   кредиты, поэтому последним.
 */
export const TASK_PROVIDERS = {
  gender: ['gemini', 'groq', 'openrouter', 'huggingface'],
} satisfies Record<string, ProviderId[]>;
