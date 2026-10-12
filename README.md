<p align="center">
  <img alt="Vision Logo" src="public/Vision.png" width="140">
</p>

<p align="center">
  <b>Multi Agent Search</b> — smart multi model switcher
</p>

<p align="center">
  <a href="#-setup"><img alt="Node" src="https://img.shields.io/badge/node-18%2B-339933?style=flat-square&logo=node.js&logoColor=white" /></a>
  <a href="#-setup"><img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.x-3178c6?style=flat-square&logo=typescript&logoColor=white" /></a>
  <a href="#-setup"><img alt="OpenRouter" src="https://img.shields.io/badge/OpenRouter-free-8b5cf6?style=flat-square" /></a>
  <a href="#-setup"><img alt="Gemini" src="https://img.shields.io/badge/Gemini-free-4285f4?style=flat-square&logo=google&logoColor=white" /></a>
</p>

> **Honest framing.** Give it text, an image, a document or a video. It classifies the input, routes it to the model you assigned for that type, and automatically falls back to the next model when the first one is out of quota, rate limited, or down.

## Table of contents

1. [Setup](#-setup)
2. [Usage](#-usage)
3. [How routing works](#-how-routing-works)
4. [Customising `routing.json`](#-customising-routingjson)
5. [Adding any other provider](#-adding-any-other-provider)
6. [Image Identification](#-image-identification-person-identify-panel)
7. [Free-tier notes](#-free-tier-notes)

---

## Setup

```bash
cd ai-response
npm install
cp .env.example .env   # add your keys (see below)
npm run status         # see which models are ready
```

**Free setup** — two free keys are enough for text, image, docs and video:

| Key              | Where                          | Used for                                                      |
| ---------------- | ------------------------------ | ------------------------------------------------------------- |
| `GEMINI_API_KEY` | <https://aistudio.google.com/> | Gemini free-tier models (text, image, docs, video) — primary  |
| `LLM_API_KEY`    | <https://openrouter.ai/keys>   | OpenRouter `openrouter/free` — tried first for text and image |

```env
# ---- Free setup (enough on its own) ----

# Gemini free tier - key from https://aistudio.google.com/
GEMINI_API_KEY=

# OpenRouter free models - key from https://openrouter.ai/keys
# Used first for text and image; falls back to Gemini automatically.
LLM_PROVIDER=openai
LLM_API_KEY=sk-or-v1-...
LLM_API_URL=https://openrouter.ai/api/v1/chat/completions
LLM_MODEL=openrouter/free

# ---- Optional extra providers (skipped when blank) ----
OPENAI_API_KEY=
XAI_API_KEY=
ANTHROPIC_API_KEY=
```

`LLM_*` works for any OpenAI-compatible endpoint, not just OpenRouter — change `LLM_API_URL` and `LLM_MODEL`. Providers without a key are skipped automatically, so you only need the ones you want.

---

## Usage

```bash
npm start                              # process every file in tests/
npm start -- photo.png                 # one file (image, video, pdf, txt/md/csv/json...)
npm start -- "explain DNS simply"      # a text question
npm run status                         # active models, routes, cooldowns
```

---

## How routing works

| Input                                   | Type    | Why                                 |
| --------------------------------------- | ------- | ----------------------------------- |
| Text / text file up to 2,000 characters | `text`  | small question → small, cheap model |
| Longer text, or a PDF                   | `docs`  | needs a bigger context window       |
| `.png` `.jpg` `.jpeg` `.webp`           | `image` | needs a vision model                |
| `.mp4` `.mov` `.webm`                   | `video` | only some providers accept video    |

Default routes (Gemini free models are heavily used):

```
┌─ text  → OpenRouter free → Gemini free → (openai → claude)
query ─► classify ─┼─ docs  → grok → Gemini free → (openai → claude)
                   ├─ image → OpenRouter free → Gemini free → (openai → claude)
                   └─ video → Gemini free
                              │
                    model failed? ───────┴─► next model in the list ─► result ─► history
```

For each type, `routing.json` holds an ordered list of models. The router:

1. Skips models whose provider has no API key, or that can't handle the input (e.g. a provider with no video support, or a file over its size limit).
2. Skips models that recently ran out of quota (remembered between runs in `.router-state.json`).
3. Calls the first remaining model — retrying once on a brief blip (overload / short rate limit).
4. On failure, moves to the next model and remembers how long to avoid the failed one:
   - quota used up → 60 min
   - rate limit → the server's retry hint (default 60 s)
   - outage → 30 s
   - A bad API key or wrong model name disables that model for the current run only.

Every answer is logged to `query_history.json` with the model that produced it and any models it fell back from. Past queries are printed grouped by type.

---

## Customising `routing.json`

Edit the order or swap model names — no code changes needed:

```json
"image": [
  { "provider": "llm", "model": "${LLM_MODEL:-openrouter/free}" },
  { "provider": "gemini", "model": "gemini-2.0-flash" },
  { "provider": "gemini", "model": "gemini-2.0-flash-lite" },
  { "provider": "openai", "model": "gpt-4o-mini" },
  { "provider": "anthropic", "model": "claude-sonnet-4" }
]
```

Built-in providers: `gemini`, `llm` (the `LLM_*` endpoint, OpenRouter by default), `openai`, `xai` (Grok), `anthropic`.

A model name can read from the environment: `"${LLM_MODEL:-openrouter/free}"`.

---

## Adding any other provider

Anything that speaks the OpenAI chat-completions protocol (Groq, OpenRouter, Mistral, DeepSeek, Ollama, LM Studio, ...) can be added in `routing.json` with no code:

```json
"providers": {
  "groq": { "baseUrl": "https://api.groq.com/openai/v1", "apiKeyEnv": "GROQ_API_KEY" },
  "ollama": { "baseUrl": "http://localhost:11434/v1", "accepts": ["image"] }
}
```

Then use it in a route: `{ "provider": "groq", "model": "<model-name>" }`.

`accepts` lists attachment types the provider handles (`image`, `video`, `pdf`); text is always accepted.

To add a non-OpenAI-style provider, implement the `Provider` interface and register it in `registry.ts`.

---

## Image Identification (person identify panel)

Optional — used when you want reverse-image / person identification features.

| Key             | Where                     | Used for                                          |
| --------------- | ------------------------- | ------------------------------------------------- |
| `SERPAPI_KEY`   | <https://serpapi.com>     | Google Lens style search (100 free searches/month)|
| `IMGBB_API_KEY` | <https://api.imgbb.com>   | Hosts uploaded images so Google Lens can see them |

```env
# ---- Image Identification (optional) ----
SERPAPI_KEY=your-serpapi-key-here
IMGBB_API_KEY=your-imgbb-key-here
```

---

## Free-tier notes

OpenRouter's free models and Gemini's free tier are both rate-limited. When one runs out, the router moves to the next and remembers it for later runs — that is the intended flow here.

Providers without a key are skipped automatically. You only need the keys for the providers you actually want to use.
