import * as fs from 'node:fs';
import type { ErrorKind, ProviderError } from './errors.js';
import type { Candidate } from './types.js';

const MINUTE = 60_000;

/** How long to avoid a model after a failure. `null` = don't remember it. */
const COOLDOWN_MS: Partial<Record<ErrorKind, number>> = {
  quota: 60 * MINUTE,
  overloaded: 0.5 * MINUTE,
  network: 0.5 * MINUTE,
};
const DEFAULT_RATE_LIMIT_MS = 1 * MINUTE;

/** Failures that mean "this setup is broken" - skip for the rest of this run, but don't persist. */
const SESSION_DISABLE: ErrorKind[] = ['auth', 'not_found'];

/**
 * Remembers which models recently failed so the router stops hammering them.
 * Cooldowns survive between runs; auth / bad-model-name problems only last for one run
 * so fixing your key or routing.json takes effect immediately.
 */
export class CooldownTracker {
  private readonly until = new Map<string, number>();
  private readonly disabled = new Map<string, string>();

  constructor(private readonly file: string) {
    this.load();
  }

  static keyOf(candidate: Candidate): string {
    return `${candidate.provider}:${candidate.model}`;
  }

  remainingMs(candidate: Candidate): number {
    return Math.max(0, (this.until.get(CooldownTracker.keyOf(candidate)) ?? 0) - Date.now());
  }

  disabledReason(candidate: Candidate): string | undefined {
    return this.disabled.get(CooldownTracker.keyOf(candidate));
  }

  recordFailure(candidate: Candidate, error: ProviderError): void {
    const key = CooldownTracker.keyOf(candidate);

    if (SESSION_DISABLE.includes(error.kind)) {
      this.disabled.set(key, error.message);
      return;
    }

    const ms = error.kind === 'rate_limit' ? (error.retryAfterMs ?? DEFAULT_RATE_LIMIT_MS) : COOLDOWN_MS[error.kind];
    if (!ms) return;

    this.until.set(key, Date.now() + ms);
    this.save();
  }

  /** Models currently cooling down, for the --status view. */
  active(): Array<{ key: string; remainingMs: number }> {
    const now = Date.now();
    return [...this.until].filter(([, t]) => t > now).map(([key, t]) => ({ key, remainingMs: t - now }));
  }

  private load(): void {
    try {
      const saved = JSON.parse(fs.readFileSync(this.file, 'utf-8')) as { cooldowns?: Record<string, number> };
      const now = Date.now();
      for (const [key, time] of Object.entries(saved.cooldowns ?? {})) {
        if (time > now) this.until.set(key, time);
      }
    } catch {
      /* no state yet, or unreadable - start fresh */
    }
  }

  private save(): void {
    try {
      fs.writeFileSync(this.file, JSON.stringify({ cooldowns: Object.fromEntries(this.until) }, null, 2));
    } catch {
      /* state is a nicety; never fail a request over it */
    }
  }
}

export function formatDuration(ms: number): string {
  const minutes = Math.ceil(ms / MINUTE);
  return ms < MINUTE ? `${Math.ceil(ms / 1000)}s` : `${minutes} min`;
}
