# Using `human-cli` from AI agents

This is the integration guide for LLM-driven agents (Claude Code, Cline, Aider, custom orchestrators, etc.) that want to invoke Human MCP capabilities via shell commands.

## Why use `human-cli` from an agent?

- **No MCP client needed** — any agent that can run shell commands can use it.
- **Deterministic output** — every command emits a JSON envelope when stdout is not a TTY (or when `--json` is passed).
- **Stable exit codes** — `0` ok, `1` tool error, `2` usage error, `3` config error, `4` MCP server not found.
- **Unified env resolution** — one config chain for keys across Gemini/Minimax/ZhipuAI/ElevenLabs.

## Output contract

Every command that invokes an MCP tool returns:

```json
{
  "ok": true,
  "tool": "eyes_analyze",
  "data": {
    "text": "markdown-formatted response",
    "media": [
      { "kind": "image", "mimeType": "image/png", "path": "/abs/path/to/file.png" }
    ]
  },
  "metadata": { "duration_ms": 1234 },
  "error": null
}
```

On failure:

```json
{ "ok": false, "tool": "...", "data": {...}, "metadata": {...}, "error": "reason" }
```

When `-o -` is set, binary outputs are inlined as `"base64": "<data>"` instead of a file path.

## Discovering tools

```bash
human tools --json
# → { "ok": true, "tools": [ { "name": "...", "description": "..." }, ... ] }
```

## Calling arbitrary tools

When the dedicated command surface doesn't cover a parameter you need:

```bash
human call <tool-name> --args '<json>' --json
human call eyes_analyze --args '{"source":"img.png","detail":"quick"}' --json
human call eyes_analyze --args @payload.json --json
echo '{"source":"img.png"}' | human call eyes_analyze --args - --json
```

## Piping patterns

```bash
# Text → stdout → downstream tool
human eyes analyze img.png --json | jq -r .data.text

# File → command via stdin
cat report.md | human eyes summarize - --length brief --json

# Base64 directly in pipeline (no temp files)
human hands gen-image "fox" -o - --json \
  | jq -r '.data.media[0].base64' \
  | base64 -d > fox.png
```

## Env vars the agent should set

Minimum:

```
GOOGLE_GEMINI_API_KEY   # required
```

Optional:

```
MINIMAX_API_KEY         # music, SFX, alt video/speech
ELEVENLABS_API_KEY      # premium TTS
ZHIPUAI_API_KEY         # alt vision/image provider
SPEECH_PROVIDER         # gemini | minimax | elevenlabs
VIDEO_PROVIDER          # gemini | minimax | zhipuai
VISION_PROVIDER         # gemini | zhipuai
IMAGE_PROVIDER          # gemini | zhipuai
```

## Resolution priority (reminder)

`OS env > user config JSON > process.env > .env.* > inline --env` (higher wins).

Agents that want inline flags to win should pass `--inline-first` or set `HUMAN_CLI_INLINE_FIRST=1`.

## Best practices for agents

1. **Always use `--json`** — don't parse human-formatted output.
2. **Check `ok` first** — then use `error` for failure reason.
3. **Use `-o /tmp/some-dir`** — isolate media outputs per session.
4. **Use `--timeout <ms>`** — video generation can take minutes.
5. **Call `human doctor --json`** once at session start to verify env.
6. **Use `-` or `@file`** for large text inputs to avoid argv limits.
