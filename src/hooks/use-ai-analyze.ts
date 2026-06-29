'use client';

import { useCallback, useState } from 'react';

import type { AIAnalyzeRequestPayload, AIAnalyzeResponse } from '@/types';

type AiAnalyzeStatus = 'idle' | 'loading' | 'success' | 'error';

export function useAiAnalyze() {
  const [status, setStatus] = useState<AiAnalyzeStatus>('idle');
  const [data, setData] = useState<AIAnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const analyze = useCallback(async (payload: AIAnalyzeRequestPayload) => {
    setStatus('loading');
    setError(null);

    try {
      const response = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          typeof body?.error === 'string'
            ? body.error
            : 'AI analysis request failed.'
        );
      }

      setData(body as AIAnalyzeResponse);
      setStatus('success');
      return body as AIAnalyzeResponse;
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : 'AI analysis request failed.';
      setError(message);
      setData(null);
      setStatus('error');
      throw requestError;
    }
  }, []);

  const reset = useCallback(() => {
    setStatus('idle');
    setData(null);
    setError(null);
  }, []);

  return {
    status,
    data,
    error,
    analyze,
    reset,
  };
}
