export type ErrorKind =
  | 'quota' //       credits / daily quota used up
  | 'rate_limit' //  too many requests right now
  | 'overloaded' //  provider-side 5xx
  | 'network' //     timeout, DNS, connection reset
  | 'auth' //        bad or missing API key
  | 'not_found' //   model name doesn't exist
  | 'bad_request' // provider rejected this specific request
  | 'unknown';

export const ERROR_LABELS: Record<ErrorKind, string> = {
  quota: 'quota exhausted',
  rate_limit: 'rate limited',
  overloaded: 'service overloaded',
  network: 'network error',
  auth: 'authentication failed',
  not_found: 'model not found',
  bad_request: 'request rejected',
  unknown: 'unexpected error',
};

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly kind: ErrorKind,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }

  static fromHttp(status: number, body: string, retryAfterMs?: number): ProviderError {
    return new ProviderError(`HTTP ${status}: ${summarize(body)}`, classifyHttp(status, body), retryAfterMs);
  }

  static fromThrown(error: unknown): ProviderError {
    if (error instanceof ProviderError) return error;
    const message = error instanceof Error ? error.message : String(error);
    const looksLikeNetwork = /fetch failed|timeout|timed out|ECONN|ENOTFOUND|EAI_AGAIN|socket|network/i.test(message);
    return new ProviderError(summarize(message), looksLikeNetwork ? 'network' : 'unknown');
  }
}

const QUOTA_HINT = /insufficient_quota|exceeded your current quota|billing|credit balance|per.?day|daily|out of credits/i;
const BAD_KEY_HINT = /api key not valid|invalid api key|incorrect api key|invalid x-api-key/i;

export function classifyHttp(status: number, body: string): ErrorKind {
  if (status === 401 || status === 403 || BAD_KEY_HINT.test(body)) return 'auth';
  if (status === 404) return 'not_found';
  if (status === 402) return 'quota';
  if (status === 429) return QUOTA_HINT.test(body) ? 'quota' : 'rate_limit';
  if (status === 400 && QUOTA_HINT.test(body)) return 'quota'; // Anthropic reports empty credit as 400
  if (status === 408 || status >= 500) return 'overloaded'; // includes 503 and Anthropic's 529
  return 'bad_request';
}

/** Pulls a readable message out of a JSON error body, or trims raw text. */
function summarize(body: string): string {
  try {
    const parsed = JSON.parse(body);
    const message = parsed?.error?.message ?? parsed?.message;
    if (typeof message === 'string') return message.slice(0, 200);
  } catch {
    /* not JSON */
  }
  return body.replace(/\s+/g, ' ').slice(0, 200);
}
