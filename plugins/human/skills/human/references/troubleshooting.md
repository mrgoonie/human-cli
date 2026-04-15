# Troubleshooting

## Exit code reference

| Exit | Class                | Typical cause                                           | First action                                              |
|------|----------------------|---------------------------------------------------------|-----------------------------------------------------------|
| 0    | success              | —                                                       | parse `.data`                                             |
| 1    | tool error           | provider rate limit, bad input, safety refusal          | read `.error`; show user; do NOT loop-retry unconditionally |
| 2    | usage error          | wrong flag / missing arg                                | `human <group> <cmd> --help`                              |
| 3    | config error         | missing/invalid API key or config shape                 | `human doctor --json` → `human config set ...`            |
| 4    | missing dep          | optional dep absent, or `mcp start` without SDK          | install via npm, or downgrade to a native command         |

## Common error patterns

### `error: "API key not configured"`
→ `human config set GOOGLE_GEMINI_API_KEY <key>` (or export env var). Then re-run.

### `error: "Unsupported document type: .docx"`
DOCX/XLSX/PPTX parsing is deferred to a future release. Ask user to convert to PDF or export to markdown.

### `error: "Playwright not installed"` (hands screenshot)
`npx playwright install chromium`. Playwright is optional — npm installs it only if your platform supports it.

### `error: "rmbg native binding missing"` (hands remove-bg)
Optional native dep. Platform-specific. Suggest user try `npm rebuild rmbg` or fallback to another tool.

### `error: "MCP SDK not found"` (human mcp start)
`npm i -g @modelcontextprotocol/sdk` (or add to deps). Only needed when serving MCP.

### Video / music polling times out
Default timeout is typically 2-5 min. Provider jobs can exceed that. Pass `--timeout 600000` (10 min) or higher.

### Huge argv / "Argument list too long"
Move large text to a file then pass `@path/to/text` (for text commands) or `-` via stdin:
```bash
cat big.md | human mouth narrate - --json
human mouth narrate @big.md --json
```

### Output collides between sessions
Default output dir `./outputs/` is shared. Always pass `-o /tmp/sess-<id>` for agent sessions.

## Provider quirks

- **Gemini** — primary for vision, short TTS, image gen. Rate limits on free tier are tight; batch carefully.
- **Minimax** — video (Hailuo 2.3), music. Submit→poll model; first response is a job id, final download happens inside the processor.
- **ElevenLabs** — premium TTS, SFX, Music. Best voice quality but costs per minute.
- **ZhipuAI** — alternate vision/image route. Useful when Gemini is rate-limited.

Switch providers with env vars:
```bash
SPEECH_PROVIDER=elevenlabs human mouth speak "hi"
VISION_PROVIDER=zhipuai    human eyes analyze pic.png --json
```

## Config sanity checks

```bash
human config list --show-values       # see what's actually wired
human doctor --json | jq .checks      # structured diagnostic
```

Resolution order (higher wins):
1. OS env vars
2. User config JSON
3. `process.env` (runtime)
4. `.env.*` in CWD
5. Inline `--env KEY=VAL` / `--api-key`

To flip #5 to highest: `--inline-first` or `HUMAN_CLI_INLINE_FIRST=1`.

## When to retry vs. give up

- Retry once on network-y errors (timeout, 5xx, "connection reset") after a short backoff.
- Do NOT retry on `ok: false` with safety/policy refusal, invalid args, or config errors.
- Max 2 retries. Then surface the error to the user verbatim.

## Unresolved

- DOCX/XLSX/PPTX parsing (deferred to v2.2).
- Gemini Veo video route (deferred). Current video runs through Minimax Hailuo.
- Minimax / ElevenLabs TTS inside `mouth speak` (still Gemini-only in v2.1).
