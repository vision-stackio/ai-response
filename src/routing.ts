import * as fs from 'node:fs';
import { DEFAULT_ROUTING_FILE } from './paths.js';
import { KINDS, type Candidate, type Routing } from './types.js';
import type { MediaType } from './mime.js';

/** A user-defined OpenAI-compatible provider (Groq, OpenRouter, Ollama, Mistral, ...). */
export interface CustomProviderConfig {
  baseUrl: string;
  /** Name of the env var holding the key. Omit for keyless local servers. */
  apiKeyEnv?: string;
  /** Attachment types the provider accepts. Text is always accepted. */
  accepts?: MediaType[];
}

export interface RoutingConfig {
  routes: Routing;
  providers: Record<string, CustomProviderConfig>;
}

/** Expands ${NAME} or ${NAME:-default} in a model name from the environment. */
function expandEnv(value: string): string {
  return value.replace(/\$\{(\w+)(?::-([^}]*))?\}/g, (_, name: string, fallback?: string) => {
    return process.env[name]?.trim() || fallback || '';
  });
}

export function loadRoutingConfig(file = process.env.ROUTING_FILE || DEFAULT_ROUTING_FILE): RoutingConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (error) {
    throw new Error(`Could not read routing config ${file}: ${error instanceof Error ? error.message : error}`);
  }

  const config = raw as { routes?: Record<string, unknown>; providers?: Record<string, CustomProviderConfig> };
  if (!config.routes || typeof config.routes !== 'object') {
    throw new Error(`${file}: missing "routes" object.`);
  }

  const routes = {} as Routing;
  for (const kind of KINDS) {
    const list = config.routes[kind];
    if (!Array.isArray(list)) throw new Error(`${file}: routes.${kind} must be an array.`);
    routes[kind] = list.map((entry, index): Candidate => {
      if (typeof entry?.provider !== 'string' || typeof entry?.model !== 'string') {
        throw new Error(`${file}: routes.${kind}[${index}] needs "provider" and "model" strings.`);
      }
      const model = expandEnv(entry.model);
      if (!model) throw new Error(`${file}: routes.${kind}[${index}].model "${entry.model}" expanded to an empty string.`);
      return { provider: entry.provider, model };
    });
  }

  return { routes, providers: config.providers ?? {} };
}
