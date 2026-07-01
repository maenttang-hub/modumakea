import test from 'node:test';
import assert from 'node:assert/strict';

import { POST } from '@/app/api/beta/events/route';

test('beta events route is disabled by default', async () => {
  const previous = process.env.MODUMAKE_ENABLE_BETA_EVENTS;
  delete process.env.MODUMAKE_ENABLE_BETA_EVENTS;

  try {
    const response = await POST(
      new Request('http://localhost/api/beta/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-request-id': 'beta-disabled' },
        body: JSON.stringify({ name: 'import_failed', source: 'editor-import' }),
      })
    );
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.equal(response.headers.get('x-request-id'), 'beta-disabled');
    assert.match(body.error, /not enabled/);
  } finally {
    if (previous === undefined) {
      delete process.env.MODUMAKE_ENABLE_BETA_EVENTS;
    } else {
      process.env.MODUMAKE_ENABLE_BETA_EVENTS = previous;
    }
  }
});

test('beta events route accepts sanitized event payloads when enabled', async () => {
  const previous = process.env.MODUMAKE_ENABLE_BETA_EVENTS;
  const originalInfo = console.info;
  const logs: unknown[] = [];
  process.env.MODUMAKE_ENABLE_BETA_EVENTS = 'true';
  console.info = (...args: unknown[]) => {
    logs.push(args);
  };

  try {
    const response = await POST(
      new Request('http://localhost/api/beta/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-request-id': 'beta-enabled' },
        body: JSON.stringify({
          name: 'import_succeeded',
          source: 'editor-import',
          route: '/editor',
          outcome: 'schematic',
          attributes: {
            fileExtension: '.kicad_sch',
            fileName: 'private-client-file.kicad_sch',
            issueCount: 2,
          },
        }),
      })
    );

    assert.equal(response.status, 204);
    assert.equal(response.headers.get('x-request-id'), 'beta-enabled');
    assert.ok(logs.length >= 2);
    assert.equal(JSON.stringify(logs).includes('private-client-file'), false);
  } finally {
    console.info = originalInfo;
    if (previous === undefined) {
      delete process.env.MODUMAKE_ENABLE_BETA_EVENTS;
    } else {
      process.env.MODUMAKE_ENABLE_BETA_EVENTS = previous;
    }
  }
});
