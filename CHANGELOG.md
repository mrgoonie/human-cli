## [2.0.0](https://github.com/mrgoonie/human-cli/compare/v1.1.0...v2.0.0) (2026-04-14)

### ⚠ BREAKING CHANGES

* v1.1.0 already shipped the MCP-subprocess removal; this
commit retroactively bumps the version to v2.0.0 to reflect the contract
break. No API or behaviour change vs v1.1.0.

### Bug Fixes

* CI typecheck + breaking-change bump rule ([d0ca059](https://github.com/mrgoonie/human-cli/commit/d0ca059daae1c53f56b6940682f3f8ad0b5d5754))

## [1.1.0](https://github.com/mrgoonie/human-cli/compare/v1.0.0...v1.1.0) (2026-04-14)

### ⚠ BREAKING CHANGES

* v1's MCP client/subprocess architecture is removed. All
commands now invoke processors in-process via direct Gemini SDK calls.

## Why
v1 spawned @goonnguyen/human-mcp as a stdio subprocess and proxied every
tool call through JSON-RPC. Each invocation paid the subprocess + handshake
cost, and the CLI was tightly coupled to a moving MCP surface.

## What's native now
- eyes: analyze, compare, read-document, summarize-document
- hands: gen-image, edit-image, inpaint, outpaint, style-transfer, compose
  (Gemini) + crop, resize, rotate, mask (Jimp, local)
- mouth: speak, narrate (Gemini TTS with in-memory WAV wrapping)
- brain: think, reflect (Gemini) + analyze, patterns (local)
- mcp: native stdio server exposing the internal tool registry

## Architecture
- src/core/           config schema, logger, errors, media-loader, Gemini client
- src/processors/     native implementation of each tool, grouped by organ
- src/mcp/            tool-registry + stdio server (optional SDK dep)
- src/runtime/        run-processor wraps envelope formatting & exit codes
- src/commands/       commander bindings, thin wrappers over runProcessor

## Dependencies
- Added: @google/generative-ai, jimp, marked, mime-types, wav, zod
- Moved to optionalDependencies: @goonnguyen/human-mcp, @modelcontextprotocol/sdk,
  @google-cloud/vertexai, google-auth-library, sharp, playwright, rmbg,
  fluent-ffmpeg, mammoth, xlsx, pptx-automizer

## Deferred to v2.1 (graceful error on invocation)
- hands: gen-video, img-to-video, gen-music, gen-sfx, gen-music-el,
  remove-bg, screenshot
- mouth: explain, customize
- eyes: DOCX/XLSX/PPTX document parsers

## Bundle
- v1 cli.js: 48KB + 300MB of human-mcp transitive deps
- v2 cli.js: 95KB, all provider deps lazy-loaded when actually used

### Features

* native processor rewrite — drop MCP subprocess layer ([10dab56](https://github.com/mrgoonie/human-cli/commit/10dab563d1a9701d929a3c6cd5c9eafb701e73c8))

## 1.0.0 (2026-04-14)

### Features

* initial release of human-cli ([e27af03](https://github.com/mrgoonie/human-cli/commit/e27af039b87e653a8ed5dfd9e4eb1cfa54b2760f))

### Bug Fixes

* rename package to @goonnguyen/human-cli for npm publish ([0781ca3](https://github.com/mrgoonie/human-cli/commit/0781ca3e7845c2b5d494be1880f06dec42d5f060))
