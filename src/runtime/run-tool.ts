/**
 * High-level "run this MCP tool with these args" helper used by every command.
 * Handles env resolution, subprocess lifecycle, rendering, and exit codes.
 */
import { resolve } from "node:path";
import ora, { type Ora } from "ora";
import { resolveEnv } from "../config/resolve-env.js";
import { HumanMcpClient } from "../mcp/mcp-client.js";
import { renderResult } from "../output/format-result.js";
import { readStdinIfRequested, readArgFromSource } from "./input-resolver.js";
import type { GlobalFlags } from "./global-flags.js";

export interface RunToolOptions {
  tool: string;
  args: Record<string, unknown>;
  /**
   * Fields in `args` whose values should accept `-` (stdin), file paths, urls
   * and be passed through as-is to the MCP server.
   */
  sourceFields?: string[];
  globals: GlobalFlags;
}

export async function runTool(opts: RunToolOptions): Promise<void> {
  const { tool, globals } = opts;

  // Normalize source fields: read stdin if any field === "-"
  const args = { ...opts.args };
  for (const f of opts.sourceFields ?? []) {
    const v = args[f];
    if (typeof v === "string") {
      args[f] = await readArgFromSource(v);
    }
  }
  // Allow reading one field from stdin explicitly via convention
  await readStdinIfRequested(args, opts.sourceFields ?? []);

  const { env } = resolveEnv({
    inlineEnv: globals.env,
    configPath: globals.config,
    inlineFirst: globals.inlineFirst
  });

  // Apply explicit shortcut flags (override even OS env)
  if (globals.apiKey) env.GOOGLE_GEMINI_API_KEY = globals.apiKey;
  if (globals.model) env.GOOGLE_GEMINI_MODEL = globals.model;
  if (globals.verbose) env.LOG_LEVEL = "debug";
  if (!env.TRANSPORT_TYPE) env.TRANSPORT_TYPE = "stdio";

  const jsonMode = globals.json || !process.stdout.isTTY;
  const useSpinner = !jsonMode && !globals.quiet && !globals.verbose && process.stderr.isTTY;

  let spinner: Ora | null = null;
  if (useSpinner) {
    spinner = ora({ text: `Running ${tool}...`, stream: process.stderr }).start();
  }

  const started = Date.now();
  const client = new HumanMcpClient({
    env,
    binPath: globals.mcpBin,
    timeoutMs: globals.timeout,
    verbose: globals.verbose
  });

  try {
    await client.connect();
    const result = await client.callTool(tool, args);
    const durationMs = Date.now() - started;

    spinner?.stop();

    await renderResult(result, {
      tool,
      durationMs,
      jsonMode,
      quiet: globals.quiet,
      noColor: globals.noColor,
      outputDir: resolve(globals.output ?? "./outputs"),
      saveMedia: globals.output !== "-"
    });

    process.exitCode = result.ok ? 0 : 1;
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
  } finally {
    await client.close();
  }
}

function classifyExit(message: string): number {
  if (message.includes("Cannot locate @goonnguyen/human-mcp")) return 4;
  if (message.toLowerCase().includes("api key") || message.toLowerCase().includes("missing env"))
    return 3;
  return 1;
}
