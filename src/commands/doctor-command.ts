/**
 * Doctor — diagnostic: config, env, provider keys, available tools.
 * Native implementation — no MCP subprocess handshake.
 */
import type { Command } from "commander";
import pc from "picocolors";
import { resolveEnv } from "../config/resolve-env.js";
import { buildConfig } from "../core/build-config.js";
import { extractGlobalFlags } from "../runtime/global-flags.js";
import { TOOL_REGISTRY } from "../mcp/tool-registry.js";

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("Diagnostic: config, env, provider credentials, and tool registry")
    .action(async (_opts, cmd) => {
      const globals = extractGlobalFlags(cmd);
      const { env, sources, configPath } = resolveEnv({
        inlineEnv: globals.env,
        configPath: globals.config,
        inlineFirst: globals.inlineFirst
      });
      const color = !globals.noColor;

      const ok = (msg: string) => (color ? `${pc.green("✓")}  ${msg}` : `[OK]   ${msg}`);
      const warn = (msg: string) => (color ? `${pc.yellow("!")}  ${msg}` : `[WARN] ${msg}`);
      const fail = (msg: string) => (color ? `${pc.red("✗")}  ${msg}` : `[FAIL] ${msg}`);

      const lines: string[] = [color ? pc.bold("\nhuman-cli doctor\n") : "\nhuman-cli doctor\n"];
      lines.push(`${color ? pc.dim("User config: ") : "User config: "}${configPath}`);
      lines.push(`${color ? pc.dim("Node:        ") : "Node:        "}${process.version}`);
      lines.push(`${color ? pc.dim("Platform:    ") : "Platform:    "}${process.platform}/${process.arch}`);
      lines.push("");

      // Try building config (validates schema)
      try {
        buildConfig(env);
        lines.push(ok("Config schema valid"));
      } catch (err) {
        lines.push(fail(`Config schema error: ${err instanceof Error ? err.message : err}`));
      }

      // Gemini or Vertex
      if (env.GOOGLE_GEMINI_API_KEY) lines.push(ok("GOOGLE_GEMINI_API_KEY is set"));
      else if (env.USE_VERTEX === "1" || env.USE_VERTEX === "true") {
        if (env.VERTEX_PROJECT_ID) lines.push(ok(`Vertex AI enabled (project: ${env.VERTEX_PROJECT_ID})`));
        else lines.push(fail("USE_VERTEX=1 but VERTEX_PROJECT_ID missing"));
      } else {
        lines.push(fail("No Gemini credentials (set GOOGLE_GEMINI_API_KEY or USE_VERTEX=1 + VERTEX_PROJECT_ID)"));
      }

      // Optional providers
      for (const [name, key] of [
        ["Minimax", "MINIMAX_API_KEY"],
        ["ZhipuAI", "ZHIPUAI_API_KEY"],
        ["ElevenLabs", "ELEVENLABS_API_KEY"]
      ] as const) {
        lines.push(env[key] ? ok(`${name} configured`) : warn(`${name} not configured (optional, v2.1)`));
      }

      // Optional native deps
      lines.push("");
      lines.push(color ? pc.dim("Optional deps:") : "Optional deps:");
      for (const { label, probe, purpose } of [
        { label: "sharp", probe: "sharp", purpose: "image compression" },
        { label: "jimp", probe: "jimp", purpose: "local image ops (crop/resize/rotate/mask)" },
        {
          label: "@modelcontextprotocol/sdk",
          probe: "@modelcontextprotocol/sdk/server/mcp.js",
          purpose: "`human mcp start` — MCP server mode"
        },
        {
          label: "@google-cloud/vertexai",
          probe: "@google-cloud/vertexai",
          purpose: "Vertex AI provider"
        }
      ]) {
        try {
          // Indirect to avoid TS resolving optional deps at typecheck time
          const probePath: string = probe;
          await import(probePath);
          lines.push(`  ${ok(`${label} — ${purpose}`)}`);
        } catch {
          lines.push(`  ${warn(`${label} missing — ${purpose}`)}`);
        }
      }

      // Env source summary
      lines.push("");
      lines.push(color ? pc.dim("Env sources:") : "Env sources:");
      lines.push(
        `  os=${Object.keys(sources.os).length}  userConfig=${Object.keys(sources.userConfig).length}  processEnv=${Object.keys(sources.processEnv).length}  dotenv=${Object.keys(sources.dotenv).length}  inline=${Object.keys(sources.inline).length}`
      );

      // Tool registry
      lines.push("");
      lines.push(ok(`Native tool registry: ${TOOL_REGISTRY.length} tools available`));

      process.stdout.write(lines.join("\n") + "\n");
    });
}
