import type { DatasheetReviewSeverity } from './datasheet-review';
import type { LightweightValidationJson } from './lightweight-validation-json';

export type AIAnalyzeProvider = 'anthropic' | 'gemini' | 'local';

export interface AIAnalyzeRequestPayload {
  validationInput: LightweightValidationJson;
  preferredProvider?: AIAnalyzeProvider;
  preferredModel?: string;
}

export interface AIAnalyzeSemanticIssue {
  severity: DatasheetReviewSeverity;
  title: string;
  description: string;
  relatedComponentIds: string[];
}

export interface AIAnalyzeRecommendation {
  originalPartName: string;
  recommendedPartName: string;
  reason: string;
  compatibilityScore: number;
  purchaseLink?: string;
  estimatedSavings?: string;
}

export interface AIAnalyzeResultSet {
  semanticIssues: AIAnalyzeSemanticIssue[];
  recommendations: AIAnalyzeRecommendation[];
}

export interface AIAnalyzeResponse {
  deterministic: AIAnalyzeResultSet;
  ai: AIAnalyzeResultSet & {
    provider: AIAnalyzeProvider;
    model?: string;
    fallbackUsed: boolean;
  };
  semanticIssues: AIAnalyzeSemanticIssue[];
  recommendations: AIAnalyzeRecommendation[];
}
