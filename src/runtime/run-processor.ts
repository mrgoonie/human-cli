/**
 * Native processor runner — replaces the MCP subprocess call chain.
 * Accepts a zero-argument function that produces `{ text?, media? }`, wraps
 * its execution in the existing `renderResult` envelope (human/JSON modes,
 * file saving, exit codes).
 */
import { resolve } from "node:path";
import ora, { type Ora } from "ora";
import { resolveEnv } from "../config/resolve-env.js";
import { buildConfig } from "../core/build-config.js";
import { logger } from "../core/logger.js";
import { renderResult } from "../output/format-result.js";
import type { GlobalFlags } from "./global-flags.js";
import type { Config } from "../core/config-schema.js";

export interface ProcessorOutput {
  text?: string;
  media?: Array<{
    kind: "image" | "audio" | "video" | "blob";
    mimeType: string;
    base64: string;
  }>;
}

export interface RunProcessorOptions<T> {
  tool: string;
  globals: GlobalFlags;
  run: (config: Config) => Promise<T>;
  /** Map the processor's domain output → ProcessorOutput (text + media). */
  toOutput: (result: T) => ProcessorOutput;
}

export async function runProcessor<T>(opts: RunProcessorOptions<T>): Promise<void> {
  const { tool, globals } = opts;

  const { env } = resolveEnv({
    inlineEnv: globals.env,
    configPath: globals.config,
    inlineFirst: globals.inlineFirst
  });

  if (globals.apiKey) env.GOOGLE_GEMINI_API_KEY = globals.apiKey;
  if (globals.model) env.GOOGLE_GEMINI_MODEL = globals.model;
  if (globals.verbose) env.LOG_LEVEL = "debug";
  logger.setLevel((env.LOG_LEVEL as "debug" | "info" | "warn" | "error") || "info");

  const config = buildConfig(env);

  const jsonMode = globals.json || !process.stdout.isTTY;
  const useSpinner = !jsonMode && !globals.quiet && !globals.verbose && process.stderr.isTTY;

  let spinner: Ora | null = null;
  if (useSpinner) {
    spinner = ora({ text: `Running ${tool}...`, stream: process.stderr }).start();
  }

  const started = Date.now();
  try {
    const result = await opts.run(config);
    const output = opts.toOutput(result);
    const durationMs = Date.now() - started;

    spinner?.stop();

    await renderResult(
      {
        ok: true,
        text: output.text ?? "",
        media: output.media ?? [],
        raw: result
      },
      {
        tool,
        durationMs,
        jsonMode,
        quiet: globals.quiet,
        noColor: globals.noColor,
        outputDir: resolve(globals.output ?? "./outputs"),
        saveMedia: globals.output !== "-"
      }
    );

    process.exitCode = 0;
  } catch (err) {
    spinner?.stop();
    const message = err instanceof Error ? err.message : String(err);
    if (jsonMode) {
      process.stdout.write(
        JSON.stringify({
          ok: false,
          tool,
          data: { text: "", media: [] },
          metadata: { duration_ms: Date.now() - started },
          error: message
        }) + "\n"
      );
    } else {
      process.stderr.write(`\n✗ ${tool} failed: ${message}\n`);
    }
    process.exitCode = classifyExit(message);
  }
}

function classifyExit(message: string): number {
  const lower = message.toLowerCase();
  if (lower.includes("api key") || lower.includes("missing env") || lower.includes("not set")) {
    return 3;
  }
  if (lower.includes("not installed") || lower.includes("requires ")) return 4;
  return 1;
}
