const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash';
const DEFAULT_GEMINI_MAX_RETRIES = Number(process.env.GEMINI_MAX_RETRIES ?? 3);
const DEFAULT_GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS ?? 20000);
const DEFAULT_GEMINI_BACKOFF_MS = [1000, 2000, 4000] as const;

interface GeminiGenerateTextParams {
  prompt: string;
  systemInstruction?: string;
  temperature?: number;
  maxOutputTokens?: number;
  topP?: number;
  topK?: number;
  model?: string;
}

interface GeminiInlineDataPart {
  inline_data: {
    mime_type: string;
    data: string;
  };
}

interface GeminiPlainTextPart {
  text: string;
}

export type GeminiContentPart = GeminiPlainTextPart | GeminiInlineDataPart;

interface GeminiGenerateContentParams {
  contents: Array<{
    role: 'user';
    parts: GeminiContentPart[];
  }>;
  systemInstruction?: string;
  temperature?: number;
  maxOutputTokens?: number;
  topP?: number;
  topK?: number;
  model?: string;
}

interface GeminiTextPart {
  text?: string;
}

interface GeminiCandidate {
  content?: {
    parts?: GeminiTextPart[];
  };
}

interface GeminiGenerateContentResponse {
  candidates?: GeminiCandidate[];
}

interface GeminiErrorPayload {
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

export function getGeminiApiKey() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  return apiKey && !apiKey.includes('your_') ? apiKey : null;
}

export function getGeminiModel() {
  return DEFAULT_GEMINI_MODEL;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseRetryAfterMs(value: string | null) {
  if (!value) {
    return null;
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric >= 0) {
    return Math.round(numeric * 1000);
  }

  const timestamp = Date.parse(value);
  if (Number.isFinite(timestamp)) {
    return Math.max(0, timestamp - Date.now());
  }

  return null;
}

export function isRetryableGeminiStatus(status: number) {
  return status === 429 || status === 503 || status === 504;
}

function getGeminiBackoffMs(attempt: number) {
  return DEFAULT_GEMINI_BACKOFF_MS[Math.min(attempt, DEFAULT_GEMINI_BACKOFF_MS.length - 1)] ?? 4000;
}

function formatGeminiError(status: number, payload: GeminiErrorPayload | null, fallbackText: string) {
  if (payload?.error) {
    return `Gemini request failed: ${status} ${JSON.stringify(payload, null, 2)}`;
  }
  return `Gemini request failed: ${status} ${fallbackText}`;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError';
}

function extractGeminiText(data: GeminiGenerateContentResponse) {
  const text = data.candidates?.[0]?.content?.parts
    ?.map(part => part.text ?? '')
    .join('')
    .trim();

  if (!text) {
    throw new Error('Gemini response did not contain text.');
  }

  return text;
}

export async function generateGeminiContent(params: GeminiGenerateContentParams) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Gemini API key is not configured.');
  }

  const model = params.model?.trim() || DEFAULT_GEMINI_MODEL;
  const maxRetries = Number.isFinite(DEFAULT_GEMINI_MAX_RETRIES) && DEFAULT_GEMINI_MAX_RETRIES >= 0
    ? Math.floor(DEFAULT_GEMINI_MAX_RETRIES)
    : 3;
  const timeoutMs = Number.isFinite(DEFAULT_GEMINI_TIMEOUT_MS) && DEFAULT_GEMINI_TIMEOUT_MS > 0
    ? Math.floor(DEFAULT_GEMINI_TIMEOUT_MS)
    : 20000;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const abortController = new AbortController();
    const timeoutHandle = setTimeout(() => abortController.abort(), timeoutMs);
    let response: Response;

    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-goog-api-key': apiKey,
          },
          body: JSON.stringify({
            system_instruction: params.systemInstruction
              ? {
                  parts: [{ text: params.systemInstruction }],
                }
              : undefined,
            contents: params.contents,
            generationConfig: {
              temperature: params.temperature ?? 0.2,
              maxOutputTokens: params.maxOutputTokens ?? 2048,
              topP: params.topP ?? 0.9,
              topK: params.topK ?? 20,
            },
          }),
          signal: abortController.signal,
        }
      );
    } catch (error) {
      clearTimeout(timeoutHandle);
      if (isAbortError(error)) {
        lastError = new Error(`Gemini request timed out after ${timeoutMs}ms`);
      } else if (error instanceof Error) {
        lastError = error;
      } else {
        lastError = new Error(String(error));
      }

      if (attempt === maxRetries) {
        throw lastError;
      }

      await sleep(getGeminiBackoffMs(attempt));
      continue;
    }
    clearTimeout(timeoutHandle);

    if (response.ok) {
      const data = (await response.json()) as GeminiGenerateContentResponse;
      return extractGeminiText(data);
    }

    const errorText = await response.text();
    let parsedError: GeminiErrorPayload | null = null;
    try {
      parsedError = JSON.parse(errorText) as GeminiErrorPayload;
    } catch {
      parsedError = null;
    }

    lastError = new Error(formatGeminiError(response.status, parsedError, errorText));
    if (!isRetryableGeminiStatus(response.status) || attempt === maxRetries) {
      throw lastError;
    }

    const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
    await sleep(retryAfterMs ?? getGeminiBackoffMs(attempt));
  }

  throw lastError ?? new Error('Gemini request failed without a response.');
}

export async function generateGeminiText(params: GeminiGenerateTextParams) {
  return generateGeminiContent({
    model: params.model,
    systemInstruction: params.systemInstruction,
    temperature: params.temperature,
    maxOutputTokens: params.maxOutputTokens,
    topP: params.topP,
    topK: params.topK,
    contents: [
      {
        role: 'user',
        parts: [{ text: params.prompt }],
      },
    ],
  });
}
