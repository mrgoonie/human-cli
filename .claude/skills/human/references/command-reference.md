# Command Reference

Complete flag reference for the `human` CLI. Commands are grouped by capability. Every command accepts `--json` (or auto-emits JSON when stdout is not a TTY).

## Global flags (available on most commands)

| Flag                  | Purpose                                                                 |
|-----------------------|-------------------------------------------------------------------------|
| `--json`              | Force JSON envelope output                                              |
| `-o, --output <dir>`  | Write media to `<dir>`; `-o -` inlines base64 in envelope               |
| `--timeout <ms>`      | Max wall clock before abort (video/audio gen benefits from higher)      |
| `--env KEY=VAL`       | Inline env var (repeatable)                                             |
| `--api-key <key>`     | Override provider key inline                                            |
| `--inline-first`      | Invert resolution order so inline flags outrank OS env                  |
| `--model <id>`        | Override Gemini model (e.g. `gemini-2.5-flash`, `gemini-2.5-pro`)       |

Input forms every `<source>` / `<input>` / `<document>` accepts: local path, `https://` URL, `data:` URI, `-` (stdin), `@path` (for text commands, read literal file contents).

---

## eyes — vision & documents

### `eyes analyze <source>`
Analyze a single image.
- `--focus <text>` — what to look for
- `--detail quick|detailed` (default `detailed`)

### `eyes compare <image1> <image2>`
Compare two images.
- `--focus differences|similarities|layout|content`

### `eyes read <document>`
Extract text / tables.
- `--pages <range>` e.g. `1-3,7`
- `--extract text|tables|both`

Supported: PDF (→ Gemini multimodal), md, txt, csv, json, xml, html (local). DOCX/XLSX/PPTX **not yet** — surface a clear error to user.

### `eyes summarize <document>`
Summarize a document.
- `--length brief|medium|detailed`
- `--focus <text>`

---

## hands — generation & image ops

### Native AI (Gemini) image

#### `hands gen-image <prompt>`
Text → image.
- `--style <preset>` (photorealistic, illustration, anime, …)
- `--aspect 1:1|16:9|9:16|4:3|3:4`
- `--negative <text>`
- `--seed <int>`
- `--model <id>`

#### `hands edit-image <input> --prompt <text>`
Prompt-based edit over an existing image.

#### `hands inpaint <input> --prompt <text>`
- `--mask-prompt <text>` — natural-language mask region

#### `hands outpaint <input> --prompt <text>`
- `--direction up|down|left|right|all`
- `--ratio <n>` — expansion factor

#### `hands style-transfer <input> --prompt <text> --style-image <src>`

#### `hands compose <input> --prompt <text>`
- `--secondary <path> [<path>…]`
- `--layout <mode>`

### Local (Jimp) — no API calls, no keys needed

#### `hands crop <input>`
- `--mode <auto|manual>`
- `--x --y --width --height`

#### `hands resize <input>`
- `--width` / `--height` / `--scale`
- `--no-aspect` to disable aspect preservation

#### `hands rotate <input> --angle <deg>`

#### `hands mask <input> --mask <src>`

### Heavy media (v2.1)

#### `hands gen-video <prompt>`
Minimax Hailuo 2.3 (submit → poll → download). Pass generous `--timeout`.

#### `hands img-to-video <input>`
Image-seeded video.

#### `hands gen-music <prompt>` — Minimax Music 2.5
#### `hands gen-music-el <prompt>` — ElevenLabs Music
#### `hands gen-sfx <prompt>` — ElevenLabs Sound Effects

#### `hands remove-bg <input>`
Local AI matting.
- `--quality fast|balanced|high`

#### `hands screenshot <url>`
Playwright-backed.
- `--mode fullpage|viewport|element` (default fullpage)
- `--selector <css>` (required when mode=element)
- `--viewport <WxH>`
- `--wait <ms>`

---

## mouth — speech

### `mouth speak <text>`
Short TTS.
- `--voice <name>` (Zephyr, Kore, …)
- `--language <code>`
- `--style <descriptor>`

### `mouth narrate <content>`
Long-form multi-chunk.
- `--voice` / `--style` / `--language`
- `--max-chunk <chars>` (default ~1000)

### `mouth explain <code>`
Pedagogical code → speech (v2.1).

### `mouth customize <text>`
Generate a voice × style comparison matrix (v2.1).

---

## brain — reasoning

### `brain think <problem>`
Gemini chain-of-thought.
- `--max-thoughts <n>` (default 5)

### `brain reflect <analysis>`
Self-critique an existing analysis.
- `--focus <areas>` comma-separated
- `--goal <text>`
- `--detail` — verbose

### `brain analyze <input>`
Local pattern-based (no API cost).
- `--type general|logical|root-cause|tradeoff`

### `brain patterns`
Browse reasoning-framework catalog (local).
- `--query <keyword>`

---

## mcp — MCP stdio server

### `mcp start`
Expose all 26 tools over MCP stdio. Requires optional `@modelcontextprotocol/sdk`.

---

## config — user config management

```
human config init
human config set <KEY> <VALUE>
human config get <KEY>
human config list [--show-values]
human config unset <KEY>
```

File: `~/.config/human-cli/config.json` (Unix) or `%APPDATA%/human-cli/config.json` (Windows).

---

## doctor — diagnostics

```
human doctor [--json]
```

Checks: node version, provider keys present, optional deps installed, write access to output dir.

---

## tools & call — agent escape hatches

```
human tools --json                              # list registry
human call <tool_name> --args '<json>' --json
human call <tool_name> --args @file.json --json
cat payload.json | human call <tool_name> --args - --json
```

Tool names are snake_case (see `SKILL.md` → Command Map).
