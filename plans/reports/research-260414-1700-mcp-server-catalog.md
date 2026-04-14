# Research: Human MCP Server Catalog

**Source:** `/Volumes/GOON/www/oss/human-mcp` v2.14.0
**Date:** 2026-04-14

## Tool Surface (summary)

### Eyes (vision, documents)
- `eyes_analyze` — analyze image/video/gif (auto-detect type)
- `eyes_compare` — compare two images
- `eyes_read_document` — extract text/tables from PDF/DOCX/XLSX/PPTX/TXT/MD/RTF/ODT/CSV/JSON/XML/HTML
- `eyes_summarize_document` — brief/medium/detailed summary

### Hands (generation & media)
- `gemini_gen_image` / `gemini_edit_image` / `gemini_inpaint_image` / `gemini_outpaint_image` / `gemini_style_transfer_image` / `gemini_compose_images`
- `gemini_gen_video` / `gemini_image_to_video`
- `minimax_gen_music`, `elevenlabs_gen_sfx`, `elevenlabs_gen_music`
- `jimp_crop_image` / `jimp_resize_image` / `jimp_rotate_image` / `jimp_mask_image`
- `rmbg_remove_background`
- `playwright_screenshot_fullpage` / `_viewport` / `_element`

### Mouth (speech & audio)
- `mouth_speak` — TTS (Gemini/Minimax/ElevenLabs)
- `mouth_narrate` — long-form narration with chapters
- `mouth_explain` — code-to-speech explanation
- `mouth_customize` — voice testing/comparison

### Brain (reasoning)
- `brain_analyze_simple`, `brain_patterns_info`, `brain_reflect_enhanced`
- `mcp__reasoning__sequentialthinking`

## Env Vars (key groups)

| Group | Vars |
|---|---|
| Gemini (required) | `GOOGLE_GEMINI_API_KEY`, `GOOGLE_GEMINI_MODEL`, `GOOGLE_GEMINI_IMAGE_MODEL` |
| Vertex AI (alt)   | `USE_VERTEX`, `VERTEX_PROJECT_ID`, `VERTEX_LOCATION`, `GOOGLE_APPLICATION_CREDENTIALS` |
| Transport         | `TRANSPORT_TYPE`, `HTTP_PORT`, `HTTP_HOST`, `HTTP_SESSION_MODE`, … |
| Security          | `MCP_SECRET`, `HTTP_SECRET`, `HTTP_CORS_ENABLED`, `HTTP_ALLOWED_HOSTS`, … |
| Server            | `PORT`, `MAX_REQUEST_SIZE`, `REQUEST_TIMEOUT`, `FETCH_TIMEOUT`, `LOG_LEVEL` |
| Minimax           | `MINIMAX_API_KEY`, `MINIMAX_API_HOST` |
| ZhipuAI           | `ZHIPUAI_API_KEY`, `ZHIPUAI_API_HOST` |
| ElevenLabs        | `ELEVENLABS_API_KEY`, `ELEVENLABS_API_HOST` |
| Provider defaults | `SPEECH_PROVIDER`, `VIDEO_PROVIDER`, `VISION_PROVIDER`, `IMAGE_PROVIDER` |
| Cloudflare R2     | `CLOUDFLARE_CDN_*` (6 vars) |
| Cache             | `ENABLE_CACHING`, `CACHE_TTL` |

## Entry & Runtime

- `bin/human-mcp.js` spawns `dist/index.js` (built from `src/index.ts`)
- ESM, Node >=18, built with bun, runnable under plain node
- Postinstall script handles native binaries (sharp, onnxruntime, playwright)
- Transports: stdio (default), http, both
- Heavy native deps: `sharp`, `onnxruntime-node` (via rmbg), `playwright`

## Implications for CLI Wrapper

1. **Spawn as stdio subprocess** using `@modelcontextprotocol/sdk` client — simplest, cleanest.
2. **Depend on `@goonnguyen/human-mcp`** so install is one step.
3. **Pass resolved env** to child process — avoids double config parsing.
4. **Stream outputs** for long-running ops (video gen polling).

## Unresolved Questions
- Memory tools (`mcp__memory__*`) appear deprecated in code comments — expose or hide in CLI?
- Video polling max duration / timeout handling when wrapped — inherit from `REQUEST_TIMEOUT`?
- Should CLI ever launch HTTP transport or only stdio?
