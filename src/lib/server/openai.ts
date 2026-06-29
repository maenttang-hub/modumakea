const DEFAULT_OPENAI_MODEL = process.env.OPENAI_MODEL?.trim() || 'gpt-4.1-mini';
const DEFAULT_OPENAI_MAX_RETRIES = Number(process.env.OPENAI_MAX_RETRIES ?? 3);
const DEFAULT_OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS ?? 20000);
const DEFAULT_OPENAI_BACKOFF_MS = [1000, 2000, 4000] as const;

interface OpenAIInputTextPart {
  type: 'input_text';
  text: string;
}

interface OpenAIInputImagePart {
  type: 'input_image';
  image_url: string;
  detail?: 'low' | 'high' | 'auto';
}

export type OpenAIInputPart = OpenAIInputTextPart | OpenAIInputImagePart;

interface OpenAIResponsesCreateParams {
  model?: string;
  input: Array<{
    role: 'user';
    content: OpenAIInputPart[];
  }>;
}

interface OpenAITextContentItem {
  type?: string;
  text?: string;
}

interface OpenAIOutputItem {
  type?: string;
  content?: OpenAITextContentItem[];
}

interface OpenAIResponsesCreateResponse {
  output?: OpenAIOutputItem[];
  output_text?: string;
}

interface OpenAIErrorPayload {
  error?: {
    message?: string;
    type?: string;
    code?: string | number | null;
  };
}

export function getOpenAIApiKey() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  return apiKey && !apiKey.includes('your_') ? apiKey : null;
}

export function getOpenAIModel() {
  return DEFAULT_OPENAI_MODEL;
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

export function isRetryableOpenAIStatus(status: number) {
  return status === 408 || status === 409 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function getOpenAIBackoffMs(attempt: number) {
  return DEFAULT_OPENAI_BACKOFF_MS[Math.min(attempt, DEFAULT_OPENAI_BACKOFF_MS.length - 1)] ?? 4000;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError';
}

function formatOpenAIError(status: number, payload: OpenAIErrorPayload | null, fallbackText: string) {
  if (payload?.error) {
    return `OpenAI request failed: ${status} ${JSON.stringify(payload, null, 2)}`;
  }
  return `OpenAI request failed: ${status} ${fallbackText}`;
}

function extractOpenAIOutputText(response: OpenAIResponsesCreateResponse) {
  if (typeof response.output_text === 'string' && response.output_text.trim().length > 0) {
    return response.output_text.trim();
  }

  const text = (response.output ?? [])
    .flatMap(item => item.content ?? [])
    .filter(item => item.type === 'output_text' || item.type === 'text' || typeof item.text === 'string')
    .map(item => item.text ?? '')
    .join('')
    .trim();

  if (!text) {
    throw new Error('OpenAI response did not contain text.');
  }

  return text;
}

export async function generateOpenAIResponse(params: OpenAIResponsesCreateParams) {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    throw new Error('OpenAI API key is not configured.');
  }

  const model = params.model?.trim() || DEFAULT_OPENAI_MODEL;
  const maxRetries = Number.isFinite(DEFAULT_OPENAI_MAX_RETRIES) && DEFAULT_OPENAI_MAX_RETRIES >= 0
    ? Math.floor(DEFAULT_OPENAI_MAX_RETRIES)
    : 3;
  const timeoutMs = Number.isFinite(DEFAULT_OPENAI_TIMEOUT_MS) && DEFAULT_OPENAI_TIMEOUT_MS > 0
    ? Math.floor(DEFAULT_OPENAI_TIMEOUT_MS)
    : 20000;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const abortController = new AbortController();
    const timeoutHandle = setTimeout(() => abortController.abort(), timeoutMs);
    let response: Response;

    try {
      response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          input: params.input,
        }),
        signal: abortController.signal,
      });
    } catch (error) {
      clearTimeout(timeoutHandle);
      if (isAbortError(error)) {
        lastError = new Error(`OpenAI request timed out after ${timeoutMs}ms`);
      } else if (error instanceof Error) {
        lastError = error;
      } else {
        lastError = new Error(String(error));
      }

      if (attempt === maxRetries) {
        throw lastError;
      }

      await sleep(getOpenAIBackoffMs(attempt));
      continue;
    }
    clearTimeout(timeoutHandle);

    if (response.ok) {
      const data = (await response.json()) as OpenAIResponsesCreateResponse;
      return extractOpenAIOutputText(data);
    }

    const errorText = await response.text();
    let parsedError: OpenAIErrorPayload | null = null;
    try {
      parsedError = JSON.parse(errorText) as OpenAIErrorPayload;
    } catch {
      parsedError = null;
    }

    lastError = new Error(formatOpenAIError(response.status, parsedError, errorText));
    if (!isRetryableOpenAIStatus(response.status) || attempt === maxRetries) {
      throw lastError;
    }

    const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
    await sleep(retryAfterMs ?? getOpenAIBackoffMs(attempt));
  }

  throw lastError ?? new Error('OpenAI request failed without a response.');
}
