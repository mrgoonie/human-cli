/**
 * "mcp" command — launches human-cli as a native MCP stdio server,
 * exposing our tool registry to Claude Desktop and other MCP clients.
 *
 * No subprocess / no dependency on @goonnguyen/human-mcp — we ARE the server.
 */
import type { Command } from "commander";
import { resolveEnv } from "../config/resolve-env.js";
import { extractGlobalFlags } from "../runtime/global-flags.js";
import { startMcpServer } from "../mcp/server.js";
import { logger } from "../core/logger.js";

export function registerMcpCommand(program: Command): void {
  const mcp = program
    .command("mcp")
    .description("MCP server mode — expose native tools to Claude Desktop et al.");

  mcp
    .command("start", { isDefault: true })
    .description("Start human-cli as a stdio MCP server")
    .action(async (_opts, cmd) => {
      const globals = extractGlobalFlags(cmd);
      const { env } = resolveEnv({
        inlineEnv: globals.env,
        configPath: globals.config,
        inlineFirst: globals.inlineFirst
      });
      if (globals.apiKey) env.GOOGLE_GEMINI_API_KEY = globals.apiKey;
      if (globals.model) env.GOOGLE_GEMINI_MODEL = globals.model;
      if (globals.verbose) env.LOG_LEVEL = "debug";
      logger.setLevel((env.LOG_LEVEL as "debug" | "info" | "warn" | "error") || "info");

      try {
        await startMcpServer(env);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`Failed to start MCP server: ${message}\n`);
        process.exit(4);
      }
    });
}
