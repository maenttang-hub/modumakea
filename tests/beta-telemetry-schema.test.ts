import test from 'node:test';
import assert from 'node:assert/strict';

import { sanitizeBetaTelemetryEvent } from '@/lib/beta-telemetry-schema';

test('beta telemetry schema accepts known events and strips sensitive attributes', () => {
  const event = sanitizeBetaTelemetryEvent({
    name: 'import_failed',
    source: 'editor-import',
    route: '/editor',
    outcome: 'parse-error',
    occurredAt: '2026-06-30T00:00:00.000Z',
    attributes: {
      fileName: 'client-secret-board.kicad_sch',
      sourceText: '(kicad_sch ...)',
      fileExtension: '.kicad_sch',
      fileSizeBucket: '100kb-1mb',
      issueCount: 4,
      enabled: false,
    },
  });

  assert.ok(event);
  assert.equal(event.name, 'import_failed');
  assert.deepEqual(event.attributes, {
    fileExtension: '.kicad_sch',
    fileSizeBucket: '100kb-1mb',
    issueCount: 4,
    enabled: false,
  });
});

test('beta telemetry schema rejects unknown events and invalid sources', () => {
  assert.equal(sanitizeBetaTelemetryEvent({ name: 'raw_dump', source: 'editor' }), null);
  assert.equal(sanitizeBetaTelemetryEvent({ name: 'import_failed' }), null);
  assert.equal(sanitizeBetaTelemetryEvent(null), null);
});
