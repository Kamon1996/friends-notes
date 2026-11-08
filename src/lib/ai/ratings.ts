import type { Ratings } from './tiers';

/**
 * Оценки моделей из испытания (src/lib/ai/bench.ts). Файл обновляет workflow «AI bench» после каждого прогона
 * (scripts/ai-bench) — руками не править. По оценкам строится тир-лист (tiers.ts), по нему приложение выбирает модели.
 */
export const RATINGS: Ratings = {
  "gender": {
    "benchCases": 100,
    "updatedAt": "2026-11-08",
    "models": {
      "gemini:gemini-flash-lite-latest": {
        "correct": 77,
        "correctUnknown": 23,
        "missed": 0,
        "wrong": 0,
        "guessed": 0,
        "omitted": 0,
        "harmful": 0,
        "score": 100,
        "provider": "gemini",
        "model": "gemini-flash-lite-latest",
        "testedAt": "2026-11-08",
        "cases": 100,
        "medianMs": 2293,
        "parsedShare": 1,
        "status": "ok",
        "history": [
          {
            "testedAt": "2026-11-08",
            "score": 100,
            "harmful": 0,
            "medianMs": 2293
          }
        ]
      },
      "gemini:gemini-3.5-flash-lite": {
        "correct": 76,
        "correctUnknown": 23,
        "missed": 1,
        "wrong": 0,
        "guessed": 0,
        "omitted": 0,
        "harmful": 0,
        "score": 99,
        "provider": "gemini",
        "model": "gemini-3.5-flash-lite",
        "testedAt": "2026-11-08",
        "cases": 100,
        "medianMs": 2004,
        "parsedShare": 1,
        "status": "ok",
        "history": [
          {
            "testedAt": "2026-11-08",
            "score": 99,
            "harmful": 0,
            "medianMs": 2004
          }
        ]
      },
      "gemini:gemini-3.6-flash": {
        "correct": 77,
        "correctUnknown": 21,
        "missed": 0,
        "wrong": 0,
        "guessed": 2,
        "omitted": 0,
        "harmful": 2,
        "score": 92,
        "provider": "gemini",
        "model": "gemini-3.6-flash",
        "testedAt": "2026-11-08",
        "cases": 100,
        "medianMs": 15441,
        "parsedShare": 1,
        "status": "ok",
        "history": [
          {
            "testedAt": "2026-11-08",
            "score": 92,
            "harmful": 2,
            "medianMs": 15441
          }
        ]
      },
      "gemini:gemini-3.5-flash": {
        "correct": 77,
        "correctUnknown": 21,
        "missed": 0,
        "wrong": 0,
        "guessed": 2,
        "omitted": 0,
        "harmful": 2,
        "score": 92,
        "provider": "gemini",
        "model": "gemini-3.5-flash",
        "testedAt": "2026-11-08",
        "cases": 100,
        "medianMs": 21162,
        "parsedShare": 1,
        "status": "ok",
        "history": [
          {
            "testedAt": "2026-11-08",
            "score": 92,
            "harmful": 2,
            "medianMs": 21162
          }
        ]
      },
      "gemini:gemini-3.1-flash-lite-preview": {
        "correct": 75,
        "correctUnknown": 19,
        "missed": 2,
        "wrong": 0,
        "guessed": 4,
        "omitted": 0,
        "harmful": 4,
        "score": 82,
        "provider": "gemini",
        "model": "gemini-3.1-flash-lite-preview",
        "testedAt": "2026-11-08",
        "cases": 100,
        "medianMs": 1699,
        "parsedShare": 1,
        "status": "ok",
        "history": [
          {
            "testedAt": "2026-11-08",
            "score": 82,
            "harmful": 4,
            "medianMs": 1699
          }
        ]
      },
      "gemini:gemini-3.1-flash-lite": {
        "correct": 75,
        "correctUnknown": 19,
        "missed": 2,
        "wrong": 0,
        "guessed": 4,
        "omitted": 0,
        "harmful": 4,
        "score": 82,
        "provider": "gemini",
        "model": "gemini-3.1-flash-lite",
        "testedAt": "2026-11-08",
        "cases": 100,
        "medianMs": 1947,
        "parsedShare": 1,
        "status": "ok",
        "history": [
          {
            "testedAt": "2026-11-08",
            "score": 82,
            "harmful": 4,
            "medianMs": 1947
          }
        ]
      },
      "openrouter:nvidia/nemotron-3-ultra-550b-a55b:free": {
        "correct": 77,
        "correctUnknown": 21,
        "missed": 0,
        "wrong": 0,
        "guessed": 2,
        "omitted": 0,
        "harmful": 2,
        "score": 92,
        "provider": "openrouter",
        "model": "nvidia/nemotron-3-ultra-550b-a55b:free",
        "testedAt": "2026-11-08",
        "cases": 100,
        "medianMs": 92522,
        "parsedShare": 1,
        "status": "ok",
        "history": [
          {
            "testedAt": "2026-11-08",
            "score": 50,
            "harmful": 0,
            "medianMs": 23701
          },
          {
            "testedAt": "2026-11-08",
            "score": 92,
            "harmful": 2,
            "medianMs": 92522
          }
        ]
      },
      "openrouter:cohere/north-mini-code:free": {
        "correct": 77,
        "correctUnknown": 14,
        "missed": 0,
        "wrong": 0,
        "guessed": 9,
        "omitted": 0,
        "harmful": 9,
        "score": 64,
        "provider": "openrouter",
        "model": "cohere/north-mini-code:free",
        "testedAt": "2026-11-08",
        "cases": 100,
        "medianMs": 24043,
        "parsedShare": 1,
        "status": "ok",
        "history": [
          {
            "testedAt": "2026-11-08",
            "score": 48,
            "harmful": 13,
            "medianMs": 8308
          },
          {
            "testedAt": "2026-11-08",
            "score": 64,
            "harmful": 9,
            "medianMs": 24043
          }
        ]
      },
      "gemini:gemma-4-31b-it": {
        "correct": 45,
        "correctUnknown": 4,
        "missed": 0,
        "wrong": 0,
        "guessed": 1,
        "omitted": 50,
        "harmful": 1,
        "score": 46,
        "provider": "gemini",
        "model": "gemma-4-31b-it",
        "testedAt": "2026-11-08",
        "cases": 100,
        "medianMs": 84642,
        "parsedShare": 0.5,
        "status": "ok",
        "history": [
          {
            "testedAt": "2026-11-08",
            "score": 46,
            "harmful": 1,
            "medianMs": 84642
          }
        ]
      },
      "gemini:gemini-3-flash-preview": {
        "correct": 32,
        "correctUnknown": 16,
        "missed": 0,
        "wrong": 0,
        "guessed": 2,
        "omitted": 50,
        "harmful": 2,
        "score": 42,
        "provider": "gemini",
        "model": "gemini-3-flash-preview",
        "testedAt": "2026-11-08",
        "cases": 100,
        "medianMs": 10521,
        "parsedShare": 0.5,
        "status": "ok",
        "history": [
          {
            "testedAt": "2026-11-08",
            "score": 42,
            "harmful": 2,
            "medianMs": 10521
          }
        ]
      },
      "openrouter:dots-studio/dots-3-note-preview:free": {
        "correct": 76,
        "correctUnknown": 10,
        "missed": 0,
        "wrong": 1,
        "guessed": 13,
        "omitted": 0,
        "harmful": 14,
        "score": 44,
        "provider": "openrouter",
        "model": "dots-studio/dots-3-note-preview:free",
        "testedAt": "2026-11-08",
        "cases": 100,
        "medianMs": 24994,
        "parsedShare": 1,
        "status": "ok",
        "history": [
          {
            "testedAt": "2026-11-08",
            "score": 18,
            "harmful": 8,
            "medianMs": 18265
          },
          {
            "testedAt": "2026-11-08",
            "score": 44,
            "harmful": 14,
            "medianMs": 24994
          }
        ]
      },
      "openrouter:liquid/lfm-2.5-2.6b:free": {
        "correct": 40,
        "correctUnknown": 2,
        "missed": 0,
        "wrong": 5,
        "guessed": 3,
        "omitted": 50,
        "harmful": 8,
        "score": 18,
        "provider": "openrouter",
        "model": "liquid/lfm-2.5-2.6b:free",
        "testedAt": "2026-11-08",
        "cases": 100,
        "medianMs": 20280,
        "parsedShare": 0.5,
        "status": "ok",
        "history": [
          {
            "testedAt": "2026-11-08",
            "score": 0,
            "harmful": 0,
            "medianMs": 4931
          },
          {
            "testedAt": "2026-11-08",
            "score": 18,
            "harmful": 8,
            "medianMs": 20280
          }
        ]
      },
      "openrouter:liquid/lfm-3-1.7b:free": {
        "correct": 0,
        "correctUnknown": 0,
        "missed": 0,
        "wrong": 0,
        "guessed": 0,
        "omitted": 100,
        "harmful": 0,
        "score": 0,
        "provider": "openrouter",
        "model": "liquid/lfm-3-1.7b:free",
        "testedAt": "2026-11-08",
        "cases": 100,
        "medianMs": 31277,
        "parsedShare": 0,
        "status": "ok",
        "history": [
          {
            "testedAt": "2026-11-08",
            "score": 0,
            "harmful": 0,
            "medianMs": 9617
          },
          {
            "testedAt": "2026-11-08",
            "score": 0,
            "harmful": 0,
            "medianMs": 31277
          }
        ]
      },
      "openrouter:recursive/flint-v1.0:free": {
        "correct": 0,
        "correctUnknown": 0,
        "missed": 0,
        "wrong": 0,
        "guessed": 0,
        "omitted": 100,
        "harmful": 0,
        "score": 0,
        "provider": "openrouter",
        "model": "recursive/flint-v1.0:free",
        "testedAt": "2026-11-08",
        "cases": 100,
        "medianMs": 34758,
        "parsedShare": 0,
        "status": "ok",
        "history": [
          {
            "testedAt": "2026-11-08",
            "score": 0,
            "harmful": 0,
            "medianMs": 10384
          },
          {
            "testedAt": "2026-11-08",
            "score": 0,
            "harmful": 0,
            "medianMs": 34758
          }
        ]
      },
      "openrouter:nvidia/nemotron-3.5-super-vl:free": {
        "correct": 76,
        "correctUnknown": 22,
        "missed": 0,
        "wrong": 1,
        "guessed": 1,
        "omitted": 0,
        "harmful": 2,
        "score": 92,
        "provider": "openrouter",
        "model": "nvidia/nemotron-3.5-super-vl:free",
        "testedAt": "2026-11-08",
        "cases": 100,
        "medianMs": 22823,
        "parsedShare": 1,
        "status": "ok",
        "history": [
          {
            "testedAt": "2026-11-08",
            "score": 0,
            "harmful": 0,
            "medianMs": 10850
          },
          {
            "testedAt": "2026-11-08",
            "score": 92,
            "harmful": 2,
            "medianMs": 22823
          }
        ]
      },
      "openrouter:nvidia/nemotron-3.5-lightning:free": {
        "correct": 0,
        "correctUnknown": 0,
        "missed": 0,
        "wrong": 0,
        "guessed": 0,
        "omitted": 100,
        "harmful": 0,
        "score": 0,
        "provider": "openrouter",
        "model": "nvidia/nemotron-3.5-lightning:free",
        "testedAt": "2026-11-08",
        "cases": 100,
        "medianMs": 56148,
        "parsedShare": 0,
        "status": "ok",
        "history": [
          {
            "testedAt": "2026-11-08",
            "score": 0,
            "harmful": 0,
            "medianMs": 15189
          },
          {
            "testedAt": "2026-11-08",
            "score": 0,
            "harmful": 0,
            "medianMs": 56148
          }
        ]
      },
      "openrouter:nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free": {
        "correct": 32,
        "correctUnknown": 5,
        "missed": 0,
        "wrong": 0,
        "guessed": 13,
        "omitted": 50,
        "harmful": 13,
        "score": -2,
        "provider": "openrouter",
        "model": "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
        "testedAt": "2026-11-08",
        "cases": 100,
        "medianMs": 48598,
        "parsedShare": 0.5,
        "status": "ok",
        "history": [
          {
            "testedAt": "2026-11-08",
            "score": 0,
            "harmful": 0,
            "medianMs": 18707
          },
          {
            "testedAt": "2026-11-08",
            "score": -2,
            "harmful": 13,
            "medianMs": 48598
          }
        ]
      },
      "openrouter:xingchen-agi/xing4.0-29b-a4b:free": {
        "correct": 67,
        "correctUnknown": 17,
        "missed": 8,
        "wrong": 2,
        "guessed": 6,
        "omitted": 0,
        "harmful": 8,
        "score": 60,
        "provider": "openrouter",
        "model": "xingchen-agi/xing4.0-29b-a4b:free",
        "testedAt": "2026-11-08",
        "cases": 100,
        "medianMs": 48146,
        "parsedShare": 1,
        "status": "ok",
        "history": [
          {
            "testedAt": "2026-11-08",
            "score": 0,
            "harmful": 0,
            "medianMs": 42250
          },
          {
            "testedAt": "2026-11-08",
            "score": 60,
            "harmful": 8,
            "medianMs": 48146
          }
        ]
      },
      "gemini:gemini-2.5-flash": {
        "correct": 0,
        "correctUnknown": 0,
        "missed": 0,
        "wrong": 0,
        "guessed": 0,
        "omitted": 100,
        "harmful": 0,
        "score": 0,
        "provider": "gemini",
        "model": "gemini-2.5-flash",
        "testedAt": "2026-11-08",
        "cases": 100,
        "medianMs": null,
        "parsedShare": 0,
        "status": "unavailable",
        "note": "404 NOT_FOUND This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.8-flash for the latest features and improvements. We recommend you ",
        "history": [
          {
            "testedAt": "2026-11-08",
            "score": 0,
            "harmful": 0,
            "medianMs": null
          }
        ]
      },
      "gemini:gemini-2.5-pro": {
        "correct": 0,
        "correctUnknown": 0,
        "missed": 0,
        "wrong": 0,
        "guessed": 0,
        "omitted": 100,
        "harmful": 0,
        "score": 0,
        "provider": "gemini",
        "model": "gemini-2.5-pro",
        "testedAt": "2026-11-08",
        "cases": 100,
        "medianMs": null,
        "parsedShare": 0,
        "status": "unavailable",
        "note": "404 NOT_FOUND This model models/gemini-2.5-pro is no longer available to new users. Please update your code to use models/gemini-3.1-pro-preview for the latest features and improvements. We recommend ",
        "history": [
          {
            "testedAt": "2026-11-08",
            "score": 0,
            "harmful": 0,
            "medianMs": null
          }
        ]
      },
      "gemini:gemma-4-26b-a4b-it": {
        "correct": 0,
        "correctUnknown": 0,
        "missed": 0,
        "wrong": 0,
        "guessed": 0,
        "omitted": 100,
        "harmful": 0,
        "score": 0,
        "provider": "gemini",
        "model": "gemma-4-26b-a4b-it",
        "testedAt": "2026-11-08",
        "cases": 100,
        "medianMs": null,
        "parsedShare": 0,
        "status": "ok",
        "history": [
          {
            "testedAt": "2026-11-08",
            "score": 0,
            "harmful": 0,
            "medianMs": null
          }
        ]
      },
      "gemini:gemini-2.5-flash-lite": {
        "correct": 0,
        "correctUnknown": 0,
        "missed": 0,
        "wrong": 0,
        "guessed": 0,
        "omitted": 100,
        "harmful": 0,
        "score": 0,
        "provider": "gemini",
        "model": "gemini-2.5-flash-lite",
        "testedAt": "2026-11-08",
        "cases": 100,
        "medianMs": null,
        "parsedShare": 0,
        "status": "unavailable",
        "note": "404 NOT_FOUND This model models/gemini-2.5-flash-lite is no longer available to new users. Please update your code to use models/gemini-3.5-flash-lite for the latest features and improvements. We reco",
        "history": [
          {
            "testedAt": "2026-11-08",
            "score": 0,
            "harmful": 0,
            "medianMs": null
          }
        ]
      },
      "gemini:gemini-3.7-flash": {
        "correct": 0,
        "correctUnknown": 0,
        "missed": 0,
        "wrong": 0,
        "guessed": 0,
        "omitted": 100,
        "harmful": 0,
        "score": 0,
        "provider": "gemini",
        "model": "gemini-3.7-flash",
        "testedAt": "2026-11-08",
        "cases": 100,
        "medianMs": null,
        "parsedShare": 0,
        "status": "ok",
        "history": [
          {
            "testedAt": "2026-11-08",
            "score": 0,
            "harmful": 0,
            "medianMs": null
          }
        ]
      }
    }
  }
};
