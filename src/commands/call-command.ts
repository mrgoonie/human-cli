/**
 * Low-level escape hatches for agents:
 *   human call <tool>    — invoke any registered tool with raw JSON args
 *   human tools          — list registered tools
 */
import type { Command } from "commander";
import { readFileSync, existsSync } from "node:fs";
import pc from "picocolors";
import { runProcessor } from "../runtime/run-processor.js";
import { extractGlobalFlags } from "../runtime/global-flags.js";
import { TOOL_REGISTRY, findTool } from "../mcp/tool-registry.js";

export function registerCallAndToolsCommands(program: Command): void {
  program
    .command("call <tool>")
    .description("Invoke any native tool directly with raw JSON arguments")
    .option("-a, --args <json>", "Tool arguments as JSON, '-' for stdin, or @file.json")
    .action(async (tool: string, opts, cmd) => {
      const spec = findTool(tool);
      if (!spec) {
        process.stderr.write(`✗ Unknown tool: ${tool}\n   See available tools: human tools\n`);
        process.exit(2);
      }
      const args = parseArgs(opts.args);
      await runProcessor({
        tool: spec.name,
        globals: extractGlobalFlags(cmd),
        run: (config) => spec.run(config, args),
        toOutput: (r) => ({ text: r.text, media: r.media })
      });
    });

  program
    .command("tools")
    .description("List all registered native tools")
    .option("--names-only", "Print only tool names (one per line)", false)
    .option("--json", "Emit JSON (alias for global --json)", false)
    .action(async (opts, cmd) => {
      const globals = extractGlobalFlags(cmd);
      const asJson = opts.json || globals.json || !process.stdout.isTTY;
      if (asJson) {
        process.stdout.write(
          JSON.stringify({
            ok: true,
            tools: TOOL_REGISTRY.map((t) => ({
              name: t.name,
              description: t.description,
              inputSchema: t.inputSchema
            }))
          }) + "\n"
        );
        return;
      }
      if (opts.namesOnly) {
        for (const t of TOOL_REGISTRY) process.stdout.write(`${t.name}\n`);
        return;
      }
      const color = !globals.noColor;
      for (const t of TOOL_REGISTRY) {
        process.stdout.write(`${color ? pc.bold(t.name) : t.name}\n`);
        process.stdout.write(`  ${color ? pc.dim(t.description) : t.description}\n`);
      }
    });
}

function parseArgs(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  let text = raw;
  if (raw === "-") text = readFileSync(0, "utf8");
  else if (raw.startsWith("@")) {
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
