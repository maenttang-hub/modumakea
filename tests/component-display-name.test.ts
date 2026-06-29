import test from 'node:test';
import assert from 'node:assert/strict';

import { formatCanvasComponentName } from '@/lib/component-display-name';

test('formatCanvasComponentName shortens common sensor and passive names for canvas display', () => {
  assert.equal(formatCanvasComponentName('온습도 센서 1'), '온습1');
  assert.equal(formatCanvasComponentName('온습도 센서 Pro 1'), '온습Pro1');
  assert.equal(formatCanvasComponentName('저항 1'), 'R1');
  assert.equal(formatCanvasComponentName('LED 3'), 'LED3');
  assert.equal(formatCanvasComponentName('OLED 디스플레이 2'), 'OLED2');
});

test('formatCanvasComponentName falls back to compact generic labels and max length truncation', () => {
  assert.equal(formatCanvasComponentName('토양 수분 센서 1'), '토양수분1');
  assert.equal(formatCanvasComponentName('커스텀 모듈 12'), '커스텀12');
  assert.equal(formatCanvasComponentName('아주 긴 커스텀 센서 이름 4', { maxLength: 8 }), '아주긴커스텀센서…');
});
