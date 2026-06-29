import assert from 'node:assert/strict';
import test from 'node:test';
import { GET } from '@/app/api/components/route';
import { searchComponentCatalog } from '@/lib/component-catalog';

test('component catalog returns a small starter page by default', async () => {
  const result = await searchComponentCatalog({
    boardId: 'uno',
    category: 'ALL',
    verifiedOnly: true,
    limit: 12,
    offset: 0,
  });

  assert.equal(result.source, 'static');
  assert.ok(result.items.length <= 12);
  assert.ok(result.total >= result.items.length);
  assert.ok(result.items.every(item => item.compatibleVoltage === 'BOTH' || item.compatibleVoltage === '5V'));
});

test('component catalog route filters by search and category', async () => {
  const request = new Request(
    'http://localhost:3000/api/components?boardId=uno&category=SENSOR&search=DHT&verifiedOnly=true&limit=10&offset=0',
  );

  const response = await GET(request as never);
  const payload = await response.json() as {
    items: Array<{ id: string; name: string; category: string }>;
    total: number;
  };

  assert.ok(payload.items.length > 0);
  assert.ok(payload.items.every(item => item.category === 'SENSOR'));
  assert.ok(payload.items.every(item => item.name.includes('DHT') || item.id.includes('dht')));
  assert.ok(payload.total >= payload.items.length);
});

test('component catalog search also finds components by important pin labels', async () => {
  const request = new Request(
    'http://localhost:3000/api/components?boardId=uno&category=ALL&search=Echo&verifiedOnly=false&limit=10&offset=0',
  );

  const response = await GET(request as never);
  const payload = await response.json() as {
    items: Array<{ id: string; name: string }>;
  };

  assert.ok(payload.items.some(item => item.id === 'tpl_ultrasonic'));
});

test('component catalog route can hydrate templates directly by id list', async () => {
  const request = new Request(
    'http://localhost:3000/api/components?boardId=uno&ids=tpl_dht11,tpl_led&limit=2&offset=0',
  );

  const response = await GET(request as never);
  const payload = await response.json() as {
    items: Array<{ id: string }>;
    total: number;
  };

  assert.deepEqual(payload.items.map(item => item.id), ['tpl_dht11', 'tpl_led']);
  assert.equal(payload.total, 2);
});

test('imported schematic catalog does not filter out 3.3V-only parts by board voltage', async () => {
  const result = await searchComponentCatalog({
    boardId: 'kicad_generic',
    category: 'COMMUNICATION',
    search: 'RFID',
    verifiedOnly: false,
    limit: 10,
    offset: 0,
  });

  assert.ok(result.items.some(item => item.id === 'tpl_rfid_rc522'));
});
