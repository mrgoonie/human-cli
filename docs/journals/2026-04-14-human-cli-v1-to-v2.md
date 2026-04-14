# From MCP Subprocess to Native Rewrite: human-cli v1 → v2

**Date**: 2026-04-14
**Severity**: Low (user-driven redesign, no production breakage)
**Component**: @goonnguyen/human-cli (CLI core, processor architecture)
**Status**: Resolved (v2.0.0 shipped)

## What Happened

Two back-to-back development sessions fundamentally reshaped the CLI architecture:

**Session 1 (v1.0 → v1.1):** Bootstrapped new CLI via `/bootstrap` skill. Built 5-layer env resolution (OS > user config > process.env > .env > inline), dual human/agent output modes, and 30+ MCP tools exposed via commander. Shipped v1.0.0 then v1.1.0 to npm. Hit npm name conflict (`human-cli` taken), pivoted to `@goonnguyen/human-cli` scope.

**Session 2 (v1.1 → v2.0):** User feedback — *"không phải là cách tôi kỳ vọng" (not how I expected it)* — drove complete rewrite. Dropped MCP subprocess entirely. Ported 21.8K LOC from `@goonnguyen/human-mcp` (84 files) into native in-process functions. Built native stdio MCP server on top so Claude Desktop still works. Shipped v2.0.0.

## The Brutal Truth

Session 1 felt like shipping a working solution. Session 2 revealed it was architecturally backwards — we were forcing users to talk through an MCP subprocess when they wanted direct access to the tools. Spent 6 hours unpacking human-mcp's processor design, rewriting it in-tree, and handling the TypeScript/bundling fallout. The frustration wasn't technical complexity; it was realizing the entire v1 design was a cargo-cult pattern that didn't match the actual use case.

The native rewrite felt *right*. No subprocess ceremony, no JSON-RPC round-trip serialization, just import and call. That's what we should have done from the start.

## Technical Details

**Bundle stats:**
- v1: 2.5 MB (unexternalized deps)
- v2: 95 KB (externalized, optional deps moved to optionalDependencies)

**Architecture shift:**
- v1: CLI → MCP client → stdio subprocess (human-mcp) → actual tools
- v2: CLI → in-process functions → native stdio MCP server for Claude Desktop

**Core modules created** (`src/core/`, `src/processors/`):
- Config resolution, logging, error handling, provider setup, media loader
- 16 native tool processors: analyze-image, read-document, gen-image, jimp-ops, speak, narrate, think, reflect, analyzeSimple, patternsInfo, etc.
- Tool registry (`src/mcp/tool-registry.ts`) exposing 16 tools
- Native stdio MCP server (`src/mcp/server.ts`) for Claude Desktop compatibility

**Optional deps (graceful exit-code-4 stubs for v2.1):**
- sharp, playwright, rmbg, fluent-ffmpeg, mammoth, xlsx, pptx-automizer, MCP SDK, Vertex AI, google-auth-library

**Test coverage:** 15/15 passing (env resolution, native processors, registry)

## What We Tried

1. **Kept MCP subprocess in v1** — worked, but added unnecessary indirection. User immediately rejected.
2. **Tried direct `import("sharp")` with optional deps** — TypeScript static resolution broke on CI. Fixed by assigning module name to const before dynamic import.
3. **Used `import Jimp from "jimp"`** — Jimp v1 changed exports. Fixed by destructuring: `import { Jimp } from "jimp"`.

## Root Cause Analysis

**Why v1 was wrong:**
- MCP protocol is powerful for *server-to-client* communication (e.g., Claude Desktop talks to separate MCP servers). Using it for CLI subprocess communication added layers without benefit.
- User wanted to *own the code* and call tools directly, not debug through a subprocess boundary.

**Why TypeScript broke on optional deps:**
- `await import("string-literal")` triggers static TS2307 errors in the compiler's module resolution, even inside try/catch. The compiler can't see that the string is "optional."

**Why semantic-release didn't bump major:**
- Custom `releaseRules` array shadowed the default breaking-change rule. `feat!:` syntax requires the breaking-change rule at the *top* of the array to trigger major bump.

## Lessons Learned

1. **MCP is for inter-process communication, not local function calls.** When the client and server are in the same process, use direct imports. Avoid subprocess serialization unless you're solving for a specific constraint (network boundary, process isolation, language diversity).

2. **TypeScript can't see dynamic imports of string literals as optional.** Always assign module names to const variables before `await import()` if the dep might not be installed. Otherwise typecheck fails even with try/catch guards.

3. **Test semantic-release rules with a real breaking-change commit.** Custom `releaseRules` are powerful but require the breaking rule at the top of the array. Assume nothing; commit and push to a test branch.

4. **Read CHANGELOG before updating major libraries.** Jimp's export shape changed; v0.x used default export, v1 uses named export. Cost: 30 minutes of "Jimp.read is not a function" debugging.

## Next Steps

**v2.1 (deferred, graceful stubs with exit code 4):**
- gen-video, gen-music, gen-sfx, remove-bg, screenshot, img-to-video processors
- mouth.explain, mouth.customize routes
- DOCX, XLSX, PPTX parsers (currently stubbed via mammoth/xlsx)
- Minimax, ZhipuAI, ElevenLabs provider routes
- Vertex AI smoke test with real GCP project

**Immediate post-release:** Test native processor chain end-to-end with a real Claude Desktop session.

**Files to watch:**
- `/Volumes/GOON/www/oss/human-cli/src/processors/` — all in-process tool logic
- `/Volumes/GOON/www/oss/human-cli/src/mcp/tool-registry.ts` — tool surface area
- `/Volumes/GOON/www/oss/human-cli/package.json` — optional deps + semantic-release config
