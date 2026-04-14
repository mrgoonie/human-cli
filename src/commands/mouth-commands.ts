/**
 * "mouth" command group — text-to-speech & audio narration.
 */
import type { Command } from "commander";
import { runTool } from "../runtime/run-tool.js";
import { extractGlobalFlags } from "../runtime/global-flags.js";
import { readFileSync, existsSync } from "node:fs";

export function registerMouthCommands(program: Command): void {
  const mouth = program
    .command("mouth")
    .description("Text-to-speech: speak, narrate, explain code");

  mouth
    .command("speak <text>")
    .description("Convert text to speech. Use '-' to read from stdin or @file.txt for file input.")
    .option("--voice <name>", "Voice name (e.g. Zephyr for Gemini)")
    .option("--provider <p>", "gemini | minimax | elevenlabs")
    .option("--language <lang>", "Language code (e.g. en-US)")
    .option("--model <m>", "Speech model")
    .option("--format <fmt>", "wav | base64 | url", "base64")
    .option("--style <text>", "Style prompt (e.g. 'cheerful and energetic')")
    .option("--speed <n>", "Speech speed 0.5-2.0", Number)
    .option("--emotion <e>", "happy | sad | angry | fearful | disgusted | surprised | neutral")
    .action(async (text: string, opts, cmd) => {
      await runTool({
        tool: "mouth_speak",
        args: {
          text: materializeText(text),
          voice: opts.voice,
          provider: opts.provider,
          language: opts.language,
          model: opts.model,
          output_format: opts.format,
          style_prompt: opts.style,
          speed: opts.speed,
          emotion: opts.emotion
        },
        globals: extractGlobalFlags(cmd)
      });
    });

  mouth
    .command("narrate <content>")
    .description("Long-form narration with chapter breaks. '-' or @file.txt supported.")
    .option("--voice <name>", "Voice", "Sage")
    .option("--style <mode>", "professional | casual | educational | storytelling", "professional")
    .option("--chapter-breaks", "Add pauses between chapters", false)
    .option("--max-chunk <n>", "Max chars per chunk", Number, 8000)
    .option("--format <fmt>", "wav | base64 | url", "base64")
    .action(async (content: string, opts, cmd) => {
      await runTool({
        tool: "mouth_narrate",
        args: {
          content: materializeText(content),
          voice: opts.voice,
          narration_style: opts.style,
          chapter_breaks: opts.chapterBreaks,
          max_chunk_size: opts.maxChunk,
          output_format: opts.format
        },
        globals: extractGlobalFlags(cmd)
      });
    });

  mouth
    .command("explain <code>")
    .description("Explain code via speech. Accepts literal code, @file, or '-' for stdin.")
    .option("--language <lang>", "Spoken language", "en-US")
    .option("--programming-lang <lang>", "Programming language of the code")
    .option("--level <lvl>", "beginner | intermediate | advanced")
    .option("--voice <name>", "Voice")
    .option("--format <fmt>", "wav | base64 | url", "base64")
    .action(async (code: string, opts, cmd) => {
      await runTool({
        tool: "mouth_explain",
        args: {
          code: materializeText(code),
          language: opts.language,
          programming_language: opts.programmingLang,
          explanation_level: opts.level,
          voice: opts.voice,
          output_format: opts.format
        },
        globals: extractGlobalFlags(cmd)
      });
    });

  mouth
    .command("customize <text>")
    .description("Test & compare voice settings")
    .option("--voice <name>", "Primary voice")
    .option("--compare <names>", "Comma-separated voices to compare")
    .option("--variations <list>", "Comma-separated style variations")
    .action(async (text: string, opts, cmd) => {
      await runTool({
        tool: "mouth_customize",
        args: {
          text: materializeText(text),
          voice: opts.voice,
          compare_voices: opts.compare ? opts.compare.split(",") : undefined,
          style_variations: opts.variations ? opts.variations.split(",") : undefined
        },
        globals: extractGlobalFlags(cmd)
      });
    });
}

/** Accept '@file.txt' and '-' (stdin) as content source. */
function materializeText(input: string): string {
  if (input === "-") {
    // Read stdin synchronously via /dev/stdin for simplicity (small inputs)
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
