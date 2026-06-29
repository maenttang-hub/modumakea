import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

import { guardAiRequest } from '@/lib/server/ai-request-guard';
import { generateGeminiText, getGeminiApiKey, getGeminiModel } from '@/lib/server/gemini';
import type { DatasheetReviewSeverity, LightweightValidationJson } from '@/types';
import type {
  AIAnalyzeProvider,
  AIAnalyzeRecommendation,
  AIAnalyzeRequestPayload,
  AIAnalyzeResultSet,
  AIAnalyzeResponse,
  AIAnalyzeSemanticIssue,
} from '@/types/ai-analyze';

const ANTHROPIC_ANALYZE_MODEL = 'claude-3-5-sonnet-20240620';
function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  return new Anthropic({ apiKey });
}

function extractTextContent(result: { content?: Array<{ type: string; text?: string }> }) {
  if (!('content' in result) || !Array.isArray(result.content)) {
    return '';
  }
  const textBlock = result.content.find(item => item.type === 'text');
  return textBlock?.type === 'text' ? textBlock.text?.trim() ?? '' : '';
}

function extractJsonObjectText(rawText: string) {
  const fenced = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  if (fenced.startsWith('{') && fenced.endsWith('}')) {
    return fenced;
  }

  const firstBrace = fenced.indexOf('{');
  const lastBrace = fenced.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return fenced.slice(firstBrace, lastBrace + 1).trim();
  }

  return fenced;
}

function isLightweightValidationInput(value: unknown): value is LightweightValidationJson {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<LightweightValidationJson>;
  return Boolean(
    candidate.source &&
      typeof candidate.source === 'object' &&
      Array.isArray(candidate.components) &&
      Array.isArray(candidate.nets) &&
      candidate.unresolved &&
      typeof candidate.unresolved === 'object' &&
      candidate.stats &&
      typeof candidate.stats === 'object'
  );
}

function normalizeSeverity(value: unknown): DatasheetReviewSeverity {
  return value === 'error' || value === 'warning' || value === 'info' ? value : 'info';
}

function normalizeSemanticIssues(value: unknown): AIAnalyzeSemanticIssue[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap(item => {
    if (!item || typeof item !== 'object') {
      return [];
    }

    const candidate = item as Partial<AIAnalyzeSemanticIssue>;
    if (typeof candidate.title !== 'string' || typeof candidate.description !== 'string') {
      return [];
    }

    return [{
      severity: normalizeSeverity(candidate.severity),
      title: candidate.title.trim(),
      description: candidate.description.trim(),
      relatedComponentIds: Array.isArray(candidate.relatedComponentIds)
        ? candidate.relatedComponentIds.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
        : [],
    }];
  });
}

function normalizeRecommendations(value: unknown): AIAnalyzeRecommendation[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap(item => {
    if (!item || typeof item !== 'object') {
      return [];
    }

    const candidate = item as Partial<AIAnalyzeRecommendation>;
    if (
      typeof candidate.originalPartName !== 'string' ||
      typeof candidate.recommendedPartName !== 'string' ||
      typeof candidate.reason !== 'string'
    ) {
      return [];
    }

    return [{
      originalPartName: candidate.originalPartName.trim(),
      recommendedPartName: candidate.recommendedPartName.trim(),
      reason: candidate.reason.trim(),
      compatibilityScore:
        typeof candidate.compatibilityScore === 'number' && Number.isFinite(candidate.compatibilityScore)
          ? Math.max(0, Math.min(100, Math.round(candidate.compatibilityScore)))
          : 50,
      purchaseLink: typeof candidate.purchaseLink === 'string' && candidate.purchaseLink.trim().length > 0
        ? candidate.purchaseLink.trim()
        : undefined,
      estimatedSavings: typeof candidate.estimatedSavings === 'string' && candidate.estimatedSavings.trim().length > 0
        ? candidate.estimatedSavings.trim()
        : undefined,
    }];
  });
}

function normalizeAiAnalyzeResultSet(value: unknown): AIAnalyzeResultSet {
  const emptySet: AIAnalyzeResultSet = {
    semanticIssues: [],
    recommendations: [],
  };
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return emptySet;
  }

  const candidate = value as Partial<AIAnalyzeResultSet>;
  return {
    semanticIssues: normalizeSemanticIssues(candidate.semanticIssues),
    recommendations: normalizeRecommendations(candidate.recommendations),
  };
}

function buildLocalSemanticIssues(payload: LightweightValidationJson) {
  const referenceToInstanceId = new Map(
    payload.components.map(component => [component.ref, component.instance_id])
  );
  const issues: AIAnalyzeSemanticIssue[] = [];
  const seen = new Set<string>();

  for (const flag of payload.validation_flags ?? []) {
    const relatedComponentIds = flag.componentReference
      ? [referenceToInstanceId.get(flag.componentReference)].filter((value): value is string => Boolean(value))
      : [];
    const key = `${flag.ruleId}:${flag.componentReference ?? ''}:${flag.boardPin ?? ''}:${flag.lineNumber ?? 0}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    issues.push({
      severity: flag.severity,
      title: flag.title,
      description: flag.recommendation ?? flag.message,
      relatedComponentIds,
    });
    if (issues.length >= 8) {
      break;
    }
  }

  for (const unresolved of payload.unresolved.symbols) {
    const key = `unresolved:${unresolved.instanceId}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    issues.push({
      severity: 'warning',
      title: `Unresolved imported symbol: ${unresolved.reference}`,
      description: `${unresolved.libId} could not be fully resolved into a stable validation symbol. This can lower review accuracy until the exact symbol or part is pinned down.`,
      relatedComponentIds: [unresolved.instanceId],
    });
  }

  for (const usage of payload.code_pin_usage ?? []) {
    if (usage.matchedMcuPinLabel) {
      continue;
    }

    const key = `unmatched-pin:${usage.pinArgument}:${usage.lineNumber}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    issues.push({
      severity: 'warning',
      title: `Code pin ${usage.pinArgument} is not mapped in the schematic`,
      description: `The code uses ${usage.operationType} on ${usage.pinArgument} at line ${usage.lineNumber}, but the current circuit model could not match that pin to a board connection.`,
      relatedComponentIds: [],
    });
    if (issues.length >= 10) {
      break;
    }
  }

  return issues;
}

function buildLocalRecommendations(payload: LightweightValidationJson) {
  const recommendations: AIAnalyzeRecommendation[] = [];
  const seen = new Set<string>();

  for (const finding of payload.rule_findings ?? []) {
    const combined = `${finding.title} ${finding.message} ${finding.recommendation ?? ''}`;
    if (/pull-?up|풀업/i.test(combined)) {
      const key = `${finding.componentReference ?? 'net'}:pullup`;
      if (!seen.has(key)) {
        seen.add(key);
        recommendations.push({
          originalPartName: finding.componentReference ?? 'I2C bus',
          recommendedPartName: '4.7kOhm pull-up resistor / 4.7kΩ 풀업 저항',
          reason: 'Open-drain buses and data lines are safer when the external pull-up value is explicitly fixed in the schematic and BOM.',
          compatibilityScore: 88,
          estimatedSavings: '$0.02 per unit (standard resistor)',
        });
      }
    }

    if (/level|전압|5V|3.3V/i.test(combined)) {
      const key = `${finding.componentReference ?? 'net'}:level`;
      if (!seen.has(key)) {
        seen.add(key);
        recommendations.push({
          originalPartName: finding.componentReference ?? 'Voltage domain crossing',
          recommendedPartName: '3.3V/5V logic level shifter / 레벨 시프터',
          reason: 'Mixed-voltage interfaces are safer when the level translation path is made explicit instead of relying on tolerance assumptions.',
          compatibilityScore: 72,
          estimatedSavings: '$0.35 per unit (prevents MCU damage)',
        });
      }
    }

    if (/sku|vendor|generic-module|제조사/i.test(combined)) {
      const key = `${finding.componentReference ?? 'part'}:vendor-sku`;
      if (!seen.has(key)) {
        seen.add(key);
        recommendations.push({
          originalPartName: finding.componentReference ?? 'Generic module',
          recommendedPartName: 'Vendor-documented exact SKU / 제조사 SKU 고정',
          reason: 'For review and production handoff, locking a documented vendor part is better than leaving the module generic.',
          compatibilityScore: 60,
          estimatedSavings: '$1.50 unit savings (bulk packaging pricing)',
        });
      }
    }

    if (recommendations.length >= 5) {
      break;
    }
  }

  if (recommendations.length < 3) {
    for (const component of payload.components) {
      if (component.mpn_candidates.length > 0) {
        continue;
      }

      const key = `${component.ref}:datasheet`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      recommendations.push({
        originalPartName: component.value ?? component.symbol_name ?? component.ref,
        recommendedPartName: 'Exact documented part / 정확한 데이터시트 부품',
        reason: 'This symbol still looks too generic for a reliable datasheet review. Tightening it to an exact part number will improve later AI checks.',
        compatibilityScore: 55,
        estimatedSavings: '$0.12 unit savings (from standardized suppliers)',
      });

      if (recommendations.length >= 5) {
        break;
      }
    }
  }

  return recommendations;
}

function buildDeterministicResult(payload: LightweightValidationJson): AIAnalyzeResultSet {
  return {
    semanticIssues: buildLocalSemanticIssues(payload),
    recommendations: buildLocalRecommendations(payload),
  };
}

function buildAiAnalyzePrompt(payload: LightweightValidationJson) {
  return [
    'You are reviewing a structured hardware validation payload.',
    'Return exactly one JSON object with this shape and nothing else:',
    '{"semanticIssues":[{"severity":"error|warning|info","title":"...","description":"...","relatedComponentIds":["..."]}],"recommendations":[{"originalPartName":"...","recommendedPartName":"...","reason":"...","compatibilityScore":0,"estimatedSavings":"..."}]}',
    'Rules:',
    '- Focus on hardware/software consistency, datasheet-driven risks, and review-worthy semantic mismatches.',
    '- Do not repeat every low-level rule finding. Surface the highest-signal items only.',
    '- Keep semanticIssues to at most 8 and recommendations to at most 5.',
    '- Reuse existing issue language when it is already clear. If mixed, prefer Korean.',
    '- relatedComponentIds must use instanceId values already present in the payload.',
    '- estimatedSavings should be a brief estimation of unit cost reduction or savings, e.g. "$0.15 unit savings", "12% lower cost", or "N/A (Essential for safety)" if applicable.',
    '',
    JSON.stringify(payload, null, 2),
  ].join('\n');
}

async function runGeminiAnalyze(payload: LightweightValidationJson, modelOverride?: string) {
  const text = await generateGeminiText({
    model: modelOverride || getGeminiModel(),
    prompt: buildAiAnalyzePrompt(payload),
    systemInstruction:
      'Return exactly one valid JSON object and nothing else. No markdown, no prose, no code fences.',
    temperature: 0.1,
    maxOutputTokens: 4000,
  });

  return normalizeAiAnalyzeResultSet(JSON.parse(extractJsonObjectText(text)));
}

async function runAnthropicAnalyze(payload: LightweightValidationJson, modelOverride?: string) {
  const anthropic = getAnthropicClient();
  if (!anthropic) {
    throw new Error('Anthropic API key is not configured.');
  }

  const response = await anthropic.messages.create({
    model: modelOverride || ANTHROPIC_ANALYZE_MODEL,
    max_tokens: 4000,
    temperature: 0.1,
    messages: [{ role: 'user', content: buildAiAnalyzePrompt(payload) }],
  });

  const text = extractTextContent(response);
  if (!text) {
    throw new Error('Anthropic response did not contain text.');
  }

  return normalizeAiAnalyzeResultSet(JSON.parse(extractJsonObjectText(text)));
}

function chooseProvider(preferredProvider: AIAnalyzeProvider | undefined) {
  const hasGemini = Boolean(getGeminiApiKey());
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY?.trim());

  if (preferredProvider === 'local') {
    return 'local' as const;
  }
  if (preferredProvider === 'gemini' && hasGemini) {
    return 'gemini' as const;
  }
  if (preferredProvider === 'anthropic' && hasAnthropic) {
    return 'anthropic' as const;
  }
  if (hasGemini) {
    return 'gemini' as const;
  }
  if (hasAnthropic) {
    return 'anthropic' as const;
  }
  return 'local' as const;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<AIAnalyzeRequestPayload>;
    const validationInput = body.validationInput;

    if (!isLightweightValidationInput(validationInput)) {
      return NextResponse.json(
        { error: 'AI analyze payload is invalid.' },
        { status: 400 }
      );
    }

    const guard = guardAiRequest(req, 'ai-analyze', {
      projectName: validationInput.source.project_name,
      componentCount: validationInput.components.length,
      validationFlagCount: validationInput.validation_flags?.length ?? 0,
      codePinUsageCount: validationInput.code_pin_usage?.length ?? 0,
    });

    if (!guard.ok) {
      return NextResponse.json(
        { error: guard.error, details: guard.details },
        {
          status: guard.status,
          headers: guard.retryAfterSec
            ? { 'Retry-After': String(guard.retryAfterSec) }
            : undefined,
        }
      );
    }

    const provider = chooseProvider(body.preferredProvider);
    const deterministic = buildDeterministicResult(validationInput);
    let aiResult: AIAnalyzeResultSet = {
      semanticIssues: [],
      recommendations: [],
    };
    let fallbackUsed = false;
    let providerModel = body.preferredModel;

    if (provider === 'local') {
      fallbackUsed = true;
    } else {
      try {
        aiResult =
          provider === 'gemini'
            ? await runGeminiAnalyze(validationInput, body.preferredModel)
            : await runAnthropicAnalyze(validationInput, body.preferredModel);
      } catch (error) {
        console.warn('[AI Analyze Fallback]', error);
        fallbackUsed = true;
        providerModel = undefined;
      }
    }

    const result: AIAnalyzeResponse = {
      deterministic,
      ai: {
        ...aiResult,
        provider,
        ...(providerModel ? { model: providerModel } : {}),
        fallbackUsed,
      },
      semanticIssues: [...deterministic.semanticIssues, ...aiResult.semanticIssues],
      recommendations: [...deterministic.recommendations, ...aiResult.recommendations],
    };

    return NextResponse.json<AIAnalyzeResponse>(result, { status: 200 });
  } catch (error) {
    console.error('[AI Analyze Error]', error);
    return NextResponse.json(
      { error: 'AI analysis failed.' },
      { status: 500 }
    );
  }
}
