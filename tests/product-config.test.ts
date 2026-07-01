import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PRODUCT_NAME,
  PRODUCT_ONE_LINE,
  PRODUCT_SUPPORTED_SCOPE,
  PRODUCT_UNSUPPORTED_CLAIMS,
  getProductFeedbackHref,
} from '@/lib/product-config';

test('product config keeps the public product promise narrow', () => {
  assert.equal(PRODUCT_NAME, 'ModuMake');
  assert.match(PRODUCT_ONE_LINE, /리스크/);
  assert.ok(PRODUCT_SUPPORTED_SCOPE.some(item => item.includes('KiCad')));
  assert.ok(PRODUCT_UNSUPPORTED_CLAIMS.includes('public cloud compile'));
  assert.ok(PRODUCT_UNSUPPORTED_CLAIMS.includes('전문 EDA 대체'));
});

test('product config falls back to local support route when no feedback channel is configured', () => {
  assert.equal(getProductFeedbackHref(), '/support');
});

