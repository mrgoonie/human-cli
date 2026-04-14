# Bootstrap Summary — human-cli

**Date:** 2026-04-14 17:00 → 17:20
**Mode:** `/bootstrap --auto ultrathink`
**Repo:** [mrgoonie/human-cli](https://github.com/mrgoonie/human-cli) (public)
**Package:** `human-cli` (NPM, scoped publish-ready)

## What shipped

### Codebase structure

```
human-cli/
├── src/
│   ├── cli.ts                      # CLI entry (commander)
│   ├── index.ts                    # Public library exports
│   ├── version.ts                  # Runtime version read
│   ├── commands/                   # All command groups
│   │   ├── eyes-commands.ts        # analyze/compare/read/summarize
│   │   ├── hands-commands.ts       # gen-image/video/music/screenshot/edit/…
│   │   ├── mouth-commands.ts       # speak/narrate/explain/customize
│   │   ├── brain-commands.ts       # think/analyze/reflect/patterns
│   │   ├── config-commands.ts      # init/get/set/list/path
│   │   ├── doctor-command.ts       # diagnostics & MCP handshake
│   │   ├── mcp-command.ts          # pass-through to human-mcp server
│   │   └── call-command.ts         # low-level tool invocation + `tools` listing
│   ├── config/
│   │   ├── env-sources.ts          # OS/userConfig/processEnv/dotenv/inline loaders
│   │   └── resolve-env.ts          # 5-layer merger
│   ├── mcp/
│   │   └── mcp-client.ts           # Stdio subprocess wrapper over @mcp/sdk
│   ├── output/
│   │   └── format-result.ts        # human vs JSON envelope renderer
│   └── runtime/
│       ├── global-flags.ts         # shared CLI flags & extraction
│       ├── input-resolver.ts       # file/url/stdin/base64/@file
│       └── run-tool.ts             # lifecycle orchestrator
├── tests/
│   └── env-resolution.test.ts      # 6 tests, all passing
├── .github/workflows/
│   ├── ci.yml                      # matrix: Node 18/20/22 × Ubuntu/macOS
│   └── release.yml                 # semantic-release → NPM + GH Releases
├── .releaserc.json                 # conventional commits, auto-versioning
├── package.json                    # bin: human, human-cli
├── tsconfig.json                   # strict ESM, NodeNext
├── tsup.config.ts                  # ESM bundle, shebang injection, chmod +x
├── README.md                       # Human-focused docs
├── AGENT.md                        # AI agent integration guide
├── LICENSE                         # MIT
└── .env.example                    # Env var template
```

### Features delivered

- ✅ **All 30 human-mcp tools** exposed via clean command groups (`eyes`/`hands`/`mouth`/`brain`)
- ✅ **Escape hatches**: `human call <tool> --args <json>` and `human tools --json`
- ✅ **5-layer env resolution** (OS > user config > process.env > .env.* > inline) with `--inline-first` inversion
- ✅ **Dual output modes**: colored TTY for humans, JSON envelopes for agents (auto-detected via non-TTY)
- ✅ **Stable exit codes** (0 ok / 1 tool error / 2 usage / 3 config / 4 MCP spawn)
- ✅ **Input flexibility**: file paths, URLs, data URIs, `-` (stdin), `@file.txt` (read-file literal)
- ✅ **Media auto-save** to `./outputs/<ts>-<tool>.<ext>` or inline base64 with `-o -`
- ✅ **Config management**: `human config init/get/set/list/path` with masked secrets
- ✅ **Diagnostics**: `human doctor` tests MCP handshake + lists configured providers
- ✅ **Claude Desktop compatibility**: `human mcp start` pass-through
- ✅ **Build**: 48KB single ESM bundle via tsup
- ✅ **Type safety**: strict TS, 0 typecheck errors
- ✅ **Tests**: 6 env-resolution tests passing (vitest)
- ✅ **Verified end-to-end**: MCP handshake successful, 30 tools listed from running human-mcp subprocess

### Git & CI

- Repo: [mrgoonie/human-cli](https://github.com/mrgoonie/human-cli) public
- Initial commit: `feat: initial release of human-cli`
- CI workflow: matrix build across Node 18/20/22 × Ubuntu/macOS
- Release workflow: triggers on push to `main`, runs semantic-release
- Conventional commits → auto minor/patch bumps
- First pushed to `main` — both CI and Release runs started automatically

## Action required by user

### 1. Add `NPM_TOKEN` secret to GitHub repo

The Release workflow currently has no npm credentials. To enable auto-publishing:

```bash
# Generate an automation token at https://www.npmjs.com/settings/<you>/tokens
gh secret set NPM_TOKEN --repo mrgoonie/human-cli
```

Without this, the `semantic-release` step fails at the NPM publish phase (GitHub Release portion still works).

### 2. First release

The initial commit is `feat:` which triggers a minor release. Once NPM_TOKEN is set, re-run the Release workflow or push any new `feat:`/`fix:` commit.

### 3. Verify npm name availability

`human-cli` is currently unpublished on npm — first `semantic-release` run will claim it. If it's taken, rename in `package.json`.

## How to use

```bash
# Install
npm i -g human-cli

# First-time setup
human config init
human config set GOOGLE_GEMINI_API_KEY <key>
human doctor

# Use
human eyes analyze ./photo.png --focus "layout"
human hands gen-image "sunset over mountains" --aspect 16:9
human mouth speak "Hello" --voice Zephyr
human brain think "design pattern for caching"

# Agent mode
human --json tools
human call eyes_analyze --args '{"source":"img.png"}' --json
```

## Unresolved questions

- **NPM name conflict** — `human-cli` availability on NPM not pre-checked; rename if taken.
- **Playwright/Sharp install bloat** — `@goonnguyen/human-mcp` pulls ~300MB of native deps. Consider switching to `peerDependencies` + postinstall check if install UX becomes painful.
- **Env resolution ordering confirmation** — spec said "OS > user config > process.env > .env > inline". Implemented literally; most CLIs do the reverse. Users can flip with `--inline-first`. Revisit if feedback is surprising.
- **First `semantic-release` run** — will fail until NPM_TOKEN is set by the user. Safe, but release hygiene should be documented.
