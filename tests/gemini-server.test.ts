import test from 'node:test';
import assert from 'node:assert/strict';

import { generateGeminiContent, isRetryableGeminiStatus } from '@/lib/server/gemini';

test('retryable Gemini statuses are classified correctly', () => {
  assert.equal(isRetryableGeminiStatus(429), true);
  assert.equal(isRetryableGeminiStatus(503), true);
  assert.equal(isRetryableGeminiStatus(504), true);
  assert.equal(isRetryableGeminiStatus(400), false);
});

test('generateGeminiContent retries once on 503 and then succeeds', async () => {
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousRetries = process.env.GEMINI_MAX_RETRIES;
  const originalFetch = globalThis.fetch;

  process.env.GEMINI_API_KEY = 'test-key';
  process.env.GEMINI_MAX_RETRIES = '1';

  let attempts = 0;
  globalThis.fetch = (async () => {
    attempts += 1;
    if (attempts === 1) {
      return new Response(
        JSON.stringify({
          error: {
            code: 503,
            message: 'temporary overload',
            status: 'UNAVAILABLE',
          },
        }),
        {
          status: 503,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': '0',
          },
        }
      );
    }

    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ text: 'ok' }],
            },
          },
        ],
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }) as typeof fetch;

  try {
    const result = await generateGeminiContent({
      contents: [
        {
          role: 'user',
          parts: [{ text: 'hello' }],
        },
      ],
    });

    assert.equal(result, 'ok');
    assert.equal(attempts, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousApiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = previousApiKey;
    }

    if (previousRetries === undefined) {
      delete process.env.GEMINI_MAX_RETRIES;
    } else {
      process.env.GEMINI_MAX_RETRIES = previousRetries;
    }
  }
});

test('generateGeminiContent times out and fails after configured retries', async () => {
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousRetries = process.env.GEMINI_MAX_RETRIES;
  const previousTimeout = process.env.GEMINI_TIMEOUT_MS;
  const originalFetch = globalThis.fetch;

  process.env.GEMINI_API_KEY = 'test-key';
  process.env.GEMINI_MAX_RETRIES = '0';
  process.env.GEMINI_TIMEOUT_MS = '1';

  globalThis.fetch = (async () => {
    const error = new Error('aborted');
    error.name = 'AbortError';
    throw error;
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => generateGeminiContent({
        contents: [
          {
            role: 'user',
            parts: [{ text: 'hello' }],
          },
        ],
      }),
      /timed out/i
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (previousApiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = previousApiKey;
    }

    if (previousRetries === undefined) {
      delete process.env.GEMINI_MAX_RETRIES;
    } else {
      process.env.GEMINI_MAX_RETRIES = previousRetries;
    }

    if (previousTimeout === undefined) {
      delete process.env.GEMINI_TIMEOUT_MS;
    } else {
      process.env.GEMINI_TIMEOUT_MS = previousTimeout;
    }
  }
});
