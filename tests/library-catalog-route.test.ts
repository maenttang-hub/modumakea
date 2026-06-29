import test from 'node:test';
import assert from 'node:assert/strict';

const { GET: librariesGet } = await import('@/app/api/libraries/route');

test('library catalog route returns starter entries and supports search', async () => {
  const response = await librariesGet(new Request('http://localhost/api/libraries?search=DHT&limit=10&offset=0'));

  assert.equal(response.status, 200);
  const payload = await response.json() as {
    items: Array<{ name: string; includes: string[] }>;
    total: number;
    source: 'supabase' | 'static';
  };

  assert.ok(payload.total >= 1);
  assert.ok(payload.items.some(item => item.name === 'DHT sensor library'));
  assert.ok(payload.items.some(item => item.includes.includes('DHT.h')));
});

test('library catalog route matches header-shaped searches', async () => {
  const response = await librariesGet(new Request('http://localhost/api/libraries?search=Adafruit_GFX.h&limit=10&offset=0'));

  assert.equal(response.status, 200);
  const payload = await response.json() as {
    items: Array<{ name: string; includes: string[] }>;
  };

  assert.ok(payload.items.some(item => item.name === 'Adafruit GFX Library'));
});
