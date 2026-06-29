import type {
  AIAnalyzeProvider,
  AIAnalyzeRequestPayload,
  LightweightValidationJson,
} from '@/types';

export function buildAiAnalyzeRequest(
  validationInput: LightweightValidationJson,
  preferredProvider: AIAnalyzeProvider = 'anthropic'
): AIAnalyzeRequestPayload {
  return {
    validationInput,
    preferredProvider,
  };
}
