import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAiAnalyzeRequest } from '@/lib/build-ai-analyze-request';
import type { AIAnalyzeRequestPayload, LightweightValidationJson } from '@/types';

function createPayload(overrides: Partial<LightweightValidationJson> = {}): AIAnalyzeRequestPayload {
  const validationInput: LightweightValidationJson = {
    schema_version: '2026-06-19',
    source: {
      source_file_kind: 'kicad_sch',
      project_name: 'AI Analyze Test',
      generator: 'unit-test',
      version: '20211123',
    },
    components: [
      {
        instance_id: 'comp-dht11',
        ref: 'U1',
        lib_id: 'Sensor:DHT11',
        symbol_name: 'DHT11',
        value: 'DHT11',
        footprint: 'DHT11',
        mpn_candidates: ['DHT11'],
        pins: [
          {
            pin_number: '2',
            pin_name: 'Data',
            electrical_type: 'bidirectional',
            direction: 'bidirectional',
            net_id: 'net-3',
            net_label: 'D2',
            net_aliases: [],
          },
        ],
      },
    ],
    nets: [
      {
        net_id: 'net-3',
        label: 'D2',
        kind: 'signal',
        aliases: [],
        connected_pins: [
          {
            ref: 'U1',
            lib_id: 'Sensor:DHT11',
            pin_number: '2',
            pin_name: 'Data',
            electrical_type: 'bidirectional',
          },
        ],
      },
    ],
    unresolved: {
      symbols: [],
    },
    code_pin_usage: [
      {
        operationType: 'digitalRead',
        pinArgument: 'D2',
        matchedMcuPinLabel: 'D2',
        lineNumber: 12,
        scope: 'loop',
        conditional: false,
        conditions: [],
        callPath: [],
        connectedNetLabels: ['D2'],
        connectedComponentReferences: ['U1'],
      },
    ],
    validation_flags: [
      {
        source: 'rule_based',
        severity: 'warning',
        code: 'i2c.pullup-missing',
        ruleId: 'i2c.pullup-missing',
        title: 'I2C Pull-up Missing',
        message: 'SDA/SCL lines need explicit pull-up resistors.',
        componentReference: 'U1',
        recommendation: 'Add 4.7kΩ pull-up resistors.',
      },
    ],
    rule_findings: [
      {
        severity: 'warning',
        ruleId: 'i2c.pullup-missing',
        title: 'I2C Pull-up Missing',
        message: 'SDA/SCL lines need explicit pull-up resistors.',
        componentReference: 'U1',
        recommendation: 'Add 4.7kΩ pull-up resistors.',
      },
    ],
    stats: {
      component_count: 1,
      net_count: 1,
      unresolved_symbol_count: 0,
      wire_segment_count: 1,
      junction_count: 0,
      label_count: 1,
    },
    ...overrides,
  };

  return { validationInput };
}

test('buildAiAnalyzeRequest wraps LightweightValidationJson in the canonical analyze request body', () => {
  const payload = createPayload().validationInput;
  const requestBody = buildAiAnalyzeRequest(payload);

  assert.equal(requestBody.preferredProvider, 'anthropic');
  assert.equal(requestBody.validationInput.schema_version, '2026-06-19');
  assert.equal(requestBody.validationInput.source.project_name, 'AI Analyze Test');
});

function installGeminiMock(responseText: string) {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    if (!url.includes('generativelanguage.googleapis.com')) {
      throw new Error(`Unexpected fetch during AI analyze route test: ${url}`);
    }

    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ text: responseText }],
            },
          },
        ],
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  };

  return () => {
    globalThis.fetch = originalFetch;
  };
}

test('AI analyze route falls back to local semantic issues when no remote model is configured', async () => {
  const previousGeminiKey = process.env.GEMINI_API_KEY;
  const previousAnthropicKey = process.env.ANTHROPIC_API_KEY;
  process.env.GEMINI_API_KEY = '';
  process.env.ANTHROPIC_API_KEY = '';

  try {
    const { POST } = await import('@/app/api/ai/analyze/route');
    const response = await POST(
      new Request('http://localhost/api/ai/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '10.0.0.31',
        },
        body: JSON.stringify(createPayload()),
      })
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(Array.isArray(payload.deterministic.semanticIssues), true);
    assert.equal(Array.isArray(payload.deterministic.recommendations), true);
    assert.equal(payload.ai.provider, 'local');
    assert.equal(payload.ai.fallbackUsed, true);
    assert.ok(payload.deterministic.semanticIssues.length >= 1);
    assert.match(payload.deterministic.recommendations[0]?.recommendedPartName ?? '', /pull-up|풀업/i);
  } finally {
    process.env.GEMINI_API_KEY = previousGeminiKey;
    process.env.ANTHROPIC_API_KEY = previousAnthropicKey;
  }
});

test('AI analyze route accepts structured JSON from Gemini', async () => {
  const previousGeminiKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'test-gemini-key';

  const restoreFetch = installGeminiMock(
    JSON.stringify({
      semanticIssues: [
        {
          severity: 'error',
          title: 'Code pin mismatch',
          description: 'GPIO17 is used in firmware but not connected in the current schematic.',
          relatedComponentIds: ['comp-dht11'],
        },
      ],
      recommendations: [
        {
          originalPartName: 'Generic sensor module',
          recommendedPartName: 'Vendor-documented exact SKU',
          reason: 'Locking the exact module improves later review accuracy.',
          compatibilityScore: 83,
        },
      ],
    })
  );

  try {
    const { POST } = await import('@/app/api/ai/analyze/route');
    const response = await POST(
      new Request('http://localhost/api/ai/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '10.0.0.32',
        },
        body: JSON.stringify(createPayload({
          source: {
            source_file_kind: 'kicad_sch',
            project_name: 'AI Analyze Gemini Test',
            generator: 'unit-test',
            version: '20211123',
          },
        })),
      })
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ai.semanticIssues[0]?.title, 'Code pin mismatch');
    assert.equal(payload.ai.recommendations[0]?.compatibilityScore, 83);
    assert.ok(payload.deterministic.semanticIssues.length >= 1);
  } finally {
    restoreFetch();
    process.env.GEMINI_API_KEY = previousGeminiKey;
  }
});
