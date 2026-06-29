import type { CompileJobRequest } from '@/types';
import { getCompileJobDispatcher } from '@/lib/server/compile-dispatch';

export async function submitCompileJob(payload: CompileJobRequest, requestId?: string) {
  return getCompileJobDispatcher().submit(payload, requestId);
}
