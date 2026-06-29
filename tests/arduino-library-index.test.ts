import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeArduinoLibraryIndexDocument } from '@/lib/arduino-library-index';

test('normalizeArduinoLibraryIndexDocument extracts latest metadata and explicit headers', () => {
  const rows = normalizeArduinoLibraryIndexDocument({
    libraries: [
      {
        name: 'DHT sensor library',
        author: 'Adafruit',
        sentence: 'legacy',
        versions: [
          { version: '1.4.5', headers: ['Legacy.h'] },
          { version: '1.4.6', headers: ['DHT.h', 'DHT_U.h'], sentence: 'latest sentence' },
        ],
      },
    ],
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.latest_version, '1.4.6');
  assert.deepEqual(rows[0]?.includes, ['DHT.h', 'DHT_U.h']);
  assert.equal(rows[0]?.sentence, 'latest sentence');
});

test('normalizeArduinoLibraryIndexDocument derives a reasonable include when the index omits headers', () => {
  const rows = normalizeArduinoLibraryIndexDocument({
    libraries: [
      {
        name: 'Adafruit GFX Library',
        author: 'Adafruit',
        versions: [{ version: '1.11.9' }],
      },
    ],
  });

  assert.equal(rows.length, 1);
  assert.ok(rows[0]?.includes.includes('Adafruit_GFX.h') || rows[0]?.includes.includes('AdafruitGFX.h'));
});
