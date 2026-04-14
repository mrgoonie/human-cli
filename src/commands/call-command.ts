/**
 * Low-level escape hatches — agent-friendly:
 *   human call <tool> --args '{...}'    — invoke any MCP tool by name
 *   human tools                          — list all available tools
 */
import type { Command } from "commander";
import { readFileSync, existsSync } from "node:fs";
import { runTool } from "../runtime/run-tool.js";
import { extractGlobalFlags } from "../runtime/global-flags.js";
import { resolveEnv } from "../config/resolve-env.js";
import { HumanMcpClient } from "../mcp/mcp-client.js";

export function registerCallAndToolsCommands(program: Command): void {
  program
    .command("call <tool>")
    .description("Invoke any MCP tool directly with raw JSON arguments")
    .option("-a, --args <json>", "Tool arguments as JSON string, '-' for stdin, or @file.json")
    .action(async (tool: string, opts, cmd) => {
      const args = parseArgs(opts.args);
      await runTool({ tool, args, globals: extractGlobalFlags(cmd) });
    });

  program
    .command("tools")
    .description("List all available MCP tools")
    .option("--names-only", "Print only tool names (one per line)", false)
    .action(async (opts, cmd) => {
      const globals = extractGlobalFlags(cmd);
      const { env } = resolveEnv({
        inlineEnv: globals.env,
        configPath: globals.config,
        inlineFirst: globals.inlineFirst
      });
      const client = new HumanMcpClient({
        env,
        binPath: globals.mcpBin,
        timeoutMs: 15_000,
        verbose: globals.verbose
      });
      try {
        await client.connect();
        const tools = await client.listTools();
        if (globals.json) {
          process.stdout.write(JSON.stringify({ ok: true, tools }) + "\n");
        } else if (opts.namesOnly) {
          for (const t of tools) process.stdout.write(t.name + "\n");
        } else {
          for (const t of tools) {
            process.stdout.write(`${t.name}\n`);
            if (t.description) process.stdout.write(`  ${t.description}\n`);
          }
        }
      } finally {
        await client.close();
      }
    });
}

function parseArgs(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  let text = raw;
  if (raw === "-") {
    text = readFileSync(0, "utf8");
  } else if (raw.startsWith("@")) {
    const path = raw.slice(1);
    if (!existsSync(path)) throw new Error(`Args file not found: ${path}`);
    text = readFileSync(path, "utf8");
  }
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("Args must be a JSON object");
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    throw new Error(`Invalid JSON for --args: ${err instanceof Error ? err.message : err}`);
  }
}
