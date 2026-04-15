# Agent Recipes

Copy-paste shell recipes for the 12 most common agent tasks. Every recipe:
- Uses `--json`
- Checks `ok` before using `data`
- Quotes inputs safely

Assumes `jq` available. Substitute with your own JSON parser if not.

---

## 1. Describe a local image with a focus

```bash
human eyes analyze ./screenshot.png --focus "accessibility issues" --detail detailed --json \
  | tee /tmp/out.json >/dev/null
ok=$(jq -r '.ok' /tmp/out.json)
if [ "$ok" = "true" ]; then
  jq -r '.data.text' /tmp/out.json
else
  echo "FAIL: $(jq -r '.error' /tmp/out.json)" >&2; exit 1
fi
```

## 2. Compare two design mocks

```bash
human eyes compare ./v1.png ./v2.png --focus differences --json \
  | jq -r 'if .ok then .data.text else "ERR: \(.error)" end'
```

## 3. Summarize a long PDF into bullets

```bash
human eyes summarize ./whitepaper.pdf --length brief --focus "breaking changes" --json \
  | jq -r '.data.text'
```

## 4. Extract tables from a report

```bash
human eyes read ./quarterly.pdf --pages "4-7" --extract tables --json \
  | jq -r '.data.text'
```

## 5. Generate an image with a specific aspect & seed

```bash
out=/tmp/session-$$
mkdir -p "$out"
human hands gen-image "isometric vector map of a small town, pastel" \
  --aspect 16:9 --style illustration --seed 42 \
  -o "$out" --json | jq -r '.data.media[0].path'
```

## 6. Inpaint a region described in natural language

```bash
human hands inpaint ./photo.jpg \
  --prompt "replace the background with a sunset beach" \
  --mask-prompt "everything behind the person" \
  -o /tmp/edits --json | jq -r '.data.media[0].path'
```

## 7. Outpaint to 16:9 for a hero banner

```bash
human hands outpaint ./portrait.jpg \
  --prompt "extend the environment naturally, golden hour" \
  --direction all --ratio 1.8 \
  -o /tmp/banners --json | jq -r '.data.media[0].path'
```

## 8. Remove background + resize to 512px wide

```bash
stripped=$(human hands remove-bg ./item.jpg --quality high -o /tmp/rbg --json | jq -r '.data.media[0].path')
human hands resize "$stripped" --width 512 -o /tmp/rbg --json | jq -r '.data.media[0].path'
```

## 9. Screenshot a full page then analyze its UX

```bash
shot=$(human hands screenshot https://example.com --mode fullpage -o /tmp/shots --json \
  | jq -r '.data.media[0].path')
human eyes analyze "$shot" --focus "hierarchy, CTA clarity, above-the-fold density" --json \
  | jq -r '.data.text'
```

## 10. Read a markdown file aloud as narration

```bash
human mouth narrate @./post.md --voice Zephyr --max-chunk 900 \
  -o /tmp/audio --json | jq -r '.data.media[0].path'
```

## 11. Chain: think → reflect → ship

```bash
human brain think "design a token-bucket rate limiter, multi-tenant" --max-thoughts 8 --json \
  > /tmp/think.json

jq -r '.data.text' /tmp/think.json \
  | human brain reflect - --focus "race conditions,observability" --goal "prod readiness" --detail --json \
  > /tmp/reflect.json

jq -r '.data.text' /tmp/reflect.json
```

## 12. Fallback to `call` when a flag isn't surfaced

```bash
# Pass a precise JSON payload directly to the underlying tool
human call eyes_analyze --args '{
  "source": "./chart.png",
  "focus": "statistical anomalies",
  "detail": "detailed"
}' --json | jq -r '.data.text'
```

---

## Session-start preamble (recommended)

Put this at the top of any agent session that will use `human`:

```bash
# 1. Confirm the binary exists & env is wired up
command -v human >/dev/null || { echo "install: npm i -g @goonnguyen/human-cli" >&2; exit 4; }
human doctor --json | jq '.ok'

# 2. Isolated output dir for this session
SESS=/tmp/human-sess-$$
mkdir -p "$SESS"
echo "SESSION OUTPUT DIR: $SESS"
```

Then pass `-o "$SESS"` to every media command.
