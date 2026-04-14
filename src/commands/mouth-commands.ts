/**
 * "mouth" command group — native TTS & narration via Gemini.
 * Minimax/ElevenLabs routing deferred to v2.1.
 */
import type { Command } from "commander";
import { readFileSync, existsSync } from "node:fs";
import { runProcessor } from "../runtime/run-processor.js";
import { extractGlobalFlags } from "../runtime/global-flags.js";
import { speak, narrate } from "../processors/mouth/speak.js";

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

  // Deferred: explain, customize — v2.1 stretch
  for (const { name, hint } of [
    { name: "explain", hint: "Code-to-speech with syntax awareness" },
    { name: "customize", hint: "Voice comparison & style tuning" }
  ]) {
    mouth
      .command(`${name} [args...]`)
      .description(`${hint} — native port deferred to v2.1`)
      .allowUnknownOption()
      .action(() => {
        process.stderr.write(
          `✗ 'human mouth ${name}' is not yet native in v2.0 (deferred to v2.1).\n`
        );
        process.exit(4);
      });
  }
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
