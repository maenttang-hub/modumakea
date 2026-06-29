import test from 'node:test';
import assert from 'node:assert/strict';
import { enqueueCompileJob } from '@/lib/server/compile-queue-store';

test('compile queue store fails fast when supabase mode is selected without admin configuration', async () => {
  const previousMode = process.env.MODUMAKE_COMPILE_QUEUE_STORE;
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.MODUMAKE_COMPILE_QUEUE_STORE = 'supabase';
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    await assert.rejects(
      () =>
        enqueueCompileJob({
          jobId: 'job-supabase-1',
          boardId: 'uno',
          sourceCode: 'void setup() {} void loop() {}',
          requiredLibraries: ['Wire'],
        }),
      /Supabase admin client is not configured/
    );
  } finally {
    if (previousMode === undefined) {
      delete process.env.MODUMAKE_COMPILE_QUEUE_STORE;
    } else {
      process.env.MODUMAKE_COMPILE_QUEUE_STORE = previousMode;
    }
    if (previousUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    }
    if (previousServiceRole === undefined) {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    } else {
      process.env.SUPABASE_SERVICE_ROLE_KEY = previousServiceRole;
    }
  }
});
