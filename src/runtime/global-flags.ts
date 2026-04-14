/**
 * Global CLI flags shared by every command.
 * Parsed from commander's root options and inherited by subcommands.
 */
import type { Command } from "commander";

export interface GlobalFlags {
  json: boolean;
  quiet: boolean;
  noColor: boolean;
  verbose: boolean;
  output?: string;
  config?: string;
  env: string[];
  apiKey?: string;
  model?: string;
  timeout: number;
  mcpBin?: string;
  inlineFirst: boolean;
}

export function registerGlobalFlags(program: Command): Command {
  return program
    .option("--json", "Output JSON envelope (auto when stdout is not a TTY)", false)
    .option("--quiet", "Suppress progress & decorative output", false)
    .option("--no-color", "Disable ANSI colors")
    .option("-v, --verbose", "Enable debug logs on stderr", false)
    .option(
      "-o, --output <path>",
      "Directory to save media outputs (or '-' to keep base64 inline)",
      "./outputs"
    )
    .option("-c, --config <path>", "Path to user config JSON")
    .option("-e, --env <pair>", "Inline env var KEY=VALUE (repeatable)", collectEnv, [])
    .option("--api-key <key>", "Shortcut for GOOGLE_GEMINI_API_KEY")
    .option("--model <name>", "Shortcut for GOOGLE_GEMINI_MODEL")
    .option("--timeout <ms>", "Request timeout in milliseconds", (v) => Number(v), 600000)
    .option("--mcp-bin <path>", "Override path to human-mcp server entry")
    .option("--inline-first", "Invert env priority so inline flags win", false);
}

export function extractGlobalFlags(cmd: Command): GlobalFlags {
  // Merge from the root program and any ancestor options
  const opts = cmd.optsWithGlobals<Record<string, unknown>>();
  return {
    json: Boolean(opts.json),
    quiet: Boolean(opts.quiet),
    noColor: opts.color === false,
    verbose: Boolean(opts.verbose),
    output: typeof opts.output === "string" ? opts.output : undefined,
    config: typeof opts.config === "string" ? opts.config : undefined,
    env: Array.isArray(opts.env) ? (opts.env as string[]) : [],
    apiKey: typeof opts.apiKey === "string" ? opts.apiKey : undefined,
    model: typeof opts.model === "string" ? opts.model : undefined,
    timeout: typeof opts.timeout === "number" ? opts.timeout : 600000,
    mcpBin: typeof opts.mcpBin === "string" ? opts.mcpBin : undefined,
    inlineFirst:
      Boolean(opts.inlineFirst) || process.env.HUMAN_CLI_INLINE_FIRST === "1"
  };
}

function collectEnv(value: string, prev: string[] = []): string[] {
  return [...prev, value];
}
