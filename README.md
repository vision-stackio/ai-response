# Multi-Agent Search (smart multi-model router)

Give it text, an image, a document or a video. It works out what kind of query it is, sends it to
the model you assigned to that kind, and if that model is out of quota / rate-limited / down it
switches to the next one automatically.

```
                    ┌─ text  → OpenRouter free → Gemini free → (openai → claude)
 query ─► classify ─┼─ docs  → grok → Gemini free → (openai → claude)
                    ├─ image → OpenRouter free → Gemini free → (openai → claude)
                    └─ video → Gemini free
                                   │
              model failed? ───────┴─► next model in the list  ─► result ─► history
```

## Setup

```bash
cd multi-agent-search
npm install
cp .env.example .env     # add your keys (see below)
npm run status           # see which models are ready
```

**Free setup** - two free keys are enough:

| Key | Where | Used for |
| --- | --- | --- |
| `GEMINI_API_KEY` | <https://aistudio.google.com/> | Gemini free-tier models (text, image, docs, video) |
| `LLM_API_KEY` | <https://openrouter.ai/keys> | OpenRouter `openrouter/free` - tried first for text and image |

```env
LLM_PROVIDER=openai
LLM_API_KEY=sk-or-v1-...
LLM_API_URL=https://openrouter.ai/api/v1/chat/completions
LLM_MODEL=openrouter/free
```

`LLM_*` works for any OpenAI-compatible endpoint, not just OpenRouter - change `LLM_API_URL` and
`LLM_MODEL`. Providers without a key are skipped automatically, so you only need the ones you want.

## Usage

```bash
npm start                          # process every file in target-files/
npm start -- photo.png             # one file (image, video, pdf, txt/md/csv/json...)
npm start -- "explain DNS simply"  # a text question
npm run status                     # active models, routes, cooldowns
```

## How routing works

| Input                                  | Type    | Why                                   |
| -------------------------------------- | ------- | ------------------------------------- |
| Text / text file up to 2,000 characters | `text`  | small question → small, cheap model   |
| Longer text, or a PDF                   | `docs`  | needs a bigger context window         |
| `.png` `.jpg` `.jpeg` `.webp`           | `image` | needs a vision model                  |
| `.mp4` `.mov` `.webm`                   | `video` | only some providers accept video      |

Free-tier note: OpenRouter's free models and Gemini's free tier are both rate-limited. When one runs
out, the router moves to the next and remembers it for later runs - that is the intended flow here.

For each type, `routing.json` holds an ordered list of models. The router:

1. skips models whose provider has no API key, or that can't handle the input (e.g. a provider
   with no video support, or a file over its size limit);
2. skips models that recently ran out of quota (remembered between runs in `.router-state.json`);
3. calls the first remaining model - retrying once on a brief blip (overload / short rate limit);
4. on failure, moves to the next model and remembers how long to avoid the failed one:
   quota used up → 60 min · rate limit → the server's retry hint (default 60 s) · outage → 30 s.
   A bad API key or wrong model name disables that model for the current run only.

Every answer is logged to `query_history.json` with the model that produced it and any models it
fell back from. Past queries are printed grouped by type.

## Customising `routing.json`

Edit the order or swap model names - no code changes needed:

```json
"image": [
  { "provider": "gemini",    "model": "gemini-3.8-flash" },
  { "provider": "anthropic", "model": "claude-sonnet-5-5" }
]
```

Built-in providers: `gemini`, `llm` (the `LLM_*` endpoint, OpenRouter by default), `openai`, `xai` (Grok),
`anthropic`. A model name can read from the environment: `"${LLM_MODEL:-openrouter/free}"`.

### Adding any other provider

Anything that speaks the OpenAI chat-completions protocol (Groq, OpenRouter, Mistral, DeepSeek,
Ollama, LM Studio, ...) can be added in `routing.json` with no code:

```json
"providers": {
  "groq":   { "baseUrl": "https://api.groq.com/openai/v1", "apiKeyEnv": "GROQ_API_KEY" },
  "ollama": { "baseUrl": "http://localhost:11434/v1", "accepts": ["image"] }
}
```

then use it in a route: `{ "provider": "groq", "model": "<model-name>" }`.
`accepts` lists attachment types the provider handles (`image`, `video`, `pdf`); text is always accepted.

## Project layout

```
multi-agent-search/
├── routing.json            # which models handle which query type (edit me)
└── src/
    ├── index.ts            # CLI: collect inputs → route → print → save history
    ├── input.ts            # classify a file / text into text | docs | image | video
    ├── router.ts           # pick a model, retry, fall back
    ├── cooldowns.ts        # remembers exhausted models between runs
    ├── errors.ts           # classifies failures (quota, rate limit, outage, bad key...)
    ├── routing.ts          # loads + validates routing.json
    ├── history.ts          # query history, grouped by type
    ├── mime.ts  paths.ts
    └── providers/
        ├── provider.ts         # Provider interface + capability checks
        ├── gemini.ts           # Google SDK; large files go through the Files API
        ├── anthropic.ts        # Claude
        ├── openaiCompatible.ts # OpenAI, xAI, and custom providers
        └── registry.ts         # builds providers from env keys + routing.json
```

To add a non-OpenAI-style provider, implement the `Provider` interface and register it in `registry.ts`.
