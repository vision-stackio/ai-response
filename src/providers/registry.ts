import type { RoutingConfig } from '../routing.js';
import { AnthropicProvider } from './anthropic.js';
import { GeminiProvider } from './gemini.js';
import { OpenAICompatibleProvider } from './openaiCompatible.js';
import { MB, type Capabilities, type Provider } from './provider.js';

interface BuiltIn {
  apiKeyEnv: string;
  baseUrlEnv: string;
  create(apiKey: string, baseUrl?: string): Provider;
  /** Return a reason string to leave this provider out even though a key is set. */
  disabledReason?(): string | undefined;
}

const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

/** LLM_API_URL is a full chat-completions URL; the provider wants the base URL. */
const toBaseUrl = (url: string) => url.replace(/\/+$/, '').replace(/\/chat\/completions$/, '');

const BUILT_INS: Record<string, BuiltIn> = {
  gemini: {
    apiKeyEnv: 'GEMINI_API_KEY',
    baseUrlEnv: 'GEMINI_BASE_URL',
    create: (apiKey, baseUrl) => new GeminiProvider(apiKey, baseUrl),
  },
  openai: {
    apiKeyEnv: 'OPENAI_API_KEY',
    baseUrlEnv: 'OPENAI_BASE_URL',
    create: (apiKey, baseUrl) =>
      new OpenAICompatibleProvider({
        id: 'openai',
        apiKey,
        baseUrl: baseUrl ?? 'https://api.openai.com/v1',
        capabilities: { image: 20 * MB, pdf: 20 * MB },
      }),
  },
  xai: {
    apiKeyEnv: 'XAI_API_KEY',
    baseUrlEnv: 'XAI_BASE_URL',
    create: (apiKey, baseUrl) =>
      new OpenAICompatibleProvider({
        id: 'xai',
        apiKey,
        baseUrl: baseUrl ?? 'https://api.x.ai/v1',
        capabilities: { image: 20 * MB },
      }),
  },
  /**
   * Generic OpenAI-compatible endpoint configured purely through env vars:
   *   LLM_PROVIDER=openai  LLM_API_KEY=...  LLM_API_URL=<.../chat/completions>  LLM_MODEL=...
   * Defaults to OpenRouter. Used for the free `openrouter/free` model.
   */
  llm: {
    apiKeyEnv: 'LLM_API_KEY',
    baseUrlEnv: 'LLM_API_URL',
    create: (apiKey, url) =>
      new OpenAICompatibleProvider({
        id: 'llm',
        apiKey,
        baseUrl: toBaseUrl(url ?? OPENROUTER_CHAT_URL),
        capabilities: { image: 20 * MB },
      }),
    disabledReason: () => {
      const protocol = process.env.LLM_PROVIDER?.trim().toLowerCase();
      return !protocol || protocol === 'openai'
        ? undefined
        : `LLM_PROVIDER="${protocol}" is not supported - only OpenAI-compatible endpoints (LLM_PROVIDER=openai)`;
    },
  },
  anthropic: {
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    baseUrlEnv: 'ANTHROPIC_BASE_URL',
    create: (apiKey, baseUrl) => new AnthropicProvider(apiKey, baseUrl),
  },
};

/** Builds every provider that has credentials available. Others are silently left out. */
export function buildProviders(config: RoutingConfig): Map<string, Provider> {
  const providers = new Map<string, Provider>();

  for (const [id, builtIn] of Object.entries(BUILT_INS)) {
    const apiKey = process.env[builtIn.apiKeyEnv]?.trim();
    if (!apiKey) continue;

    const problem = builtIn.disabledReason?.();
    if (problem) {
      console.warn(`⚠️  Ignoring ${id}: ${problem}.`);
      continue;
    }
    providers.set(id, builtIn.create(apiKey, process.env[builtIn.baseUrlEnv]?.trim() || undefined));
  }

  for (const [id, custom] of Object.entries(config.providers)) {
    const apiKey = custom.apiKeyEnv ? process.env[custom.apiKeyEnv]?.trim() : undefined;
    if (custom.apiKeyEnv && !apiKey) continue; // key declared but not set

    const capabilities: Capabilities = {};
    for (const type of custom.accepts ?? []) capabilities[type] = 20 * MB;
    providers.set(id, new OpenAICompatibleProvider({ id, baseUrl: custom.baseUrl, apiKey, capabilities }));
  }

  return providers;
}

/** Which env var enables a provider, for "missing key" hints. */
export function apiKeyEnvFor(providerId: string, config: RoutingConfig): string | undefined {
  return BUILT_INS[providerId]?.apiKeyEnv ?? config.providers[providerId]?.apiKeyEnv;
}

export const BUILT_IN_KEY_VARS = Object.values(BUILT_INS).map((b) => b.apiKeyEnv);
