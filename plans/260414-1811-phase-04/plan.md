# Plan: Phase 04 — Heavy media providers

**Date:** 2026-04-14 18:11
**Target:** `@goonnguyen/human-cli@2.1.0`

## Scope

Port the commands currently deferred-with-exit-4 stubs:

| Command | Provider | Source LOC | Heavy dep |
|---|---|---|---|
| `hands gen-video` | Gemini Veo + Minimax Hailuo | ~280 + ~180 | fluent-ffmpeg (opt) |
| `hands img-to-video` | Gemini + Minimax | shared | same |
| `hands gen-music` | Minimax Music 2.5 | ~110 | — |
| `hands gen-music-el` | ElevenLabs Music | ~105 | — |
| `hands gen-sfx` | ElevenLabs SFX | ~105 | — |
| `hands remove-bg` | rmbg local | ~190 | rmbg, onnxruntime-node |
| `hands screenshot` | Playwright | ~470 | playwright |
| `mouth explain` | Gemini TTS + code-aware prompting | ~260 | — |
| `mouth customize` | Gemini TTS multi-voice | ~260 | — |

## Deliverable order

1. **Provider clients** — `MinimaxClient`, `ElevenLabsClient`
2. **Gemini video gen** — extend `GeminiClient` with `generateVideo()` + polling
3. **Processors**: video-gen, gen-music (minimax), gen-sfx (elevenlabs), gen-music-el (elevenlabs)
4. **Processors**: screenshot (playwright, 3 modes), remove-bg (rmbg), explain, customize
5. **Tool registry** — add 9 new tool specs
6. **Commands** — replace deferred stubs in `hands-commands.ts` + `mouth-commands.ts`
7. **Tests** — native processor smoke tests (no API calls)
8. **Release v2.1.0**

## Non-goals

- DOCX/XLSX/PPTX parsers — punt to v2.2
- ZhipuAI alt routes — punt to v2.2
- Minimax/ElevenLabs provider routing in `mouth speak` — punt to v2.2 (speak stays Gemini-only)

## Success

- All 9 deferred commands work natively with proper provider
- Heavy deps stay in `optionalDependencies` with lazy-load guards
- Tool registry grows from 16 → 25 tools
- All existing tests still pass
- v2.1.0 published to npm
