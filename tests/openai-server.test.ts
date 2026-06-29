import test from 'node:test';
import assert from 'node:assert/strict';

import { generateOpenAIResponse, isRetryableOpenAIStatus } from '@/lib/server/openai';

test('retryable OpenAI statuses are classified correctly', () => {
  assert.equal(isRetryableOpenAIStatus(429), true);
  assert.equal(isRetryableOpenAIStatus(503), true);
  assert.equal(isRetryableOpenAIStatus(504), true);
  assert.equal(isRetryableOpenAIStatus(400), false);
});

test('generateOpenAIResponse retries once on 503 and then succeeds', async () => {
  const previousApiKey = process.env.OPENAI_API_KEY;
  const previousRetries = process.env.OPENAI_MAX_RETRIES;
  const originalFetch = globalThis.fetch;

  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_MAX_RETRIES = '1';

  let attempts = 0;
  globalThis.fetch = (async () => {
    attempts += 1;
    if (attempts === 1) {
      return new Response(
        JSON.stringify({
          error: {
            message: 'temporary overload',
            type: 'server_error',
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
        output_text: 'ok',
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
    const result = await generateOpenAIResponse({
      input: [
        {
          role: 'user',
          content: [{ type: 'input_text', text: 'hello' }],
        },
      ],
    });

    assert.equal(result, 'ok');
    assert.equal(attempts, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = previousApiKey;
    }

    if (previousRetries === undefined) {
      delete process.env.OPENAI_MAX_RETRIES;
    } else {
      process.env.OPENAI_MAX_RETRIES = previousRetries;
    }
  }
});
