import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { normalizeAiConceptLayout } from '@/lib/ai-concept-layout';
import { normalizeAiConceptCompanionTopology } from '@/lib/ai-design-normalize';
import { generateLocalConceptDesign } from '@/lib/concept-fallback';
import { validateAiConceptDesignResult } from '@/lib/ai-design-schema';
import { buildConceptDesignPrompt } from '@/lib/prompt-builder';
import { guardAiRequest } from '@/lib/server/ai-request-guard';
import { generateGeminiText, getGeminiApiKey, getGeminiModel } from '@/lib/server/gemini';
import { detectPromptInjectionRisk, sanitizeMultilineText, sanitizePlainText } from '@/lib/security-input';
import type {
  AIConceptDesignContext,
  AIConceptDesignMeta,
  AIConceptDesignResult,
  AIConceptErrorResponse,
  AIConceptRequestPayload,
  CustomComponentPackage,
} from '@/types';
import { validateCustomComponentPackage } from '@/lib/custom-component-packages';

const ANTHROPIC_CONCEPT_MODEL = 'claude-3-5-sonnet-20240620';
const LOCAL_CONCEPT_MODEL = 'local-concept-fallback-v1';

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

function coerceCurrentDesign(value: unknown): AIConceptDesignContext | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const candidate = value as Partial<AIConceptDesignContext>;
  if (typeof candidate.boardId !== 'string' || !Array.isArray(candidate.components) || !Array.isArray(candidate.usedBoardPins) || !Array.isArray(candidate.lockedBoardPins)) {
    return undefined;
  }

  return {
    boardId: candidate.boardId,
    components: candidate.components.filter(
      component =>
        component &&
        typeof component === 'object' &&
        typeof component.instanceId === 'string' &&
        typeof component.templateId === 'string' &&
        typeof component.name === 'string' &&
        typeof component.position?.x === 'number' &&
        typeof component.position?.y === 'number' &&
        typeof component.rotation === 'number' &&
        component.assignedPins &&
        typeof component.assignedPins === 'object'
    ) as AIConceptDesignContext['components'],
    usedBoardPins: candidate.usedBoardPins.filter((pin): pin is string => typeof pin === 'string'),
    lockedBoardPins: candidate.lockedBoardPins.filter((pin): pin is string => typeof pin === 'string'),
  };
}

function coerceCustomComponents(value: unknown): CustomComponentPackage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap(item => {
    const result = validateCustomComponentPackage(item);
    return result.valid ? [result.data] : [];
  });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<AIConceptRequestPayload>;
    const concept = sanitizeMultilineText(body.concept, { maxLength: 1600 });
    const preferredBoardId =
      typeof body.preferredBoardId === 'string' && body.preferredBoardId.trim().length > 0
        ? sanitizePlainText(body.preferredBoardId, { maxLength: 32 })
        : undefined;
    const currentDesign = coerceCurrentDesign(body.currentDesign);
    const availableCustomComponents = coerceCustomComponents(body.availableCustomComponents);

    if (!concept) {
      return NextResponse.json<AIConceptErrorResponse>(
        { error: '컨셉 설명이 비어 있습니다.' },
        { status: 400 }
      );
    }

    const risk = detectPromptInjectionRisk(concept);
    if (risk.blocked) {
      return NextResponse.json<AIConceptErrorResponse>(
        {
          error: '컨셉 설명에 시스템 지시 변경으로 해석될 수 있는 문구가 포함되어 있습니다.',
          details: `차단된 패턴: ${risk.reasons.join(', ')}`,
        },
        { status: 400 }
      );
    }

    const guard = guardAiRequest(req, 'ai-concept', {
      concept,
      preferredBoardId,
      currentDesign,
      availableCustomComponents: availableCustomComponents.map(component => component.templateId),
    });

    if (!guard.ok) {
      return NextResponse.json<AIConceptErrorResponse>(
        { error: guard.error, details: guard.details },
        {
          status: guard.status,
          headers: guard.retryAfterSec
            ? { 'Retry-After': String(guard.retryAfterSec) }
            : undefined,
        }
      );
    }

    const anthropicApiKey = process.env.ANTHROPIC_API_KEY ?? '';
    const hasAnthropicKey = Boolean(anthropicApiKey && !anthropicApiKey.includes('your_') && anthropicApiKey.trim() !== '');
    const hasGeminiKey = Boolean(getGeminiApiKey());

    const buildLocalResult = (fallback = false): AIConceptDesignResult => ({
      ...generateLocalConceptDesign(concept, preferredBoardId, currentDesign, availableCustomComponents),
      meta: {
        provider: 'local',
        model: LOCAL_CONCEPT_MODEL,
        label: 'Local 설계',
        fallback,
      },
    });

    const attachMeta = (draft: AIConceptDesignResult, meta: AIConceptDesignMeta): AIConceptDesignResult => ({
      ...draft,
      meta,
    });

    let result: AIConceptDesignResult;
    if (!hasAnthropicKey && !hasGeminiKey) {
      result = buildLocalResult(false);
    } else {
      try {
        const prompt = buildConceptDesignPrompt(concept, preferredBoardId, currentDesign, availableCustomComponents);
        let text = '';
        let meta: AIConceptDesignMeta;
        if (hasGeminiKey) {
          const geminiModel = getGeminiModel();
          text = await generateGeminiText({
            model: geminiModel,
            prompt,
            systemInstruction:
              'Return exactly one valid JSON object and nothing else. No markdown, no prose, no code fences.',
            temperature: 0.2,
            maxOutputTokens: 4000,
          });
          meta = {
            provider: 'gemini',
            model: geminiModel,
            label: 'Gemini 설계',
          };
        } else {
          const anthropic = getAnthropicClient();
          if (!anthropic) {
            throw new Error('AI 클라이언트를 초기화할 수 없습니다.');
          }

          const response = await anthropic.messages.create({
            model: ANTHROPIC_CONCEPT_MODEL,
            max_tokens: 4000,
            temperature: 0.2,
            messages: [{ role: 'user', content: prompt }],
          });

          text = extractTextContent(response);
          meta = {
            provider: 'anthropic',
            model: ANTHROPIC_CONCEPT_MODEL,
            label: 'Claude 설계',
          };
        }

        if (!text) {
          throw new Error('AI 응답이 비어 있습니다.');
        }

        try {
          result = attachMeta(JSON.parse(extractJsonObjectText(text)) as AIConceptDesignResult, meta);
        } catch {
          throw new Error(`AI 응답이 JSON 형식이 아닙니다: ${text.slice(0, 300)}`);
        }
      } catch (error) {
        console.warn('[AI Concept Design Fallback]', error);
        result = buildLocalResult(true);
      }
    }

    const layoutNormalizedResult = normalizeAiConceptLayout(result, currentDesign);
    const normalizedResult = normalizeAiConceptCompanionTopology(layoutNormalizedResult);
    const validation = validateAiConceptDesignResult(normalizedResult);
    if (!validation.valid || !validation.data) {
      return NextResponse.json<AIConceptErrorResponse>(
        { error: 'AI 설계 결과 검증에 실패했습니다.', details: validation.errors },
        { status: 400 }
      );
    }

    return NextResponse.json<AIConceptDesignResult>(validation.data, { status: 200 });
  } catch (error) {
    console.error('[AI Concept Design Error]', error);
    const details = error instanceof Error ? error.message : '알 수 없는 오류';
    return NextResponse.json<AIConceptErrorResponse>(
      {
        error: 'AI 컨셉 설계 생성 중 서버 오류가 발생했습니다.',
        details,
      },
      { status: 500 }
    );
  }
}
