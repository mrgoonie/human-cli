/**
 * "mcp" command — launch the underlying human-mcp server directly,
 * using the resolved env from human-cli's config chain.
 * Ideal for Claude Desktop / MCP clients that expect a stdio server.
 */
import type { Command } from "commander";
import { spawn } from "node:child_process";
import { resolveEnv } from "../config/resolve-env.js";
import { resolveHumanMcpEntry } from "../mcp/mcp-client.js";
import { extractGlobalFlags } from "../runtime/global-flags.js";

export function registerMcpCommand(program: Command): void {
  const mcp = program
    .command("mcp")
    .description("Launch the underlying human-mcp server (for Claude Desktop etc.)");

  mcp
    .command("start", { isDefault: true })
    .description("Start human-mcp with resolved env (stdio by default)")
    .option("--transport <t>", "stdio | http | both", "stdio")
    .option("--http-port <n>", "HTTP port when transport=http|both", Number)
    .action(async (opts, cmd) => {
      const globals = extractGlobalFlags(cmd);
      const { env } = resolveEnv({
        inlineEnv: globals.env,
        configPath: globals.config,
        inlineFirst: globals.inlineFirst
      });
      env.TRANSPORT_TYPE = opts.transport ?? "stdio";
      if (opts.httpPort) env.HTTP_PORT = String(opts.httpPort);

      const entry = globals.mcpBin ?? resolveHumanMcpEntry();
      if (!entry) {
        process.stderr.write(
          "human-mcp not found. Install it with: npm i @goonnguyen/human-mcp\n"
        );
        process.exit(4);
      }

      const child = spawn(process.execPath, [entry], {
        stdio: "inherit",
        env: { ...process.env, ...env }
      });
      child.on("exit", (code) => process.exit(code ?? 0));
      child.on("error", (err) => {
        process.stderr.write(`Failed to start human-mcp: ${err.message}\n`);
        process.exit(4);
      });
    });
}
