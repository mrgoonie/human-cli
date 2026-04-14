# Plan: human-cli — Human-friendly & Agent-friendly CLI for human-mcp

**Date:** 2026-04-14 17:00
**Repo target:** `mrgoonie/human-cli` (public, npm pkg `human-cli`)
**Based on:** `/Volumes/GOON/www/oss/human-mcp` v2.14.0

## Goal

CLI wrapper exposing `human-mcp` tools directly from terminal. Dual-purpose:
- **Humans**: pretty TTY output, colors, progress, interactive prompts, sensible filenames
- **AI agents**: `--json` structured output, quiet mode, deterministic exit codes, stdin input

## Architecture

```
┌──────────────────┐      spawn + stdio      ┌──────────────────────────┐
│   human-cli      │ ────────────────────►   │  @goonnguyen/human-mcp   │
│  (this package)  │  ◄─────────────────     │  (MCP stdio server)      │
│                  │     MCP JSON-RPC        │                          │
└──────────────────┘                         └──────────────────────────┘
       │
       ├─ Config resolver (5-layer env chain)
       ├─ Command router (commander)
       ├─ MCP client (@modelcontextprotocol/sdk)
       ├─ Output formatter (human | json)
       └─ File I/O (base64 decode, save outputs)
```

**Why wrap, not reimplement:**
- Single source of truth for tool behavior
- Auto-inherits future human-mcp improvements
- Clean process isolation, no API-key leakage into CLI context

## Env Resolution (5 layers, priority order)

Per user spec: `OS > JSON config in user dir > process.env > .env.* > inline env vars`

Each source is read; higher-priority sources override lower ones. Final merged env is passed to `human-mcp` subprocess.

1. **OS env vars** (highest) — detected via `/usr/bin/env` snapshot on Unix, `SET` on Windows (i.e., the true OS-level env, separate from node's `process.env`)
2. **User config JSON** — `~/.config/human-cli/config.json` (XDG) or `%APPDATA%/human-cli/config.json`
3. **process.env** — runtime env (what node sees at start)
4. **.env.*** files — `.env.local` > `.env.<NODE_ENV>` > `.env` in CWD
5. **Inline flags** (lowest) — `--env KEY=VAL`, `--api-key`, `--model`, etc.

> Note: literal priority follows user's spec. Uncommon convention — documented in README.

All values surface in final config object. CLI flags that map to specific env vars still work (e.g. `--model gemini-2.5-pro` → `GOOGLE_GEMINI_MODEL`).

## Command Surface

```
human <group> <action> [args] [flags]

Groups (mirror human-mcp domains):
  eyes     — vision, document analysis
  hands    — generation, editing, screenshots
  mouth    — text-to-speech
  brain    — reasoning
  mcp      — run as MCP server (for Claude Desktop)
  config   — manage user config
  doctor   — diagnostic
```

### Command mapping (MCP tool → CLI)

| MCP Tool | CLI Command |
|---|---|
| eyes_analyze | `human eyes analyze <src> [--focus --detail]` |
| eyes_compare | `human eyes compare <img1> <img2> [--focus]` |
| eyes_read_document | `human eyes read <doc> [--pages --extract]` |
| eyes_summarize_document | `human eyes summarize <doc> [--length --focus]` |
| gemini_gen_image | `human hands gen-image <prompt> [--style --aspect --model]` |
| gemini_edit_image | `human hands edit-image <img> --prompt <p>` |
| gemini_inpaint_image | `human hands inpaint <img> --prompt <p>` |
| gemini_outpaint_image | `human hands outpaint <img> --direction <d>` |
| gemini_style_transfer_image | `human hands style-transfer <img> --style <s>` |
| gemini_compose_images | `human hands compose <imgs...>` |
| gemini_gen_video | `human hands gen-video <prompt> [--provider --duration]` |
| gemini_image_to_video | `human hands img-to-video <img> [--prompt]` |
| minimax_gen_music | `human hands gen-music <style> --lyrics <l>` |
| elevenlabs_gen_sfx | `human hands gen-sfx <desc>` |
| elevenlabs_gen_music | `human hands gen-music-el <prompt>` |
| jimp_crop_image | `human hands crop <img> [--mode --x --y --w --h]` |
| jimp_resize_image | `human hands resize <img> [--width --height --scale]` |
| jimp_rotate_image | `human hands rotate <img> --angle <deg>` |
| jimp_mask_image | `human hands mask <img> --mask <m>` |
| rmbg_remove_background | `human hands remove-bg <img> [--quality]` |
| playwright_screenshot_fullpage | `human hands screenshot <url> [--mode fullpage\|viewport\|element --selector]` |
| mouth_speak | `human mouth speak <text> [--voice --provider --out]` |
| mouth_narrate | `human mouth narrate <content_or_-> [--style]` |
| mouth_explain | `human mouth explain <code_or_file> [--programming-lang]` |
| mouth_customize | `human mouth customize <text> [--voice]` |
| brain_analyze_simple | `human brain analyze <input>` |
| brain_reflect_enhanced | `human brain reflect <analysis> --focus <areas>` |
| mcp__reasoning__sequentialthinking | `human brain think <problem>` |

### Global flags

```
--json                  agent-mode JSON envelope on stdout
--ndjson                stream progress as NDJSON lines
--quiet                 suppress non-essential output
--no-color              disable ANSI colors
--output <path>         save media outputs to this dir (default: ./outputs)
--config <path>         custom config file
--env KEY=VAL           inline env var (repeatable)
--api-key <key>         shortcut for GOOGLE_GEMINI_API_KEY
--model <name>          shortcut for GOOGLE_GEMINI_MODEL
--timeout <ms>          request timeout
--verbose / -v          debug logs on stderr
--version / -V
--help / -h
```

Auto-detection: non-TTY stdout ⇒ implicit `--json`. Pipe-friendly.

### Input: file | url | stdin | base64

Every source-accepting command supports `-` meaning "read from stdin". URLs auto-fetched. File paths resolved against CWD. Base64 data URIs passed through.

### Output: file | stdout | base64

For media-producing tools, defaults:
- Human mode: save to `./outputs/<ts>-<kind>.<ext>`, print path
- JSON mode: include `output_path` and optionally `base64` in envelope
- `--output -` prints base64/text to stdout for piping

### JSON envelope (agent mode)

```json
{
  "ok": true,
  "tool": "eyes_analyze",
  "data": { "text": "...", "output_path": "./outputs/...", "mime_type": "..." },
  "metadata": { "duration_ms": 1234, "mcp_version": "2.14.0" },
  "error": null
}
```

Exit codes: `0` ok, `1` tool error, `2` usage error, `3` config error, `4` MCP spawn error.

## Phases

- **Phase 01** — Scaffold project (package.json, tsconfig, tsup, folder structure)
- **Phase 02** — Config/env resolver (5-layer)
- **Phase 03** — MCP client wrapper (spawn, call-tool, lifecycle)
- **Phase 04** — Output formatter (human vs json, file saving)
- **Phase 05** — Command registration (eyes/hands/mouth/brain/mcp/config/doctor)
- **Phase 06** — UX polish (interactive mode, prompts, progress)
- **Phase 07** — CI/CD (GH Actions, semantic-release, NPM + GH Releases)
- **Phase 08** — Docs (README, AGENT.md, examples)

## Tech Stack

- **Runtime**: Node 18+
- **Language**: TypeScript 5.x (ESM)
- **Build**: tsup → single CJS+ESM bundle
- **CLI**: commander 12
- **MCP**: @modelcontextprotocol/sdk
- **Prompts**: @clack/prompts (small, modern)
- **Colors**: picocolors
- **Spinners**: ora
- **Env**: dotenv (for .env parsing only)
- **Test**: vitest
- **Lint**: prettier only (no eslint — KISS)
- **Release**: semantic-release + GH Actions

## Non-goals (YAGNI)

- No HTTP server mode in CLI itself (use `human mcp start --http` to delegate)
- No plugin system
- No TUI (full-screen terminal UI)
- No telemetry
- No caching layer (human-mcp handles that)

## Success Criteria

- [x] All human-mcp tools invokable via `human <group> <action>` commands
- [x] Works with `--json` piping for agents (non-TTY detect)
- [x] Config resolves from 5 sources with documented priority
- [x] `npm i -g human-cli` works on Node 18+ (Mac/Linux/Windows)
- [x] `human doctor` reports config + MCP connectivity
- [x] GH repo `mrgoonie/human-cli` public, CI green
- [x] First release auto-published to NPM + GH Releases via semantic-release

## Risks

| Risk | Mitigation |
|---|---|
| human-mcp install bloat (playwright, sharp) | Document, offer `--peer` install mode later |
| Stdio subprocess hangs | Kill with timeout, expose `--timeout` |
| Windows path quirks | Use `node:path`, test in CI matrix |
| Native binary failures postinstall | Surface errors in `human doctor` |
| MCP protocol changes | Pin `@modelcontextprotocol/sdk` major |
