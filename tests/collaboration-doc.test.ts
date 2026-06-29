import test from 'node:test';
import assert from 'node:assert/strict';

import { createModuMakeCollaborationDocument } from '@/lib/collaboration-doc';
import { buildCircuitHistoryPatch } from '@/store/board-history';
import type { ManualNetConnection, PlacedComponent } from '@/types';

function waitForTick(ms = 30) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

test('collaboration document seeds and notifies shared code observers only on actual changes', () => {
  const doc = createModuMakeCollaborationDocument('project-demo');
  const snapshots: Array<{ text: string; version: number; originSessionId: string | null; source: string }> = [];

  const unsubscribe = doc.code.observe(snapshot => {
    snapshots.push({
      text: snapshot.text,
      version: snapshot.version,
      originSessionId: snapshot.originSessionId,
      source: snapshot.source,
    });
  });

  const first = doc.code.setText('void setup() {}', {
    originSessionId: 'session-a',
    source: 'seed',
  });
  const second = doc.code.setText('void setup() {}', {
    originSessionId: 'session-a',
    source: 'editor',
  });
  const third = doc.code.setText('void setup() { pinMode(13, OUTPUT); }', {
    originSessionId: 'session-b',
    source: 'remote',
  });

  unsubscribe();
  doc.destroy();

  assert.equal(doc.engine, 'yjs');
  assert.equal(first.version, 1);
  assert.equal(second.version, 1);
  assert.equal(third.version, 2);
  assert.deepEqual(
    snapshots.map(snapshot => ({
      version: snapshot.version,
      text: snapshot.text,
      originSessionId: snapshot.originSessionId,
      source: snapshot.source,
    })),
    [
      {
        version: 1,
        text: 'void setup() {}',
        originSessionId: 'session-a',
        source: 'seed',
      },
      {
        version: 2,
        text: 'void setup() { pinMode(13, OUTPUT); }',
        originSessionId: 'session-b',
        source: 'remote',
      },
    ]
  );
});

test('collaboration document publishes circuit patches only when the payload actually changes', () => {
  const doc = createModuMakeCollaborationDocument('project-demo');
  const snapshots: Array<{ version: number; source: string; nextSignature?: string }> = [];

  const unsubscribe = doc.circuit.observe(snapshot => {
    snapshots.push({
      version: snapshot.version,
      source: snapshot.source,
      nextSignature: snapshot.patch?.nextSignature,
    });
  });

  const first = doc.circuit.publishPatch({
    components: {
      upserts: [{
        instanceId: 'led-1',
        templateId: 'tpl_led',
        name: 'LED 1',
        value: undefined,
        position: { x: 100, y: 140 },
        rotation: 0,
        assignedPins: { Signal: 'D2', GND: 'GND' },
        isFullyRouted: true,
      }],
      removals: [],
      order: ['led-1'],
    },
    baseSignature: 'history:0',
    nextSignature: 'history:1',
    source: 'history',
  }, {
    originSessionId: 'session-a',
    source: 'history',
  });

  const second = doc.circuit.publishPatch({
    components: {
      upserts: [{
        instanceId: 'led-1',
        templateId: 'tpl_led',
        name: 'LED 1',
        value: undefined,
        position: { x: 100, y: 140 },
        rotation: 0,
        assignedPins: { Signal: 'D2', GND: 'GND' },
        isFullyRouted: true,
      }],
      removals: [],
      order: ['led-1'],
    },
    baseSignature: 'history:0',
    nextSignature: 'history:1',
    source: 'history',
  }, {
    originSessionId: 'session-a',
    source: 'history',
  });

  const third = doc.circuit.publishPatch({
    manualConnections: {
      upserts: [{
        id: 'wire-1',
        source: { ownerType: 'component', ownerId: 'led-1', pinId: 'Signal' },
        target: { ownerType: 'board', ownerId: 'uno', pinId: 'D2' },
        suggestedNetName: 'LED_SIG',
      }],
      removals: [],
      order: ['wire-1'],
    },
    baseSignature: 'history:1',
    nextSignature: 'history:2',
    source: 'manual',
  }, {
    originSessionId: 'session-b',
    source: 'manual',
  });

  unsubscribe();
  doc.destroy();

  assert.equal(first.version, 1);
  assert.equal(second.version, 1);
  assert.equal(third.version, 2);
  assert.deepEqual(snapshots, [
    { version: 1, source: 'history', nextSignature: 'history:1' },
    { version: 2, source: 'manual', nextSignature: 'history:2' },
  ]);
});

test('vendored collaboration document syncs shared code between project peers', async () => {
  const left = createModuMakeCollaborationDocument('project-shared-code');
  const right = createModuMakeCollaborationDocument('project-shared-code');
  const seen: Array<{ text: string; source: string; originSessionId: string | null }> = [];

  const unsubscribe = right.code.observe(snapshot => {
    seen.push({
      text: snapshot.text,
      source: snapshot.source,
      originSessionId: snapshot.originSessionId,
    });
  });

  left.code.setText('print("hello")', {
    originSessionId: 'session-left',
    source: 'editor',
  });

  await waitForTick();

  unsubscribe();
  left.destroy();
  right.destroy();

  assert.deepEqual(seen, [
    {
      text: 'print("hello")',
      source: 'remote',
      originSessionId: 'session-left',
    },
  ]);
});

test('vendored collaboration document syncs circuit patches between project peers', async () => {
  const left = createModuMakeCollaborationDocument('project-shared-circuit');
  const right = createModuMakeCollaborationDocument('project-shared-circuit');
  const seen: Array<{ nextSignature?: string; source: string; originSessionId: string | null }> = [];

  const unsubscribe = right.circuit.observe(snapshot => {
    seen.push({
      nextSignature: snapshot.patch?.nextSignature,
      source: snapshot.source,
      originSessionId: snapshot.originSessionId,
    });
  });

  left.circuit.publishPatch({
    components: {
      upserts: [{
        instanceId: 'res-1',
        templateId: 'tpl_resistor',
        name: '저항 1',
        value: '220 Ohm',
        position: { x: 160, y: 120 },
        rotation: 0,
        assignedPins: { A: 'D2', B: 'D3' },
        isFullyRouted: true,
      }],
      removals: [],
      order: ['res-1'],
    },
    baseSignature: 'history:10',
    nextSignature: 'history:11',
    source: 'history',
  }, {
    originSessionId: 'session-left',
    source: 'history',
  });

  await waitForTick();

  unsubscribe();
  left.destroy();
  right.destroy();

  assert.deepEqual(seen, [
    {
      nextSignature: 'history:11',
      source: 'remote',
      originSessionId: 'session-left',
    },
  ]);
});

test('buildCircuitHistoryPatch returns a board-history-shaped patch for components and manual connections', () => {
  const previousComponents: PlacedComponent[] = [{
    instanceId: 'sensor-1',
    templateId: 'tpl_dht11',
    name: '온습도 센서 1',
    value: undefined,
    position: { x: 120, y: 160 },
    rotation: 0,
    assignedPins: { DATA: 'D2' },
    isFullyRouted: false,
  }];
  const nextComponents: PlacedComponent[] = [{
    instanceId: 'sensor-1',
    templateId: 'tpl_dht11',
    name: '온습도 센서 1',
    value: undefined,
    position: { x: 180, y: 180 },
    rotation: 90,
    assignedPins: { DATA: 'D3' },
    isFullyRouted: true,
  }];
  const previousConnections: ManualNetConnection[] = [];
  const nextConnections: ManualNetConnection[] = [{
    id: 'conn-1',
    source: { ownerType: 'component', ownerId: 'sensor-1', pinId: 'DATA' },
    target: { ownerType: 'board', ownerId: 'uno', pinId: 'D3' },
    suggestedNetName: 'DHT_DATA',
  }];

  const patch = buildCircuitHistoryPatch({
    previous: {
      components: previousComponents,
      manualConnections: previousConnections,
    },
    next: {
      components: nextComponents,
      manualConnections: nextConnections,
    },
  });

  assert.ok(patch);
  assert.equal(patch?.components?.order, undefined);
  assert.equal(patch?.components?.upserts[0]?.position.x, 180);
  assert.deepEqual(patch?.manualConnections?.order, ['conn-1']);
  assert.equal(patch?.manualConnections?.upserts[0]?.suggestedNetName, 'DHT_DATA');
});
