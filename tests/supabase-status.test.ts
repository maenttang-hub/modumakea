import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveSupabaseStatus } from '@/lib/supabase';

test('resolveSupabaseStatus reports missing or placeholder configuration as disabled', () => {
  assert.deepEqual(resolveSupabaseStatus('', ''), {
    enabled: false,
    reason: 'missing-env',
  });

  assert.deepEqual(
    resolveSupabaseStatus('https://example.supabase.co', 'placeholder-anon-key'),
    {
      enabled: false,
      reason: 'placeholder-env',
    }
  );
});

test('resolveSupabaseStatus reports invalid url separately from ready config', () => {
  assert.deepEqual(
    resolveSupabaseStatus('not-a-url', 'real-anon-key'),
    {
      enabled: false,
      reason: 'invalid-url',
    }
  );

  assert.deepEqual(
    resolveSupabaseStatus('https://demo.supabase.co', 'real-anon-key'),
    {
      enabled: true,
    }
  );
});
