import { CooldownTracker, formatDuration } from './cooldowns.js';
import { ERROR_LABELS, ProviderError } from './errors.js';
import { whyCannotHandle, type Provider } from './providers/provider.js';
import type { Candidate, Input, Routing } from './types.js';

const MAX_ATTEMPTS_PER_MODEL = 2;
const MAX_QUICK_RETRY_MS = 5000;
const DEFAULT_RETRY_DELAY_MS = 1500;

export interface RouteResult {
  output: string;
  provider: string;
  model: string;
  /** Models that were tried first and failed, e.g. "gemini/gemini-3.8-flash (quota exhausted)". */
  fallbacks: string[];
}

export interface RouterDeps {
  routing: Routing;
  providers: Map<string, Provider>;
  cooldowns: CooldownTracker;
}

export class NoRouteError extends Error {}

const label = (c: Candidate) => `${c.provider}/${c.model}`;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sends the input to the first model configured for its kind that is available,
 * able to handle it, and not cooling down. If a model fails (quota, rate limit,
 * outage, ...) it moves on to the next one automatically.
 */
export async function respond(input: Input, { routing, providers, cooldowns }: RouterDeps): Promise<RouteResult> {
  const eligible = pickEligible(input, routing[input.kind], providers);
  const fallbacks: string[] = [];
  const tried = new Set<string>();

  // Pass 1 skips models that are cooling down. If that leaves nothing to try, pass 2 tries them
  // anyway - a cooldown is a best guess, and a possibly-working model beats giving up.
  for (const respectCooldowns of [true, false]) {
    for (const candidate of eligible) {
      const key = CooldownTracker.keyOf(candidate);
      if (tried.has(key) || cooldowns.disabledReason(candidate)) continue;

      const waitMs = cooldowns.remainingMs(candidate);
      if (respectCooldowns && waitMs > 0) {
        console.log(`⏸️  Skipping ${label(candidate)} (cooling down, ~${formatDuration(waitMs)} left)`);
        continue;
      }

      tried.add(key);
      const provider = providers.get(candidate.provider)!;

      try {
        const output = await generateWithQuickRetry(provider, candidate, input);
        return { output, provider: candidate.provider, model: candidate.model, fallbacks };
      } catch (error) {
        const failure = ProviderError.fromThrown(error);
        cooldowns.recordFailure(candidate, failure);
        fallbacks.push(`${label(candidate)} (${ERROR_LABELS[failure.kind]})`);
        console.log(`⚠️  ${label(candidate)} failed: ${ERROR_LABELS[failure.kind]} - ${failure.message}`);
      }
    }
  }

  throw new Error(
    `Every model for "${input.kind}" failed or is unavailable:\n${fallbacks.map((f) => `  - ${f}`).join('\n')}`,
  );
}

/** Filters the configured models for this kind down to ones that can actually serve the input. */
function pickEligible(input: Input, candidates: Candidate[], providers: Map<string, Provider>): Candidate[] {
  const notes: string[] = [];
  const eligible: Candidate[] = [];

  for (const candidate of candidates) {
    const provider = providers.get(candidate.provider);
    if (!provider) {
      notes.push(`${label(candidate)}: provider not configured (no API key)`);
      continue;
    }
    const reason = whyCannotHandle(provider, input);
    if (reason) {
      notes.push(`${label(candidate)}: ${reason}`);
      continue;
    }
    eligible.push(candidate);
  }

  if (eligible.length === 0) {
    const detail = notes.length ? notes.map((n) => `  - ${n}`).join('\n') : '  (no models configured for this type in routing.json)';
    throw new NoRouteError(`No model available for "${input.kind}" input:\n${detail}`);
  }
  return eligible;
}

/** One quick retry for blips (overloaded, network, very short rate limits) before switching models. */
async function generateWithQuickRetry(provider: Provider, candidate: Candidate, input: Input): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    console.log(`🧠 Using ${label(candidate)}${attempt > 1 ? ` (retry ${attempt - 1})` : ''}...`);
    try {
      return await provider.generate({ model: candidate.model, prompt: input.prompt, attachment: input.attachment });
    } catch (error) {
      const failure = ProviderError.fromThrown(error);
      if (attempt < MAX_ATTEMPTS_PER_MODEL && isQuickRetryable(failure)) {
        await sleep(failure.retryAfterMs ?? DEFAULT_RETRY_DELAY_MS);
        continue;
      }
      throw failure;
    }
  }
}

function isQuickRetryable(error: ProviderError): boolean {
  if (error.kind === 'overloaded' || error.kind === 'network') return true;
  return error.kind === 'rate_limit' && (error.retryAfterMs ?? Infinity) <= MAX_QUICK_RETRY_MS;
}
