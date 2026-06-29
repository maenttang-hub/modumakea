import { NextResponse } from 'next/server';
import type { AICodeGenerationPayload } from '@/types';
import {
  auditApiRequest,
  buildApiResponseHeaders,
  createApiRequestContext,
} from '@/lib/server/api-request';
import { buildCompilerPreflightResponse } from '@/lib/platformio-manifest';
import { sanitizeMultilineText, sanitizePlainText } from '@/lib/security-input';

export const dynamic = 'force-dynamic';

interface CompilePreflightRequest {
  payload: AICodeGenerationPayload;
  code?: string;
}

export async function POST(req: Request) {
  const api = createApiRequestContext(req, 'compile.preflight');
  auditApiRequest(api, 'start');
  try {
    const rawBody = (await req.json()) as CompilePreflightRequest;
    if (!rawBody?.payload) {
      return NextResponse.json(
        { error: '컴파일 사전 점검에 필요한 payload가 없습니다.', requestId: api.requestId },
        { status: 400, headers: buildApiResponseHeaders(api) }
      );
    }

    const payload: AICodeGenerationPayload = {
      ...rawBody.payload,
      boardId: sanitizePlainText(rawBody.payload.boardId, { maxLength: 32 }),
      boardName: sanitizePlainText(rawBody.payload.boardName, { maxLength: 80 }),
      chipset: sanitizePlainText(rawBody.payload.chipset, { maxLength: 80 }),
      userIntent: rawBody.payload.userIntent
        ? sanitizeMultilineText(rawBody.payload.userIntent, { maxLength: 1200 })
        : undefined,
      connectedComponents: Array.isArray(rawBody.payload.connectedComponents)
        ? rawBody.payload.connectedComponents.map(component => ({
            ...component,
            templateId: sanitizePlainText(component.templateId, { maxLength: 80 }),
            componentName: sanitizePlainText(component.componentName, { maxLength: 80 }),
            libraryIncludes: component.libraryIncludes?.map(include =>
              sanitizePlainText(include, { maxLength: 120 })
            ),
          }))
        : [],
      installedLibraries: Array.isArray(rawBody.payload.installedLibraries)
        ? rawBody.payload.installedLibraries.map(library => ({
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

    const code = rawBody.code
      ? sanitizeMultilineText(rawBody.code, { maxLength: 30000 })
      : '';

    const preflight = buildCompilerPreflightResponse(payload, code);
    auditApiRequest(api, 'success', { status: 200, boardId: payload.boardId });
    return NextResponse.json(
      { ...preflight, requestId: api.requestId },
      { status: 200, headers: buildApiResponseHeaders(api) }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '컴파일 사전 점검에 실패했습니다.';
    auditApiRequest(api, 'error', { status: 500, message });
    return NextResponse.json(
      { error: message, requestId: api.requestId },
      { status: 500, headers: buildApiResponseHeaders(api) }
    );
  }
}
