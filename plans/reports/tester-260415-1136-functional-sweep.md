# Functional Sweep Report — human-cli v2.1.1

**Date:** 2026-04-15 11:36 → 12:26 (Asia/Saigon)
**Build:** `dist/cli.js` local (v2.1.1), Node v22.20.0, darwin/arm64
**Providers:** Gemini ✓ Minimax ✓ ElevenLabs ✓ (ZhipuAI not configured, optional)
**Fixtures:** `/tmp/human-test/{sample.jpg,sample.md,sample.csv}`
**Artifacts:** 21 generated files in `/tmp/human-test/` (png/wav/mp3/mp4)

## Summary

| Group  | Pass | Fail | Notes |
|--------|------|------|-------|
| Sanity | 3/3  | 0    | doctor, tools, config all green |
| brain  | 4/4  | 0    | think, reflect, analyze, patterns |
| eyes   | 4/4  | 0    | summarize 300s (slow, rate-throttled?) |
| hands AI | 6/6 | 0   | gen-image, edit, inpaint, outpaint, style-transfer, compose |
| hands local | 6/6 | 0 | crop, resize, rotate, mask, remove-bg, screenshot |
| mouth  | 4/4  | 0*   | speak pass; narrate/explain/customize need explicit `--voice` (see Bug 1) |
| hands heavy | 4/4 | 0 | sfx, music-el, music, video all passed |
| Agent escapes | 3/3 | 0 | call, tools, mcp |
| **Total** | **34/34** | **0** | 100% after flag/voice corrections |

## Per-test Results

### Phase 0 — Sanity (3/3 PASS)
| Test | Exit | Time | Notes |
|------|------|------|-------|
| doctor | 0 | <1s | Gemini/Minimax/ElevenLabs green, 26 tools |
| tools --json | 0 | <1s | 26 tools enumerated |
| config list | 0 | <1s | 3 keys from dotenv, masked |

### Phase 1 — brain (4/4 PASS)
| Test | Exit | Time | Notes |
|------|------|------|-------|
| patterns --query bayesian | 0 | 0s | local catalog |
| analyze (tradeoff) | 0 | 0s | local pattern |
| think (max-thoughts 3) | 0 | ~30s | Gemini CoT |
| reflect via stdin | 0 | ~60s | Gemini, good critique |

### Phase 2 — eyes (4/4 PASS)
| Test | Exit | Time | Notes |
|------|------|------|-------|
| compare (jpg vs jpg, similarities) | 0 | 5s | Gemini multimodal |
| read sample.md (both) | 0 | 1s | local parser |
| read sample.csv (tables) | 0 | 0s | local parser |
| summarize sample.md (brief) | 0 | **300s** | ⚠️ slow — possibly rate-limit retry |

### Phase 3 — hands AI (6/6 PASS)
| Test | Exit | Time | File |
|------|------|------|------|
| gen-image (apple, 1:1) | 0 | 8s | 1.15 MB PNG |
| edit-image (green apple) | 0 | 12s | 1.18 MB PNG |
| inpaint (add leaf) | 0 | 12s | 1.27 MB PNG |
| outpaint (ratio 1.3, all) | 0 | 10s | 2.33 MB PNG |
| style-transfer (oil) | 0 | 14s | 1.94 MB PNG |
| compose (secondary image) | 0 | 15s | 1.83 MB PNG |

### Phase 4 — hands local (6/6 PASS)
| Test | Exit | Time | File |
|------|------|------|------|
| crop (300×200 @ 100,100) | 0 | 1s | 80 KB PNG |
| resize (w=400) | 0 | 1s | 185 KB PNG |
| rotate (90°) | 0 | 0s | 1.77 MB PNG |
| mask (self-mask) | 0 | 1s | 1.77 MB PNG |
| remove-bg (rmbg, fast) | 0 | 4s | 1.60 MB PNG |
| screenshot (viewport, example.com) | 0 | 6s | 21 KB PNG |

### Phase 5 — mouth (4/4 PASS after correction)
| Test | Exit | Time | Notes |
|------|------|------|-------|
| speak --voice Zephyr | 0 | 4s | 144 KB WAV |
| narrate --voice Zephyr | 0 | 4.7s | 96 KB WAV (FAILED with default voice Sage) |
| explain --voice Zephyr | 0 | ~15s | 4.4 MB WAV (FAILED with default voice Apollo) |
| customize --voice Zephyr --compare Kore | 0 | ~8s | 2 WAVs (FAILED with default voice) |

### Phase 6 — hands heavy (4/4 PASS after flag correction)
| Test | Exit | Time | File |
|------|------|------|------|
| gen-sfx (rain, 3s) | 0 | 2.7s | 49 KB MP3 |
| gen-music-el (10s, instrumental) | 0 | 9s | 161 KB MP3 |
| gen-music (Minimax, music-2.5) | 0 | 62s | 1.33 MB MP3 |
| gen-video (Hailuo, 6s @ 768P) | 0 | 90s | 324 KB MP4 (1366×768) |

### Phase 7 — Agent escapes (3/3 PASS)
| Test | Exit | Notes |
|------|------|-------|
| call brain_patterns_info --args '{"query":"bayesian"}' | 0 | generic invoke works |
| tools --json | 0 | registry dumps 26 tools |
| mcp start (stdin init) | 0 | "MCP server started (26 tools, stdio)" |

## Bugs / Defects Found

### 🐛 Bug 1 — Default voices in `mouth explain/narrate/customize` invalid
**Severity:** Medium (blocks default usage)

- `mouth explain` default `--voice Apollo` → Gemini TTS 400: *"Voice name Apollo is not supported"*
- `mouth narrate` default `--voice Sage` → same 400
- `mouth customize` default voice → same 400

**Root cause:** Gemini TTS allowed-voice list now lowercase (`achernar, achird, algenib, algieba, zephyr, kore, …`). Hardcoded defaults in processors not updated. `mouth speak` passes because user usually provides `--voice`.

**Fix:** Update defaults in `src/processors/mouth/*` to a voice that's actually in the current allowed list (e.g. `Zephyr`/`Kore` which still work capitalized — Gemini accepts both casings for some — or lowercase versions). Verify against the live allowed list.

**Workaround for users:** Always pass `--voice Zephyr` (or Kore).

### 🐛 Bug 2 — `eyes summarize` took 300s
**Severity:** Low (single data point, needs reproduction)

- Same doc (654-byte markdown), `--length brief` → 300s vs analyze @ 5s.
- Other Gemini calls in sweep ran fine (5-90s).
- Possibly hit rate limit + internal retry (no explicit timeout surfaced).

**Follow-up:** Retest with `--timeout`, inspect retry behavior in `src/processors/eyes/read-document.ts`.

### 🐛 Bug 3 — `--model MiniMax-Hailuo-2.3-Fast` silently ignored in `gen-video`
**Severity:** Low (functionality works, but flag not honored)

- Passed `--model MiniMax-Hailuo-2.3-Fast`, logs show `model=MiniMax-Hailuo-2.3` (default).
- Likely flag parsed but not plumbed to provider request body.

**Fix:** Check `src/processors/hands/gen-video.ts` — ensure model from arg overrides default.

## Documentation Gotchas

### 📝 Gotcha 1 — CLI flag names ≠ tool-registry input names
Documented this partially in SKILL.md already, but worth surfacing:

| CLI surface | Tool registry (for `human call`) |
|-------------|----------------------------------|
| `--duration` | `duration_seconds` |
| `--length` | `music_length_ms` |
| `--instrumental` | `force_instrumental` |
| `--programming-lang` | `programming_language` |
| `--compare` | `compare_voices` |

Both should be exercised in tests. SKILL.md → "Command Map" table could be extended with a "flag name" column.

### 📝 Gotcha 2 — `doctor` command does not emit JSON envelope
`human doctor --json` still prints human format. The `--json` flag is a no-op here. Other commands (`tools`, per-tool invocations) work correctly.

**Recommendation:** Either (a) honor `--json` in doctor, or (b) document that doctor is human-only.

## Exit Code Coverage

| Code | Triggered | Observation |
|------|-----------|-------------|
| 0 | ✓ (all successes) | works |
| 1 | ✓ (TTS 400, flag mismatch, voice reject) | used for both provider errors AND usage errors — potentially confusing |
| 2 | Not hit | Commander flag errors emit exit 1, not 2 — README claims code 2 for "usage error" |
| 3 | Not hit | would need missing key |
| 4 | Not hit | would need missing optional dep |

**Recommendation:** audit exit code paths — at minimum, flag-parse errors should surface as exit 2 per the documented contract.

## Artifacts (inspectable)

All in `/tmp/human-test/`:
- Images: 12 PNGs (gen + edits + local ops + screenshot + remove-bg)
- Audio: 5 WAVs (speak/narrate/explain/customize ×2) + 3 MP3s (sfx/music-el/minimax-music)
- Video: 1 MP4 (6s @ 768P, Hailuo 2.3)
- Logs: `sweep.log`, sample fixtures, `run-sweep.sh`

## Unresolved Questions

1. Is the 300s on `eyes summarize` reproducible, or a one-off rate-limit tail?
2. Is the `Apollo`/`Sage` default regression a provider-side allow-list change or was it always broken (defaults introduced after the allow-list shrank)?
3. Should `gen-video --model MiniMax-Hailuo-2.3-Fast` be a hard-error if the flag is parsed but not forwarded, or silently fall back?
4. Does `doctor --json` ever intend to emit JSON, or is the flag reserved for per-tool invocations only?
5. Are exit codes 2/3/4 paths reachable with the current CLI, or have they regressed to all-exit-1?
