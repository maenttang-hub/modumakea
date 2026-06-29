const CONTROL_CHAR_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const HTML_META_REGEX = /[<>]/g;
const BACKTICK_FENCE_REGEX = /`{3,}/g;

const PROMPT_INJECTION_PATTERNS: Array<{ id: string; regex: RegExp }> = [
  { id: 'ignore-instructions', regex: /\b(ignore|bypass|override)\b.{0,32}\b(previous|prior|system|developer|safety|instruction)s?\b/i },
  { id: 'role-hijack', regex: /\byou are now\b|\bact as\b.{0,24}\b(system|developer|shell|compiler|root)\b/i },
  { id: 'prompt-exfiltration', regex: /\b(reveal|print|show|leak|dump)\b.{0,32}\b(system prompt|developer prompt|hidden prompt|chain of thought|cot)\b/i },
  { id: 'filesystem-access', regex: /\b(read|open|cat|list|scan|exfiltrate)\b.{0,32}\b(file system|filesystem|\/etc\/|\.env|environment variable|secret|token|api key)\b/i },
  { id: 'shell-execution', regex: /\b(exec|execute|run|spawn)\b.{0,24}\b(shell|bash|terminal|command|powershell|sh)\b/i },
];

function clampText(value: string, maxLength: number) {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function normalizeWhitespace(value: string) {
  return value.replace(/\r\n/g, '\n').replace(/\t/g, ' ').replace(/[ ]{2,}/g, ' ').trim();
}

export function sanitizePlainText(value: unknown, options?: { maxLength?: number; fallback?: string }) {
  const fallback = options?.fallback ?? '';
  if (typeof value !== 'string') {
    return fallback;
  }

  const cleaned = clampText(
    normalizeWhitespace(
      value
        .replace(CONTROL_CHAR_REGEX, '')
        .replace(HTML_META_REGEX, '')
        .replace(BACKTICK_FENCE_REGEX, '`')
    ),
    options?.maxLength ?? 160
  );

  return cleaned || fallback;
}

export function sanitizeMultilineText(value: unknown, options?: { maxLength?: number; fallback?: string }) {
  const fallback = options?.fallback ?? '';
  if (typeof value !== 'string') {
    return fallback;
  }

  const cleaned = clampText(
    value
      .replace(CONTROL_CHAR_REGEX, '')
      .replace(HTML_META_REGEX, '')
      .replace(BACKTICK_FENCE_REGEX, '`')
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map(line => line.replace(/\t/g, ' ').replace(/[ ]{2,}/g, ' ').trimEnd())
      .join('\n')
      .trim(),
    options?.maxLength ?? 4000
  );

  return cleaned || fallback;
}

export function detectPromptInjectionRisk(value: string) {
  const reasons = PROMPT_INJECTION_PATTERNS
    .filter(pattern => pattern.regex.test(value))
    .map(pattern => pattern.id);

  return {
    blocked: reasons.length > 0,
    reasons,
  };
}
