import test from 'node:test';
import assert from 'node:assert/strict';

import { GET } from '@/app/api/health/route';

test('health route reports product status without exposing secrets', async () => {
  const response = await GET(
    new Request('http://localhost/api/health', {
      headers: { 'x-request-id': 'health-test' },
    })
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-request-id'), 'health-test');
  assert.equal(body.product, 'ModuMake');
  assert.equal(body.surface, 'review-mvp');
  assert.equal(typeof body.version, 'string');
  assert.equal(JSON.stringify(body).includes('OPENAI_API_KEY'), false);
});

