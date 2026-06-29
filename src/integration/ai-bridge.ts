import { validateAiConceptDesignResult } from '@/lib/ai-design-schema';
import { useBoardStore } from '@/store/use-board-store';
import type {
  AIConceptDesignResult,
  AIConceptErrorResponse,
  AIConceptRequestPayload,
} from '@/types';

export async function requestAiConceptDesign(payload: AIConceptRequestPayload): Promise<AIConceptDesignResult> {
  const response = await fetch('/api/brain/concept', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json()) as AIConceptDesignResult | AIConceptErrorResponse;
  if (!response.ok) {
    throw new Error(
      typeof data === 'object' && data && 'error' in data
        ? `${data.error}${data.details ? `: ${Array.isArray(data.details) ? data.details.join(', ') : data.details}` : ''}`
        : 'AI 설계 요청에 실패했습니다.'
    );
  }

  const validation = validateAiConceptDesignResult(data);
  if (!validation.valid || !validation.data) {
    throw new Error(validation.errors.join(' / '));
  }

  return validation.data;
}

export function applyAiDesignResult(result: AIConceptDesignResult) {
  return useBoardStore.getState().applyAiDesignResult(result);
}
