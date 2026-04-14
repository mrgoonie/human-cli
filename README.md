# human-cli

> Human-friendly & AI agent-friendly CLI for [Human MCP](https://github.com/human-mcp/human-mcp) — vision, speech, generation, and reasoning in one terminal command.

`human-cli` wraps the [Human MCP](https://www.npmjs.com/package/@goonnguyen/human-mcp) server so you can use all its capabilities from the shell — without needing Claude Desktop or any IDE plugin. It spawns `human-mcp` as a local stdio subprocess and exposes every tool under a clean, consistent command surface.

- 👁️ **Eyes** — analyze images/videos/GIFs, read & summarize documents (PDF/DOCX/XLSX/PPTX/...)
- ✋ **Hands** — generate images & videos, edit/inpaint/outpaint, style transfer, screenshots, music & SFX
- 👄 **Mouth** — text-to-speech, long-form narration, code explanation (Gemini / Minimax / ElevenLabs)
- 🧠 **Brain** — sequential thinking, AI reflection, pattern analysis

Works great for:
- 💻 **Humans** — colored output, progress spinners, sensible file names
- 🤖 **AI agents** — `--json` envelopes, stdin piping, stable exit codes, non-TTY auto-detection

## Install

```bash
npm i -g human-cli
```

Requires Node.js ≥ 18. `@goonnguyen/human-mcp` is pulled in as a dependency.

## Quick Start

```bash
# 1. Set your Gemini API key (free tier available)
human config init
human config set GOOGLE_GEMINI_API_KEY <your-key>

# 2. Verify everything works
human doctor

# 3. Try it
human eyes analyze ./screenshot.png --focus "UI bugs"
human hands gen-image "a red fox in snow" --aspect 16:9
human mouth speak "Hello, world" --voice Zephyr
human brain think "design a rate limiter"
```

## Usage

```
human <group> <action> [args] [flags]

Groups:
  eyes     vision & document analysis
  hands    generation, editing, screenshots, media
  mouth    text-to-speech
  brain    reasoning & reflection
  mcp      launch the raw human-mcp server (for Claude Desktop)
  config   manage user config
  doctor   run diagnostics
  tools    list all available MCP tools
  call     invoke any MCP tool with raw JSON args (escape hatch)
```

### Input conventions

Every command that accepts a source (file/image/document/text) understands:

| Form | Example |
|---|---|
| Local path | `./photo.png` |
| URL        | `https://example.com/img.jpg` |
| Data URI   | `data:image/png;base64,iVBORw…` |
| stdin      | `-` |
| File literal | `@path/to/text.md` (for text commands) |

### Output

By default, media outputs are saved to `./outputs/<timestamp>-<tool>.<ext>` and the path is printed.

- `-o <dir>` — save to a different directory
- `-o -` — keep base64 inline in the JSON envelope (agent mode)
- `--json` — force structured output (auto when stdout is not a TTY)

Agent envelope:
```json
{
  "ok": true,
  "tool": "eyes_analyze",
  "data": { "text": "...", "media": [{ "kind": "image", "path": "/abs/path.png" }] },
  "metadata": { "duration_ms": 1234 },
  "error": null
}
```

Exit codes: `0` ok · `1` tool error · `2` usage error · `3` config error · `4` MCP server not found.

## Configuration

`human-cli` resolves env vars from **five layered sources**. Values from higher-priority sources override lower ones:

| Priority | Source | Typical Use |
|---|---|---|
| 1 (highest) | **OS env vars** | System/shell/deployment env |
| 2 | **User config JSON** (`~/.config/human-cli/config.json` or `%APPDATA%/human-cli/config.json`) | Persistent personal settings |
| 3 | **process.env** | Runtime (wrappers, CI) |
| 4 | **.env.*** files in CWD (`.env`, `.env.<NODE_ENV>`, `.env.local`) | Project-local |
| 5 (lowest) | **Inline flags** (`--env KEY=VAL`, `--api-key`, …) | Ad-hoc overrides |

> **Note:** The convention that OS env wins is unusual — most CLIs make inline flags the highest priority. This ordering is intentional for agent-driven environments where the spawning process wants deterministic control. To invert it, pass `--inline-first` or set `HUMAN_CLI_INLINE_FIRST=1`.

### User config JSON

The file can use either nested shape:

```json
{
  "gemini":     { "apiKey": "...", "model": "gemini-2.5-flash" },
  "minimax":    { "apiKey": "..." },
  "elevenlabs": { "apiKey": "..." },
  "providers":  { "speech": "gemini", "video": "gemini" }
}
```

…or flat env-style keys:

```json
{
  "GOOGLE_GEMINI_API_KEY": "...",
  "MINIMAX_API_KEY": "...",
  "SPEECH_PROVIDER": "elevenlabs"
}
```

### All supported env vars

Inherited from `human-mcp`. Key groups:

- **Gemini (required):** `GOOGLE_GEMINI_API_KEY`, `GOOGLE_GEMINI_MODEL`, `GOOGLE_GEMINI_IMAGE_MODEL`
- **Vertex AI (alt):** `USE_VERTEX=1`, `VERTEX_PROJECT_ID`, `VERTEX_LOCATION`, `GOOGLE_APPLICATION_CREDENTIALS`
- **Optional providers:** `MINIMAX_API_KEY`, `ZHIPUAI_API_KEY`, `ELEVENLABS_API_KEY`
- **Provider defaults:** `SPEECH_PROVIDER`, `VIDEO_PROVIDER`, `VISION_PROVIDER`, `IMAGE_PROVIDER`
- **Cloudflare R2 storage:** `CLOUDFLARE_CDN_*`
- **Server/transport:** `TRANSPORT_TYPE`, `HTTP_PORT`, `HTTP_HOST`, `LOG_LEVEL`

Run `human config list` to see which values are resolved from which source.

## Examples

```bash
# Vision
human eyes analyze screenshot.png --focus "layout and accessibility"
human eyes compare before.png after.png
human eyes read report.pdf --pages 1-5 --extract both
cat article.md | human eyes summarize - --length brief

# Image generation & editing
human hands gen-image "cyberpunk cat" --style digital_art --aspect 16:9
human hands edit-image photo.jpg -p "make it sunset"
human hands remove-bg portrait.jpg -o ./clean
human hands screenshot https://github.com --mode fullpage

# Video
human hands gen-video "rocket launch" --provider gemini --duration 8s
human hands img-to-video still.jpg -p "slow pan right"

# Speech
human mouth speak "Build something amazing" --voice Zephyr
human mouth narrate @chapter1.md --style storytelling --chapter-breaks
human mouth explain @src/auth.ts --programming-lang typescript

# Reasoning
human brain think "design a rate limiter for 100k req/s"
human brain reflect @analysis.md --focus assumptions,logic_gaps

# Escape hatches for agents
human tools --json | jq '.tools[].name'
human call eyes_analyze --args '{"source":"img.png","detail":"quick"}' --json
```

## Use with Claude Desktop

`human-cli` can *also* launch the underlying MCP server for Claude Desktop:

```json
{
  "mcpServers": {
    "human": {
      "command": "human",
      "args": ["mcp", "start"]
    }
  }
}
```

Your API keys are resolved from the 5-source chain, so setting `human config set GOOGLE_GEMINI_API_KEY ...` once is enough.

## Development

```bash
git clone https://github.com/mrgoonie/human-cli
cd human-cli
npm install
npm run dev       # tsup watch mode
npm run typecheck
npm run build
node dist/cli.js --help
```

See [AGENT.md](./AGENT.md) for the agent integration guide.

## License

MIT © [Duy Nguyen](https://github.com/mrgoonie)
