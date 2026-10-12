import { ProviderError } from '../errors.js';

const REQUEST_TIMEOUT_MS = 120_000;

export async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<any> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw ProviderError.fromThrown(error);
  }

  const text = await response.text();
  if (!response.ok) {
    throw ProviderError.fromHttp(response.status, text, parseRetryAfter(response.headers));
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new ProviderError('provider returned invalid JSON', 'unknown');
  }
}

function parseRetryAfter(headers: Headers): number | undefined {
  const seconds = Number(headers.get('retry-after'));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
}
