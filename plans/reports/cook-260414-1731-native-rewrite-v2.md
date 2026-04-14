# Cook Report — v2.0 Native Rewrite

**Date:** 2026-04-14 17:31
**Commit:** `feat!: native processor rewrite — drop MCP subprocess layer`
**Target:** `@goonnguyen/human-cli@2.0.0`

## What changed

### Architecture
- **Removed**: MCP subprocess layer — no more spawning `@goonnguyen/human-mcp` via stdio
- **Added**: native processors in `src/processors/{eyes,hands,mouth,brain}/`
- **Added**: internal tool registry (`src/mcp/tool-registry.ts`) — 16 tools
- **Added**: native stdio MCP server (`src/mcp/server.ts`, lazy-loaded SDK) for Claude Desktop
- **Added**: slimmed `GeminiClient` (v0.21 SDK + REST calls for TTS/image gen)
- **Slimmed**: config schema (dropped transport/http/server/security/cloudflare)

### Files summary
- **Created**: 13 new source files (~1500 LOC)
- **Deleted**: `src/mcp/mcp-client.ts`, `src/runtime/run-tool.ts`, `src/runtime/input-resolver.ts`
- **Rewrote**: all 7 command files to use `runProcessor()`

### Dependencies
- **New regular**: `@google/generative-ai`, `jimp`, `marked`, `mime-types`, `wav`, `zod`
- **Moved to optional**: `@goonnguyen/human-mcp`, `@modelcontextprotocol/sdk`, `@google-cloud/vertexai`, `google-auth-library`, `sharp`, `playwright`, `rmbg`, `fluent-ffmpeg`, `mammoth`, `xlsx`, `pptx-automizer`

## Native tools (16)

| Tool | Kind | Provider | Deferred? |
|---|---|---|---|
| `eyes_analyze` | vision | Gemini | no |
| `eyes_compare` | vision | Gemini | no |
| `eyes_read_document` | docs | Gemini/local | no (PDF+text only) |
| `eyes_summarize_document` | docs | Gemini | no |
| `hands_gen_image` | image gen | Gemini | no |
| `hands_edit_image` | image edit | Gemini | no |
| `hands_crop_image` | local | Jimp | no |
| `hands_resize_image` | local | Jimp | no |
| `hands_rotate_image` | local | Jimp | no |
| `hands_mask_image` | local | Jimp | no |
| `mouth_speak` | TTS | Gemini | no |
| `mouth_narrate` | TTS | Gemini | no |
| `brain_think` | reasoning | Gemini | no |
| `brain_reflect` | reasoning | Gemini | no |
| `brain_analyze_simple` | local | pattern | no |
| `brain_patterns_info` | local | pattern | no |

## Deferred to v2.1 (graceful error on invocation)

**Reason: require additional provider ports + heavy optional deps**

- `hands gen-video`, `img-to-video` (Veo polling, Minimax Hailuo)
- `hands gen-music`, `gen-music-el` (Minimax Music, ElevenLabs Music)
- `hands gen-sfx` (ElevenLabs SFX)
- `hands remove-bg` (rmbg + onnxruntime model download)
- `hands screenshot` (playwright browser install)
- `mouth explain`, `mouth customize` (syntax-aware code explanation, voice tuning)
- `eyes read` / `summarize` for DOCX/XLSX/PPTX (mammoth/xlsx/pptx-automizer parsers)

All emit exit-code 4 with a clear "deferred to v2.1" message.

## Provider deferrals
- **Minimax**: music, SFX, alt speech/video providers — all deferred (API integration pending port)
- **ZhipuAI**: vision fallback, alt image/video providers — all deferred
- **ElevenLabs**: premium TTS, SFX, music — all deferred

## Verification

```
✓ typecheck        — 0 errors
✓ build            — 95KB bundle (down from 2.5MB pre-externalization)
✓ tests            — 15/15 passing (env resolution + native processors)
✓ smoke test       — `human hands crop red.png` works end-to-end locally
✓ `human doctor`   — detects all optional deps, shows env source tallies
✓ `human tools`    — lists 16 registered native tools
```

## CI status at push time

Workflows triggered on push:
- CI (Node 18/20/22 × Ubuntu/macOS): pending verification
- Release (semantic-release → NPM + GH Release): pending, `feat!` commit will cut v2.0.0

## Unresolved questions

1. **v2.1 scope**: should heavy deps (playwright, rmbg) remain optional or ship a separate `@goonnguyen/human-cli-media` package?
2. **Vertex AI path**: lightly tested (no access to a GCP project in dev). Confirm with a real Vertex project before promoting.
3. **Legacy `human-mcp` compat**: should `human call <tool>` also accept the v1 MCP tool names (e.g. `gemini_gen_image` → `hands_gen_image`) for backwards compatibility? Currently only new registry names work.
4. **Minimax/ZhipuAI/ElevenLabs**: port priority order — which providers do users need first in v2.1?
