function shouldRetryStatus(status: number, retryOnStatuses: number[]) {
  return retryOnStatuses.includes(status) || status >= 500;
}

export async function fetchWithRetry(
  input: string | URL | Request,
  init: RequestInit & { headers?: Record<string, string> },
  options: {
    requestId: string;
    retries?: number;
    retryOnStatuses?: number[];
    baseDelayMs?: number;
  }
) {
  const retries = options.retries ?? 2;
  const retryOnStatuses = options.retryOnStatuses ?? [408, 409, 425, 429];
  const baseDelayMs = options.baseDelayMs ?? 150;

  let lastResponse: Response | null = null;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(input, {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          'x-request-id': options.requestId,
        },
      });

      lastResponse = response;
      if (!shouldRetryStatus(response.status, retryOnStatuses) || attempt === retries) {
        return response;
      }
    } catch (error) {
      lastError = error;
      if (attempt === retries) {
        throw error;
      }
    }

    await new Promise(resolve => setTimeout(resolve, baseDelayMs * (attempt + 1)));
  }

  if (lastResponse) {
    return lastResponse;
  }

  throw lastError instanceof Error ? lastError : new Error('API request failed.');
}
