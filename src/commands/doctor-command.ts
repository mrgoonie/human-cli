/**
 * "doctor" command — diagnose config + MCP server connectivity.
 */
import type { Command } from "commander";
import pc from "picocolors";
import { resolveEnv } from "../config/resolve-env.js";
import { HumanMcpClient, resolveHumanMcpEntry } from "../mcp/mcp-client.js";
import { extractGlobalFlags } from "../runtime/global-flags.js";

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("Diagnostic: config, env, and MCP server connectivity")
    .action(async (_opts, cmd) => {
      const globals = extractGlobalFlags(cmd);
      const { env, sources, configPath } = resolveEnv({
        inlineEnv: globals.env,
        configPath: globals.config,
        inlineFirst: globals.inlineFirst
      });

      const ok = (msg: string) => (globals.noColor ? `[OK]   ${msg}` : `${pc.green("✓")}  ${msg}`);
      const warn = (msg: string) => (globals.noColor ? `[WARN] ${msg}` : `${pc.yellow("!")}  ${msg}`);
      const fail = (msg: string) => (globals.noColor ? `[FAIL] ${msg}` : `${pc.red("✗")}  ${msg}`);

      const lines: string[] = [];
      lines.push(pc.bold("\nhuman-cli doctor\n"));

      lines.push(pc.dim("User config: ") + configPath);
      lines.push(pc.dim("Node:        ") + process.version);
      lines.push(pc.dim("Platform:    ") + `${process.platform}/${process.arch}`);
      lines.push("");

      // Gemini or Vertex
      if (env.GOOGLE_GEMINI_API_KEY) lines.push(ok("GOOGLE_GEMINI_API_KEY is set"));
      else if (env.USE_VERTEX === "1" || env.USE_VERTEX === "true")
        lines.push(ok("Vertex AI mode enabled"));
      else lines.push(fail("No Gemini credentials (set GOOGLE_GEMINI_API_KEY or USE_VERTEX=1)"));

      // Optional providers
      for (const [name, key] of [
        ["Minimax", "MINIMAX_API_KEY"],
        ["ZhipuAI", "ZHIPUAI_API_KEY"],
        ["ElevenLabs", "ELEVENLABS_API_KEY"]
      ] as const) {
        lines.push(env[key] ? ok(`${name} configured`) : warn(`${name} not configured (optional)`));
      }
      lines.push("");

      // Source summary
      lines.push(pc.dim("Env sources:"));
      lines.push(
        `  os=${Object.keys(sources.os).length}  userConfig=${Object.keys(sources.userConfig).length}  processEnv=${Object.keys(sources.processEnv).length}  dotenv=${Object.keys(sources.dotenv).length}  inline=${Object.keys(sources.inline).length}`
      );
      lines.push("");

      // MCP server
      const entry = resolveHumanMcpEntry();
      lines.push(
        entry ? ok(`human-mcp entry: ${entry}`) : fail("human-mcp not found (npm i @goonnguyen/human-mcp)")
      );

      if (entry) {
        lines.push(pc.dim("\nAttempting MCP handshake..."));
        try {
          const client = new HumanMcpClient({
            env,
            timeoutMs: 15_000,
            verbose: globals.verbose
          });
          await client.connect();
          const tools = await client.listTools();
          await client.close();
          lines.push(ok(`MCP server connected — ${tools.length} tools available`));
        } catch (err) {
          lines.push(fail(`MCP handshake failed: ${err instanceof Error ? err.message : err}`));
        }
      }

      process.stdout.write(lines.join("\n") + "\n");
    });
}
