import test from 'node:test';
import assert from 'node:assert/strict';

import { generateLocalConceptDesign } from '@/lib/concept-fallback';
import type { AICodeGenerationPayload } from '@/types';

process.env.GEMINI_API_KEY = 'test-gemini-key';
process.env.ANTHROPIC_API_KEY = '';
process.env.GEMINI_MODEL = 'gemini-flash-latest';

const { POST: conceptPost } = await import('@/app/api/brain/concept/route');
const { POST: generateCodePost } = await import('@/app/api/generate-code/route');

function installGeminiMock(responses: string[]) {
  const originalFetch = globalThis.fetch;
  let index = 0;

  globalThis.fetch = async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    if (!url.includes('generativelanguage.googleapis.com')) {
      throw new Error(`Unexpected fetch during AI route test: ${url}`);
    }

    const body = JSON.stringify({
      candidates: [
        {
          content: {
            parts: [
              {
                text: responses[Math.min(index, responses.length - 1)] ?? '',
              },
            ],
          },
        },
      ],
    });
    index += 1;

    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  return () => {
    globalThis.fetch = originalFetch;
  };
}

test('AI concept route accepts fenced JSON from Gemini and keeps the remote draft', async () => {
  const draft = generateLocalConceptDesign('버튼을 누르면 LED를 켜는 회로', 'uno');
  const restoreFetch = installGeminiMock([`AI 초안입니다.\n\n\`\`\`json\n${JSON.stringify(draft, null, 2)}\n\`\`\``]);

  try {
    const response = await conceptPost(
      new Request('http://localhost/api/brain/concept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '10.0.0.11',
        },
        body: JSON.stringify({
          concept: '버튼을 누르면 LED를 켜는 회로',
          preferredBoardId: 'uno',
        }),
      })
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.board.id, draft.board.id);
    assert.deepEqual(payload.components, draft.components);
    assert.deepEqual(payload.connections, draft.connections);
    assert.equal(payload.code, draft.code);
    assert.equal(payload.meta?.provider, 'gemini');
    assert.equal(payload.meta?.label, 'Gemini 설계');
    assert.equal(payload.meta?.fallback ?? false, false);
  } finally {
    restoreFetch();
  }
});

test('AI concept route reports local provider metadata when no remote model is configured', async () => {
  const previousGeminiKey = process.env.GEMINI_API_KEY;
  const previousAnthropicKey = process.env.ANTHROPIC_API_KEY;
  process.env.GEMINI_API_KEY = '';
  process.env.ANTHROPIC_API_KEY = '';

  try {
    const response = await conceptPost(
      new Request('http://localhost/api/brain/concept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '10.0.0.21',
        },
        body: JSON.stringify({
          concept: 'DHT11 센서를 연결해서 온도와 습도를 읽고 싶어',
          preferredBoardId: 'uno',
        }),
      })
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.meta?.provider, 'local');
    assert.equal(payload.meta?.label, 'Local 설계');
    assert.equal(payload.meta?.fallback ?? false, false);
  } finally {
    process.env.GEMINI_API_KEY = previousGeminiKey;
    process.env.ANTHROPIC_API_KEY = previousAnthropicKey;
  }
});

test('AI code route keeps a valid Gemini sketch when review passes', async () => {
  const restoreFetch = installGeminiMock([
    [
      '#include <DHT.h>',
      '',
      '#define DHTPIN 2',
      '#define DHTTYPE DHT11',
      'DHT dht(DHTPIN, DHTTYPE);',
      '',
      'void setup() {',
      '  Serial.begin(9600);',
      '  dht.begin();',
      '}',
      '',
      'void loop() {',
      '  float humidity = dht.readHumidity();',
      '  float temperature = dht.readTemperature();',
      '  delay(1000);',
      '}',
    ].join('\n'),
  ]);

  const payload: AICodeGenerationPayload = {
    boardId: 'uno',
    boardName: 'Arduino UNO',
    chipset: 'ATmega328P',
    targetLanguage: 'C++',
    connectedComponents: [
      {
        templateId: 'tpl_dht11',
        componentName: '온습도 센서',
        pinConnections: {
          VCC: '5V',
          GND: 'GND',
          Data: 'D2',
        },
        libraryIncludes: ['DHT.h'],
      },
    ],
    userIntent: '온도와 습도를 읽는 기본 예제를 만들어줘',
  };

  try {
    const response = await generateCodePost(
      new Request('http://localhost/api/generate-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '10.0.0.12',
        },
        body: JSON.stringify(payload),
      })
    );

    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.aiMeta?.provider, 'gemini');
    assert.equal(result.fallback ?? false, false);
    assert.match(result.code, /void\s+setup\s*\(/);
    assert.match(result.code, /dht\.begin\s*\(/);
  } finally {
    restoreFetch();
  }
});

test('AI code route falls back to local code when repeated Gemini drafts still fail review', async () => {
  const restoreFetch = installGeminiMock([
    'void setup() {\n  Serial.begin(9600);\n}\n',
    'void setup() {\n  Serial.begin(9600);\n}\n',
  ]);

  const payload: AICodeGenerationPayload = {
    boardId: 'uno',
    boardName: 'Arduino UNO',
    chipset: 'ATmega328P',
    targetLanguage: 'C++',
    connectedComponents: [
      {
        templateId: 'tpl_dht11',
        componentName: '온습도 센서',
        pinConnections: {
          VCC: '5V',
          GND: 'GND',
          Data: 'D2',
        },
        libraryIncludes: ['DHT.h'],
      },
    ],
    userIntent: '온도와 습도를 읽는 기본 예제를 만들어줘',
  };

  try {
    const response = await generateCodePost(
      new Request('http://localhost/api/generate-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '10.0.0.13',
        },
        body: JSON.stringify(payload),
      })
    );

    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.aiMeta?.provider, 'local');
    assert.equal(result.aiMeta?.fallback, true);
    assert.equal(result.fallback, true);
    assert.match(result.code, /void\s+setup\s*\(/);
    assert.match(result.code, /void\s+loop\s*\(/);
  } finally {
    restoreFetch();
  }
});
