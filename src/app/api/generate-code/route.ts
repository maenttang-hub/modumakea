import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import type { AICodeGenerationMeta, AICodeGenerationPayload } from '@/types';
import { buildWiringPrompt } from '@/lib/prompt-builder';
import { generateLocalFallbackCode } from '@/lib/fallback-generator';
import { guardAiRequest } from '@/lib/server/ai-request-guard';
import { auditApiRequest, buildApiResponseHeaders, createApiRequestContext } from '@/lib/server/api-request';
import { generateGeminiText, getGeminiApiKey, getGeminiModel } from '@/lib/server/gemini';
import { buildCompilerManifest } from '@/lib/platformio-manifest';
import { reviewGeneratedCodeQuality } from '@/lib/code-generation-quality';
import { detectPromptInjectionRisk, sanitizeMultilineText, sanitizePlainText } from '@/lib/security-input';

const ANTHROPIC_CODE_MODEL = 'claude-3-5-sonnet-20240620';

function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  return new Anthropic({ apiKey });
}

/**
 * 보드와 타겟 언어에 따라 동적으로 시스템 프롬프트 생성
 */
function buildSystemPrompt(payload: AICodeGenerationPayload): string {
  const { boardName, chipset, targetLanguage } = payload;

  if (targetLanguage === 'Python') {
    return `
You are an expert embedded Python developer specializing in Raspberry Pi GPIO programming.
Hardware Target: ${boardName} (${chipset})
Target Language: Python 3

CRITICAL RULES:
1. Output ONLY raw Python code. NO markdown code blocks (no \`\`\`python).
2. DO NOT output any explanations, comments outside the code, or conversational text.
3. Use 'gpiozero' library as the primary GPIO library (preferred for Raspberry Pi).
4. Alternatively, you may use 'RPi.GPIO' if gpiozero is insufficient.
5. Add clear Korean comments inside the code explaining pin usage and logic.
6. Include necessary imports at the top.
7. Wrap the main loop in try/finally to ensure GPIO.cleanup() is called.
8. Follow the pin mapping specification EXACTLY as provided.
9. Choose the simplest stable implementation that will actually run on the declared board.
10. Before finalizing, internally verify that every referenced pin exists in the wiring spec.
If you violate these rules, the system will crash.
`.trim();
  }

  // C++ (Arduino / ESP32)
  const isESP32 = chipset.includes('ESP32');
  const espHint = isESP32
    ? `\n8. For ESP32: You may use ESP32-specific features like WiFi.h, BLE, or dual-core capabilities if relevant.`
    : '';

  return `
You are a highly precise Arduino C++ code generator.
Hardware Target: ${boardName} (${chipset})
Target Language: C++ (Arduino Framework)

CRITICAL RULES:
1. Output ONLY raw C++ code. NO markdown code blocks (no \`\`\`cpp).
2. DO NOT output any introductory or concluding text.
3. Use standard Arduino libraries compatible with ${chipset}.
4. Add clear Korean comments explaining pin configurations and loop logic.
5. Ensure setup() and loop() functions are correctly structured.
6. Include all necessary #include statements for libraries.
7. Add Serial.begin(9600) in setup() for debugging.${espHint}
8. Follow the pin mapping specification EXACTLY as provided.
9. Choose a compile-friendly beginner-safe sketch, not a speculative abstraction.
10. Before finalizing, internally verify setup()/loop() exist and every pin reference matches the wiring spec.
If you violate these rules, the system will crash.
`.trim();
}

function cleanGeneratedCode(codeContent: string) {
  return codeContent
    .replace(/^```(?:cpp|arduino|c\+\+|python|py)?\n?/im, '')
    .replace(/```\s*$/im, '')
    .trim();
}

function buildRepairPrompt(payload: AICodeGenerationPayload, previousCode: string, issueMessages: string[]) {
  const topIssues = issueMessages.slice(0, 6).map(message => `- ${message}`).join('\n');

  return `
${buildWiringPrompt(payload)}

[Previous Draft]
${previousCode}

[Validation Failures To Fix]
${topIssues}

Rewrite the full ${payload.targetLanguage} code from scratch.
Return code only. Do not explain the fixes.
  `.trim();
}

async function generateAnthropicCode(systemPrompt: string, userPrompt: string) {
  const anthropic = getAnthropicClient();
  if (!anthropic) {
    throw new Error('AI 클라이언트를 초기화할 수 없습니다.');
  }

  const response = await anthropic.messages.create({
    model: ANTHROPIC_CODE_MODEL,
    max_tokens: 2000,
    temperature: 0.2,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const first = response.content[0];
  return first.type === 'text' ? first.text : '';
}

async function buildLocalFallbackResult(body: AICodeGenerationPayload) {
  const fallbackCode = generateLocalFallbackCode(body);
  const review = await reviewGeneratedCodeQuality(body, fallbackCode);
  const compilerManifest = buildCompilerManifest(body, fallbackCode);
  return {
    codeContent: fallbackCode,
    aiMeta: {
      provider: 'local',
      model: 'local-fallback-v1',
      label: 'Local Fallback',
      fallback: true,
      reviewIssueCount: review.issueCount,
      reviewErrorCount: review.errorCount,
    } satisfies AICodeGenerationMeta,
    compilerManifest,
    fallback: true,
  };
}

export async function POST(req: Request) {
  const api = createApiRequestContext(req, 'generate-code');
  auditApiRequest(api, 'start');
  try {
    // 1. 요청 파싱
    const rawBody = (await req.json()) as AICodeGenerationPayload;

    const body: AICodeGenerationPayload = {
      ...rawBody,
      boardId: sanitizePlainText(rawBody.boardId, { maxLength: 32 }),
      boardName: sanitizePlainText(rawBody.boardName, { maxLength: 80 }),
      chipset: sanitizePlainText(rawBody.chipset, { maxLength: 80 }),
      userIntent: rawBody.userIntent
        ? sanitizeMultilineText(rawBody.userIntent, { maxLength: 1200 })
        : undefined,
      connectedComponents: Array.isArray(rawBody.connectedComponents)
        ? rawBody.connectedComponents.map(component => ({
            ...component,
            templateId: sanitizePlainText(component.templateId, { maxLength: 80 }),
            componentName: sanitizePlainText(component.componentName, { maxLength: 80 }),
            libraryIncludes: component.libraryIncludes?.map(include =>
              sanitizePlainText(include, { maxLength: 120 })
            ),
            aiHints: component.aiHints
              ? Object.fromEntries(
                  Object.entries(component.aiHints)
                    .map(([key, value]) => [
                      sanitizePlainText(key, { maxLength: 48 }),
                      sanitizeMultilineText(value, { maxLength: 600 }),
                    ])
                    .filter(([key, value]) => key && value)
                )
              : undefined,
          }))
        : [],
      installedLibraries: Array.isArray(rawBody.installedLibraries)
        ? rawBody.installedLibraries.map(library => ({
            name: sanitizePlainText(library.name, { maxLength: 120 }),
            version: sanitizePlainText(library.version, { maxLength: 40, fallback: 'latest' }),
            includes: Array.isArray(library.includes)
              ? library.includes.map(include => sanitizePlainText(include, { maxLength: 80 })).filter(Boolean)
              : [],
            author: library.author ? sanitizePlainText(library.author, { maxLength: 120 }) : undefined,
            sentence: library.sentence ? sanitizePlainText(library.sentence, { maxLength: 220 }) : undefined,
            category: library.category ? sanitizePlainText(library.category, { maxLength: 80 }) : undefined,
          }))
        : [],
    };

    if (!body?.connectedComponents || body.connectedComponents.length === 0) {
      return NextResponse.json(
        { error: '캔버스에 부품이 없습니다. 부품을 먼저 배치해주세요.', requestId: api.requestId },
        { status: 400, headers: buildApiResponseHeaders(api) }
      );
    }

    if (body.userIntent) {
      const risk = detectPromptInjectionRisk(body.userIntent);
      if (risk.blocked) {
        return NextResponse.json(
          {
            error: '동작 요구사항에 시스템 지시 변경으로 해석될 수 있는 문구가 포함되어 있습니다.',
            details: `차단된 패턴: ${risk.reasons.join(', ')}`,
            requestId: api.requestId,
          },
          { status: 400, headers: buildApiResponseHeaders(api) }
        );
      }
    }

    const guard = guardAiRequest(req, 'ai-code', {
      boardId: body.boardId,
      boardName: body.boardName,
      targetLanguage: body.targetLanguage,
      userIntent: body.userIntent,
      connectedComponents: body.connectedComponents.map(component => ({
        componentName: component.componentName,
        pinConnections: component.pinConnections,
      })),
    });

    if (!guard.ok) {
      return NextResponse.json(
        { error: guard.error, details: guard.details },
        {
          status: guard.status,
          headers: buildApiResponseHeaders(
            api,
            guard.retryAfterSec
              ? { 'Retry-After': String(guard.retryAfterSec) }
              : undefined
          ),
        }
      );
    }

    // 2. API 키 확인 (비어 있거나 placeholder 상태일 때 로컬 룰 기반 코드 생성으로 대응)
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY ?? '';
    const hasAnthropicKey = Boolean(anthropicApiKey && !anthropicApiKey.includes('your_') && anthropicApiKey.trim() !== '');
    const hasGeminiKey = Boolean(getGeminiApiKey());

    if (!hasAnthropicKey && !hasGeminiKey) {
      const localResult = await buildLocalFallbackResult(body);
      return NextResponse.json(
        {
          code: localResult.codeContent,
          compilerManifest: localResult.compilerManifest,
          aiMeta: localResult.aiMeta,
          fallback: true,
          requestId: api.requestId,
        },
        { status: 200, headers: buildApiResponseHeaders(api) }
      );
    }

    // 3. 보드별 시스템 프롬프트 동적 생성
    const systemPrompt = buildSystemPrompt(body);

    // 4. 사용자 프롬프트 (배선 명세서) 조립
    const userPrompt = `
${buildWiringPrompt(body)}

Generate the ${body.targetLanguage} code now based on the CRITICAL RULES.
    `.trim();

    // 5. Gemini 우선, 실패 시 Anthropic, 마지막으로 로컬 폴백
    try {
      let codeContent = '';
      let aiMeta: AICodeGenerationMeta | null = null;

      if (hasGeminiKey) {
        const geminiModel = getGeminiModel();
        codeContent = await generateGeminiText({
          model: geminiModel,
          systemInstruction: systemPrompt,
          prompt: userPrompt,
          temperature: 0.1,
          topP: 0.8,
          topK: 12,
          maxOutputTokens: 2000,
        });
        codeContent = cleanGeneratedCode(codeContent);

        const review = await reviewGeneratedCodeQuality(body, codeContent);
        if (!review.acceptable) {
          codeContent = await generateGeminiText({
            model: geminiModel,
            systemInstruction: systemPrompt,
            prompt: buildRepairPrompt(
              body,
              codeContent,
              review.issues.map(issue => `${issue.title}: ${issue.message}`)
            ),
            temperature: 0.05,
            topP: 0.75,
            topK: 10,
            maxOutputTokens: 2200,
          });
          codeContent = cleanGeneratedCode(codeContent);
          const repairedReview = await reviewGeneratedCodeQuality(body, codeContent);

          aiMeta = {
            provider: 'gemini',
            model: geminiModel,
            label: 'Gemini',
            repaired: true,
            reviewIssueCount: repairedReview.issueCount,
            reviewErrorCount: repairedReview.errorCount,
          };

          if (!repairedReview.acceptable && hasAnthropicKey) {
            codeContent = cleanGeneratedCode(await generateAnthropicCode(systemPrompt, userPrompt));
            const anthropicReview = await reviewGeneratedCodeQuality(body, codeContent);
            if (anthropicReview.acceptable) {
              aiMeta = {
                provider: 'anthropic',
                model: ANTHROPIC_CODE_MODEL,
                label: 'Claude',
                fallback: true,
                reviewIssueCount: anthropicReview.issueCount,
                reviewErrorCount: anthropicReview.errorCount,
              };
            } else {
              const localResult = await buildLocalFallbackResult(body);
              codeContent = localResult.codeContent;
              aiMeta = localResult.aiMeta;
            }
          } else if (!repairedReview.acceptable) {
            const localResult = await buildLocalFallbackResult(body);
            codeContent = localResult.codeContent;
            aiMeta = localResult.aiMeta;
          }
        } else {
          aiMeta = {
            provider: 'gemini',
            model: geminiModel,
            label: 'Gemini',
            reviewIssueCount: review.issueCount,
            reviewErrorCount: review.errorCount,
          };
        }
      } else {
        codeContent = cleanGeneratedCode(await generateAnthropicCode(systemPrompt, userPrompt));
        const review = await reviewGeneratedCodeQuality(body, codeContent);
        if (review.acceptable) {
          aiMeta = {
            provider: 'anthropic',
            model: ANTHROPIC_CODE_MODEL,
            label: 'Claude',
            reviewIssueCount: review.issueCount,
            reviewErrorCount: review.errorCount,
          };
        } else {
          const localResult = await buildLocalFallbackResult(body);
          codeContent = localResult.codeContent;
          aiMeta = localResult.aiMeta;
        }
      }

      if (!codeContent) {
        throw new Error('AI 응답 코드가 비어 있습니다.');
      }

      const compilerManifest = buildCompilerManifest(body, codeContent);

      auditApiRequest(api, 'success', { status: 200, provider: aiMeta?.provider ?? 'unknown' });
      return NextResponse.json(
        { code: codeContent, compilerManifest, aiMeta, fallback: aiMeta?.fallback ?? false, requestId: api.requestId },
        { status: 200, headers: buildApiResponseHeaders(api) }
      );
    } catch (err: unknown) {
      console.warn('[AI Code Generation Fallback]', err);
      const localResult = await buildLocalFallbackResult(body);
      auditApiRequest(api, 'success', { status: 200, provider: 'local', fallback: true });
      return NextResponse.json(
        {
          code: localResult.codeContent,
          compilerManifest: localResult.compilerManifest,
          fallback: true,
          aiMeta: localResult.aiMeta,
          requestId: api.requestId,
        },
        { status: 200, headers: buildApiResponseHeaders(api) }
      );
    }

  } catch (err: unknown) {
    console.error('[AI Code Generation Error]', err);
    const message = err instanceof Error ? err.message : '알 수 없는 오류';
    auditApiRequest(api, 'error', { status: 500, message });
    return NextResponse.json(
      {
        error:   '코드 생성 중 AI 서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
        details: message,
        requestId: api.requestId,
      },
      { status: 500, headers: buildApiResponseHeaders(api) }
    );
  }
}
