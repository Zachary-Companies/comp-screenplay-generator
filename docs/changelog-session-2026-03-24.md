# Changelog — Session 2026-03-24

## Go LLM Proxy

Built a cross-platform Go binary (`tools/llm-proxy/`) that sits between Woodbury and LLM providers:

- **Single 13MB binary** — zero runtime deps, compiles for macOS/Linux/Windows
- **Anthropic-compatible API** — Woodbury's SDK talks to it natively via `/v1/messages`
- **Multi-model routing** — Claude models → Anthropic, GPT models → OpenAI (with automatic format translation)
- **SQLite logging** — every request tracked: model, tokens, cost, latency
- **Cost tracking** — per-model rates, running totals at `/stats`
- **YAML config** — `config.yaml` for routing rules, backends, cost rates
- **16 passing Go tests** — config, routing, translation, logging, HTTP endpoints, full passthrough

### Files
- `tools/llm-proxy/main.go` — entry point, HTTP server, .env loading
- `tools/llm-proxy/handler.go` — request parsing, routing, response
- `tools/llm-proxy/providers.go` — Anthropic passthrough, OpenAI with translation
- `tools/llm-proxy/translate.go` — Anthropic ↔ OpenAI message format conversion
- `tools/llm-proxy/logger.go` — SQLite request/response logging
- `tools/llm-proxy/config.go` — YAML config, glob matching, API key resolution

## Woodbury Platform Changes

### LLM Proxy Auto-Start/Stop
- `src/dashboard/server.ts` — `startLlmProxy()` spawns the Go binary on app start, kills on quit
- `src/dashboard/context.ts` — `llmProxy` field in `DashboardContext`
- `src/dashboard/types.ts` — type definition for llmProxy state

### baseURL Support for Anthropic/Groq
- `src/loop/llm-service.ts` — `getAnthropicClient()` and `getGroqClient()` now accept `baseURL` parameter
- All `streamAnthropic()`, `runAnthropic()`, `streamGroq()`, `runGroq()` pass through `options?.baseURL`
- When proxy is running, `LLM_BASE_URL` is auto-set to `http://localhost:8642`

### Global LLM Proxy Routes
- `src/dashboard/routes/llm-proxy.ts` — new route handler:
  - `GET /api/llm-proxy/status` — proxy status, detected backends, usage stats, selected model
  - `POST /api/llm-proxy/toggle` — start/stop proxy
  - `POST /api/llm-proxy/model` — set pipeline model (persists to chat-config.json)

### Settings Tab in Main Sidebar
- `src/config-dashboard/index.html` — added ⚙️ Settings nav tab
- `src/config-dashboard/llm-settings.js` — full settings panel:
  - Proxy toggle with live status badge
  - Backend detection (which API keys are set)
  - Model selector grid (Claude, GPT, Llama)
  - Usage statistics table

## Pipeline View Changes

### Editor Video Support
- `views/editor/extractData.ts` — builds `videoMap` from previsualizations, clips get `type: 'video'` when video exists
- `views/editor/EditorView.tsx` — program monitor renders `<video autoPlay muted loop>` for video clips, 🎬 icon in timeline

### Manual Reference Editing
- `views/screenplay/ScreenplayView.tsx` — Refs button on shots opens editor to toggle character/location references
- Saves bindings via `PUT /api/compositions/{id}/bindings` API
- Shows toast "Binding updated — Regen to apply"

### Deduped Ref Editor
- Fixed duplicate characters/locations in ref editor (was showing same character 4x)
- Now deduplicates by character ID

## Bug Fixes

- **MIME type detection for video generation** — previs images saved as `.png` but actually JPEG; route now detects from base64 prefix (`/9j/` = JPEG)
- **base64 ENOBUFS** — `sdk.exec('base64 -i ...')` overflows Node.js buffer for 1MB+ images; route now uses `fs.readFileSync` + `Buffer.toString('base64')`
- **Veo 3.1 audio filter** — children's content triggers safety filter; route falls back to Veo 2.0 for image-to-video
- **Veo download redirect** — video URI returns 302; fixed with `redirect: 'follow'` and curl fallback
- **.env quote stripping** — Go proxy's dotenv loader now strips surrounding quotes from values
