import test from 'node:test';
import assert from 'node:assert/strict';

import { POST } from '@/app/api/launch-desk/route';

test('Launch Desk API is disabled by default for the beta surface', async () => {
  const previous = process.env.MODUMAKE_ENABLE_LAUNCH_DESK;
  process.env.MODUMAKE_ENABLE_LAUNCH_DESK = 'false';

  try {
    const response = await POST(
      new Request('http://localhost/api/launch-desk', {
        method: 'POST',
        body: JSON.stringify({}),
      })
    );
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.match(body.error, /not enabled/);
  } finally {
    if (previous === undefined) {
      delete process.env.MODUMAKE_ENABLE_LAUNCH_DESK;
    } else {
      process.env.MODUMAKE_ENABLE_LAUNCH_DESK = previous;
    }
  }
});
