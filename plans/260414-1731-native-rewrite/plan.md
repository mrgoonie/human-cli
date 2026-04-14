# Plan: Native Rewrite — Drop MCP subprocess, port human-mcp tools as native human-cli commands

**Date:** 2026-04-14 17:31
**Target:** `@goonnguyen/human-cli` v2.0 (breaking release)
**Source to port:** `/Volumes/GOON/www/oss/human-mcp` v2.14.0 (~21.8K LOC, 84 files)

## Motivation

Current v1 architecture spawns `@goonnguyen/human-mcp` as an MCP stdio subprocess and proxies every call through JSON-RPC. User wants native execution:
- **Faster startup** — no subprocess, no protocol handshake
- **Direct error handling** — no JSON-RPC translation layer
- **Simpler dep tree** — no MCP SDK at runtime
- **CLI-native UX** — streams, progress events, cancellation via Ctrl-C

## Strategy

**Port, don't vendor.** Rewrite each processor/provider-client module from human-mcp into human-cli's source, with CLI-first adaptations:
- Config object replaced by the resolved env record from `resolve-env.ts`
- MCP-specific response envelope (`{content:[{type:"text",...}]}`) replaced with plain `{text, media}` tuples
- Transport awareness removed (we only have stdio — this IS the process)

**Heavy deps become optional.** Move `sharp`, `playwright`, `rmbg`, `fluent-ffmpeg`, `mammoth`, `xlsx`, `pptx-automizer` to `optionalDependencies`. Commands that need them lazy-load and emit friendly install instructions on missing.

**Keep MCP mode intact.** `human mcp start` still works as a Claude Desktop server, but now backed by our native processors instead of proxying to human-mcp. `human call <tool>` and `human tools` keep working via the new internal tool registry.

## Phase Breakdown

| # | Phase | Output | Status |
|---|---|---|---|
| 01 | Foundation: config, logger, errors, schemas, provider clients | `src/core/*` | ⏳ |
| 02 | Eyes: image/video/gif analysis + basic docs | `src/processors/eyes/*` + wire commands | ⏳ |
| 03 | Hands A: image gen/edit + jimp local ops | `src/processors/hands/image*` | ⏳ |
| 04 | Hands B: screenshot (playwright), bg-remove, video-gen, music/sfx | (optional, defer if scope grows) | ⏳ |
| 05 | Mouth: speech, narration, explain, customize | `src/processors/mouth/*` | ⏳ |
| 06 | Brain: reflection + native thinking/reasoning | `src/processors/brain/*` | ⏳ |
| 07 | Wire: switch command handlers to call processors directly, drop HumanMcpClient from command paths | `src/commands/*` | ⏳ |
| 08 | Internal MCP server: expose our processors as MCP tools so `human mcp start` works standalone | `src/mcp/server.ts` | ⏳ |
| 09 | Cleanup: tests, README/AGENT.md updates, CHANGELOG, v2.0 release | — | ⏳ |

## Directory Structure (target)

```
src/
├── cli.ts                        # entry (unchanged)
├── index.ts                      # public exports
├── core/
│   ├── config-schema.ts          # Zod schema (from human-mcp config.ts)
│   ├── load-config.ts            # resolve env → Config object
│   ├── logger.ts
│   ├── errors.ts
│   └── providers/
│       ├── gemini-client.ts
│       ├── minimax-client.ts
│       ├── zhipuai-client.ts
│       └── elevenlabs-client.ts
├── processors/
│   ├── eyes/
│   │   ├── analyze-image.ts      # Gemini vision
│   │   ├── analyze-video.ts
│   │   ├── analyze-gif.ts
│   │   ├── compare-images.ts
│   │   ├── read-document.ts      # factory → text/pdf/docx/…
│   │   ├── summarize-document.ts
│   │   └── document-readers/
│   │       ├── text-reader.ts
│   │       ├── pdf-reader.ts
│   │       ├── docx-reader.ts    (optional)
│   │       ├── xlsx-reader.ts    (optional)
│   │       └── pptx-reader.ts    (optional)
│   ├── hands/
│   │   ├── gen-image.ts
│   │   ├── gen-video.ts          (Gemini Veo with polling)
│   │   ├── edit-image.ts
│   │   ├── inpaint-image.ts
│   │   ├── outpaint-image.ts
│   │   ├── compose-images.ts
│   │   ├── style-transfer.ts
│   │   ├── jimp-ops.ts           (crop/resize/rotate/mask — all local)
│   │   ├── remove-background.ts  (optional: rmbg)
│   │   ├── screenshot.ts         (optional: playwright)
│   │   ├── gen-music.ts          (optional: minimax/elevenlabs)
│   │   └── gen-sfx.ts            (optional: elevenlabs)
│   ├── mouth/
│   │   ├── speak.ts              # Gemini/Minimax/ElevenLabs router
│   │   ├── narrate.ts
│   │   ├── explain.ts
│   │   ├── customize.ts
│   │   └── audio-export.ts       # wav writer
│   └── brain/
│       ├── sequential-thinking.ts  (local, stateful)
│       ├── simple-reasoning.ts     (local, pattern-based)
│       ├── reflection.ts           (Gemini)
│       └── patterns-info.ts        (local, static data)
├── commands/                      # mostly unchanged; just replace runTool() body
│   ├── eyes-commands.ts
│   ├── hands-commands.ts
│   ├── mouth-commands.ts
│   ├── brain-commands.ts
│   ├── config-commands.ts
│   ├── doctor-command.ts
│   ├── call-command.ts           # now uses internal tool registry
│   └── mcp-command.ts            # starts our internal MCP server
├── mcp/
│   ├── server.ts                 # expose processors as MCP tools
│   └── tool-registry.ts          # name → processor function map
└── runtime/
    ├── run-processor.ts          # replaces runTool()
    ├── output-adapter.ts         # processor result → format-result envelope
    ├── media-loader.ts           # file/url/base64 → Buffer (shared)
    └── global-flags.ts           # unchanged
```

## Optional Dependencies Strategy

`package.json` changes:

```json
{
  "dependencies": {
    "@google/generative-ai": "^0.21.0",
    "commander": "^12.1.0",
    "dotenv": "^16.4.5",
    "ora": "^8.1.0",
    "picocolors": "^1.1.0",
    "zod": "^3.23.0",
    "marked": "^16.0.0",
    "wav": "^1.0.2",
    "mime-types": "^3.0.1"
  },
  "optionalDependencies": {
    "sharp": "^0.33.0",
    "jimp": "^1.6.0",
    "playwright": "^1.56.0",
    "rmbg": "^0.1.0",
    "fluent-ffmpeg": "^2.1.3",
    "mammoth": "^1.10.0",
    "xlsx": "^0.18.5",
    "pptx-automizer": "^0.7.4",
    "@google-cloud/vertexai": "^1.7.0",
    "google-auth-library": "^10.4.1"
  },
  "peerDependenciesMeta": {
    "@google-cloud/vertexai": { "optional": true },
    "google-auth-library":   { "optional": true }
  }
}
```

Lazy-load pattern inside each processor that needs a heavy dep:

```ts
async function requireSharp() {
  try { return (await import("sharp")).default; }
  catch { throw new Error("This command requires `sharp`. Install: npm i sharp"); }
}
```

**Dropped from deps:**
- `@goonnguyen/human-mcp` (no longer proxied — our code is the source of truth)
- `@modelcontextprotocol/sdk` stays as **optional** (only needed if user runs `human mcp start`)

## Success Criteria

- [ ] `human eyes analyze img.png` runs without spawning a subprocess (zero MCP handshake)
- [ ] `human --version` still works; `human tools` lists the internal registry
- [ ] `human doctor` checks provider creds + lists available processors
- [ ] All existing command surfaces still work (same CLI UX contract)
- [ ] Install size drops significantly when users skip optional deps
- [ ] `human mcp start` spins up an MCP server backed by our native processors
- [ ] CI green, tests pass
- [ ] v2.0.0 released with BREAKING CHANGE note

## Non-goals (still YAGNI)

- Porting every single analytical brain processor in first pass (defer less-used ones)
- Tool-by-tool parity with human-mcp's parameter names (we normalize to CLI conventions)
- Supporting HTTP transport (our CLI is stdio — use human-mcp directly if HTTP needed)

## Scope Reality Check

Porting 21.8K LOC across 84 files is a significant undertaking. Realistic deliverable for one session:

**MUST deliver (v2.0-beta):**
- Phase 01, 02 (image analysis), 03 (image gen + jimp), 05 (speech core), 06 (brain core), 07 (wiring)

**Stretch:**
- Phase 04 (video/music/screenshot/bg-remove) — ship behind feature flags if partial
- Phase 08 (internal MCP server)

**Defer to v2.1:**
- PPTX/DOCX/XLSX readers (keep PDF+text in v2.0)
- Analytical-reasoning, problem-solver brain processors
- Vertex AI flow (env var gated but code deferred)

Final report will document exactly what shipped vs what's deferred with file paths and next-step instructions.

## Risks

| Risk | Mitigation |
|---|---|
| Gemini SDK version mismatch | Pin exact version matching human-mcp |
| Sharp native binary fails on user's platform | Already optional; clear error message |
| Bundle size balloons | tsup already excludes optional deps; measure after each phase |
| Breaking changes surprise users | v2.0 major bump + migration note in CHANGELOG |
| Partial port ships broken commands | Feature flags + `human doctor` reports unavailable commands |

## References

- Port manifest: see scout report saved by explore agent (above this session's context)
- Source: `/Volumes/GOON/www/oss/human-mcp/src/`
- Current CLI commands: `/Volumes/GOON/www/oss/human-cli/src/commands/`
