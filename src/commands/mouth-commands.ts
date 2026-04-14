/**
 * "mouth" command group — native TTS & narration via Gemini.
 * Minimax/ElevenLabs routing deferred to v2.1.
 */
import type { Command } from "commander";
import { readFileSync, existsSync } from "node:fs";
import { runProcessor } from "../runtime/run-processor.js";
import { extractGlobalFlags } from "../runtime/global-flags.js";
import { speak, narrate } from "../processors/mouth/speak.js";
import {
  explainCode,
  customizeVoice
} from "../processors/mouth/explain-and-customize.js";

export function registerMouthCommands(program: Command): void {
  const mouth = program.command("mouth").description("Text-to-speech: speak & narrate");

  mouth
    .command("speak <text>")
    .description("Convert text to speech. Use '-' to read from stdin or @file.txt for a file.")
    .option("--voice <name>", "Voice (e.g. Zephyr, Sage, Kore)")
    .option("--model <m>", "TTS model id", "gemini-2.5-flash-preview-tts")
    .option("--language <lang>", "Language code", "en-US")
    .option("--style <text>", "Style prompt (e.g. 'cheerful and energetic')")
    .action(async (text: string, opts, cmd) => {
      await runProcessor({
        tool: "mouth.speak",
        globals: extractGlobalFlags(cmd),
        run: (config) =>
          speak(config, {
            text: materializeText(text),
            voice: opts.voice,
            model: opts.model,
            language: opts.language,
            stylePrompt: opts.style
          }),
        toOutput: (r) => ({
          text: `Voice: ${r.metadata.voice}, ${r.metadata.sampleRate}Hz, ${r.metadata.textLength} chars`,
          media: [{ kind: "audio", mimeType: r.mimeType, base64: r.audioBase64 }]
        })
      });
    });

  mouth
    .command("narrate <content>")
    .description("Long-form narration. Use '-' (stdin) or @file.md for input.")
    .option("--voice <name>", "Voice", "Sage")
    .option("--style <mode>", "professional | casual | educational | storytelling", "professional")
    .option("--max-chunk <n>", "Max chars per TTS chunk", Number, 8000)
    .option("--language <lang>", "Language", "en-US")
    .action(async (content: string, opts, cmd) => {
      await runProcessor({
        tool: "mouth.narrate",
        globals: extractGlobalFlags(cmd),
        run: (config) =>
          narrate(config, {
            content: materializeText(content),
            voice: opts.voice,
            narrationStyle: opts.style,
            maxChunkSize: opts.maxChunk,
            language: opts.language
          }),
        toOutput: (r) => ({
          text: `Narrated ${r.chunks} chunk(s), voice ${r.metadata.voice}`,
          media: [{ kind: "audio", mimeType: r.mimeType, base64: r.audioBase64 }]
        })
      });
    });

  mouth
    .command("explain <code>")
    .description("Generate a spoken explanation of code. '-' / @file supported.")
    .option("--voice <name>", "Voice (default: Apollo)")
    .option("--language <lang>", "Spoken language", "en-US")
    .option("--programming-lang <lang>", "Programming language of the code")
    .option("--level <lvl>", "beginner | intermediate | advanced", "intermediate")
    .option("--no-examples", "Skip inline usage examples")
    .action(async (code: string, opts, cmd) => {
      await runProcessor({
        tool: "mouth.explain",
        globals: extractGlobalFlags(cmd),
        run: (config) =>
          explainCode(config, {
            code: materializeText(code),
            voice: opts.voice,
            language: opts.language,
            programmingLanguage: opts.programmingLang,
            explanationLevel: opts.level,
            includeExamples: opts.examples !== false
          }),
        toOutput: (r) => ({
          text: `Explanation (${r.metadata.voice}, ${r.metadata.language}):\n\n${r.explanation}`,
          media: [{ kind: "audio", mimeType: r.mimeType, base64: r.audioBase64 }]
        })
      });
    });

  mouth
    .command("customize <text>")
    .description("Test & compare voice + style combinations")
    .option("--voice <name>", "Primary voice")
    .option("--language <lang>", "Language", "en-US")
    .option("--compare <names>", "Comma-separated voices to compare")
    .option("--variations <list>", "Comma-separated style prompts")
    .action(async (text: string, opts, cmd) => {
      await runProcessor({
        tool: "mouth.customize",
        globals: extractGlobalFlags(cmd),
        run: (config) =>
          customizeVoice(config, {
            text: materializeText(text),
            voice: opts.voice,
            language: opts.language,
            compareVoices: opts.compare ? String(opts.compare).split(",").map((s) => s.trim()) : undefined,
            styleVariations: opts.variations ? String(opts.variations).split(",").map((s) => s.trim()) : undefined
          }),
        toOutput: (r) => {
          const summary = r.variants
            .map(
              (v, i) =>
                `${i + 1}. voice=${v.voice}${v.stylePrompt ? ` style="${v.stylePrompt}"` : ""} (${v.processing_time_ms}ms)`
            )
            .join("\n");
          return {
            text: `Customize — ${r.totalVariants} variant(s):\n${summary}`,
            media: r.variants.map((v) => ({
              kind: "audio" as const,
              mimeType: v.mimeType,
              base64: v.audioBase64
            }))
          };
        }
      });
    });
}

function materializeText(input: string): string {
  if (input === "-") {
    try {
      return readFileSync(0, "utf8");
    } catch {
      return "";
    }
  }
  if (input.startsWith("@")) {
    const path = input.slice(1);
    if (existsSync(path)) return readFileSync(path, "utf8");
  }
  return input;
}
