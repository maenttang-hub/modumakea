import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeAiConceptLayout } from '@/lib/ai-concept-layout';
import type { AIConceptDesignContext, AIConceptDesignResult } from '@/types';

function rectsOverlap(
  left: { x: number; y: number },
  right: { x: number; y: number }
) {
  const width = 140;
  const height = 130;

  return !(
    left.x + width <= right.x ||
    right.x + width <= left.x ||
    left.y + height <= right.y ||
    right.y + height <= left.y
  );
}

test('normalizeAiConceptLayout keeps existing placements and reorders new AI parts into a tidy snapped grid', () => {
  const currentDesign: AIConceptDesignContext = {
    boardId: 'uno',
    components: [
      {
        instanceId: 'c1',
        templateId: 'tpl_dht11',
        name: '온습도 센서 1',
        position: { x: 540, y: 180 },
        rotation: 0,
        assignedPins: {
          VCC: '5V',
          GND: 'GND',
          Data: 'D2',
        },
      },
    ],
    usedBoardPins: ['5V', 'GND', 'D2'],
    lockedBoardPins: ['5V', 'GND', 'D2'],
  };

  const draft: AIConceptDesignResult = {
    board: { id: 'uno' },
    components: [
      {
        instanceId: 'c1',
        templateId: 'tpl_dht11',
        position: { x: 15, y: 15 },
        rotation: 0,
        assignedPins: {},
      },
      {
        instanceId: 'c2',
        templateId: 'tpl_led',
        position: { x: 45, y: 30 },
        rotation: 0,
        assignedPins: {},
      },
      {
        instanceId: 'c3',
        templateId: 'tpl_button',
        position: { x: 60, y: 60 },
        rotation: 0,
        assignedPins: {},
      },
      {
        instanceId: 'c4',
        templateId: 'tpl_ultrasonic',
        position: { x: 75, y: 45 },
        rotation: 0,
        assignedPins: {},
      },
    ],
    connections: [
      { instanceId: 'c1', componentPin: 'VCC', boardPin: '5V' },
      { instanceId: 'c1', componentPin: 'GND', boardPin: 'GND' },
      { instanceId: 'c1', componentPin: 'Data', boardPin: 'D2' },
      { instanceId: 'c2', componentPin: 'GND', boardPin: 'GND' },
      { instanceId: 'c2', componentPin: 'Signal', boardPin: 'D6' },
      { instanceId: 'c3', componentPin: 'GND', boardPin: 'GND' },
      { instanceId: 'c3', componentPin: 'Signal', boardPin: 'D4' },
      { instanceId: 'c4', componentPin: 'VCC', boardPin: '5V' },
      { instanceId: 'c4', componentPin: 'GND', boardPin: 'GND' },
      { instanceId: 'c4', componentPin: 'Trig', boardPin: 'D3' },
      { instanceId: 'c4', componentPin: 'Echo', boardPin: 'D5' },
    ],
    code: '',
  };

  const normalized = normalizeAiConceptLayout(draft, currentDesign);
  const byId = new Map(normalized.components.map(component => [component.instanceId, component]));

  assert.deepEqual(byId.get('c1')?.position, { x: 540, y: 180 });

  for (const componentId of ['c2', 'c3', 'c4']) {
    const component = byId.get(componentId);
    assert.ok(component, `${componentId} should exist`);
    assert.equal(component!.position.x % 15, 0);
    assert.equal(component!.position.y % 15, 0);
    assert.ok(component!.position.x >= 450, `${componentId} should be placed to the right of the board`);
  }

  const c2 = byId.get('c2')!;
  const c3 = byId.get('c3')!;
  const c4 = byId.get('c4')!;

  assert.equal(c4.position.y <= c3.position.y, true, 'lower-numbered board pins should appear higher');
  assert.equal(c3.position.y <= c2.position.y, true, 'sorting should follow signal pin order');
  assert.equal(rectsOverlap(c2.position, c3.position), false);
  assert.equal(rectsOverlap(c2.position, c4.position), false);
  assert.equal(rectsOverlap(c3.position, c4.position), false);
});
