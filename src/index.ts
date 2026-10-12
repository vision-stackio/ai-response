import * as fs from 'node:fs';
import * as path from 'node:path';
import { CooldownTracker, formatDuration } from './cooldowns.js';
import { printHistory, saveHistoryRecord } from './history.js';
import { fromFile, fromText, looksLikeFilePath, UnsupportedInputError } from './input.js';
import { ENV_FILE, STATE_FILE, TARGET_DIR } from './paths.js';
import { apiKeyEnvFor, BUILT_IN_KEY_VARS, buildProviders } from './providers/registry.js';
import { loadRoutingConfig, type RoutingConfig } from './routing.js';
import { NoRouteError, respond } from './router.js';
import { KINDS, type Input } from './types.js';

const DIVIDER = '='.repeat(40);

const USAGE = `Usage:
  npm start                         process every file in tests/
  npm start -- <file>               process one file (image, video, pdf, text)
  npm start -- "your question"      ask a text question
  npm start -- --status             show active models, routes and cooldowns`;

function loadEnv(): void {
  try {
    process.loadEnvFile(ENV_FILE);
  } catch {
    /* .env is optional - keys may come from the shell */
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Turns one CLI argument into a query: an existing file, or else text. */
function toInput(arg: string): Input {
  const resolved = path.resolve(arg);
  if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) return fromFile(resolved);
  if (looksLikeFilePath(arg)) throw new UnsupportedInputError(`File not found: ${arg}`);
  return fromText(arg);
}

/** Decides what to process: CLI args if given, otherwise everything in tests/. */
function collectArgs(args: string[]): string[] | null {
  if (args.length > 0) {
    // `npm start -- what is rust` without quotes: treat the loose words as one question.
    const anyExistingFile = args.some((a) => fs.existsSync(a) && fs.statSync(a).isFile());
    return anyExistingFile ? args : [args.join(' ')];
  }

  if (!fs.existsSync(TARGET_DIR)) {
    fs.mkdirSync(TARGET_DIR, { recursive: true });
    console.log(`📁 Created folder: ${TARGET_DIR}`);
    return null;
  }

  const files = fs.readdirSync(TARGET_DIR).filter((name) => !name.startsWith('.'));
  return files.length > 0 ? files.map((name) => path.join(TARGET_DIR, name)) : null;
}

function printMissingKeysHelp(config: RoutingConfig): void {
  const customVars = Object.values(config.providers).flatMap((p) => (p.apiKeyEnv ? [p.apiKeyEnv] : []));
  const lines = [
    '',
    '❌ No AI providers are configured - no API keys found.',
    '-'.repeat(64),
    `Add at least one key to ${ENV_FILE} (copy .env.example), or export it in your shell:`,
    '',
    ...[...BUILT_IN_KEY_VARS, ...customVars].map((name) => `   ${name}=your_key_here`),
    '',
    'Free keys:  Gemini  https://aistudio.google.com/   ·   OpenRouter  https://openrouter.ai/keys',
    '-'.repeat(64),
    '',
  ];
  console.error(lines.join('\n'));
}

function printStatus(config: RoutingConfig, providers: ReturnType<typeof buildProviders>, cooldowns: CooldownTracker): void {
  console.log(`\n${DIVIDER}\n🧭 ROUTING STATUS\n${DIVIDER}`);

  for (const kind of KINDS) {
    console.log(`\n${kind}`);
    if (config.routes[kind].length === 0) console.log('  (none configured)');

    config.routes[kind].forEach((candidate, index) => {
      const name = `${candidate.provider}/${candidate.model}`;
      let state = '✅ ready';
      if (!providers.has(candidate.provider)) {
        const envVar = apiKeyEnvFor(candidate.provider, config);
        state = envVar ? `🔑 no key (set ${envVar})` : '❓ unknown provider';
      } else if (cooldowns.remainingMs(candidate) > 0) {
        state = `⏸️  cooling down, ~${formatDuration(cooldowns.remainingMs(candidate))} left`;
      }
      console.log(`  ${index + 1}. ${name.padEnd(46)} ${state}`);
    });
  }
  console.log(`\n${DIVIDER}`);
}

async function processInput(input: Input, deps: Parameters<typeof respond>[1]): Promise<void> {
  console.log(`\n🔍 ${input.label}  →  type: ${input.kind}`);

  const startTime = Date.now();
  const result = await respond(input, deps);
  const seconds = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(`\n${DIVIDER}\n📌 RESULT (${input.label})\n${DIVIDER}`);
  console.log(result.output);
  console.log(DIVIDER);
  console.log(`⏱️ ${seconds}s via ${result.provider}/${result.model}`);
  if (result.fallbacks.length > 0) console.log(`↪️  Switched from: ${result.fallbacks.join(', ')}`);

  saveHistoryRecord({
    timestamp: new Date().toISOString(),
    fileName: input.label,
    kind: input.kind,
    fileType: input.mimeType,
    provider: result.provider,
    model: result.model,
    fallbacks: result.fallbacks,
    output: result.output,
  });
}

async function main(): Promise<void> {
  loadEnv();

  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(USAGE);
    return;
  }

  const config = loadRoutingConfig();
  const providers = buildProviders(config);
  const cooldowns = new CooldownTracker(STATE_FILE);

  if (providers.size === 0) {
    printMissingKeysHelp(config);
    process.exit(1);
  }

  if (args.includes('--status')) {
    printStatus(config, providers, cooldowns);
    return;
  }

  console.log(`🔌 Active providers: ${[...providers.keys()].join(', ')}`);

  const targets = collectArgs(args);
  if (!targets) {
    console.log("📂 Nothing to process. Drop files into 'tests/' or pass a file / question.\n");
    console.log(USAGE);
    printHistory();
    return;
  }

  for (const target of targets) {
    try {
      await processInput(toInput(target), { routing: config.routes, providers, cooldowns });
    } catch (error) {
      const prefix = error instanceof NoRouteError || error instanceof UnsupportedInputError ? '🚫' : '❌';
      console.error(`\n${prefix} ${errorMessage(error)}`);
      process.exitCode = 1;
    }
  }

  printHistory();
}

main().catch((error) => {
  console.error(`❌ ${errorMessage(error)}`);
  process.exit(1);
});
