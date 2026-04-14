/**
 * "config" command group — manage user config JSON.
 */
import type { Command } from "commander";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import pc from "picocolors";
import { getUserConfigPath } from "../config/env-sources.js";
import { resolveEnv, KNOWN_KEYS } from "../config/resolve-env.js";

export function registerConfigCommands(program: Command): void {
  const config = program.command("config").description("Manage user config (JSON file in user dir)");

  config
    .command("path")
    .description("Print user config file path")
    .action(() => {
      process.stdout.write(getUserConfigPath() + "\n");
    });

  config
    .command("init")
    .description("Create an empty user config file with known keys commented")
    .option("--force", "Overwrite existing", false)
    .action((opts) => {
      const p = getUserConfigPath();
      if (existsSync(p) && !opts.force) {
        process.stderr.write(`Config already exists at ${p} (use --force to overwrite)\n`);
        process.exit(1);
      }
      mkdirSync(dirname(p), { recursive: true });
      const seed = {
        gemini: { apiKey: "", model: "gemini-2.5-flash" },
        providers: { speech: "gemini", video: "gemini", vision: "gemini", image: "gemini" },
        minimax: { apiKey: "" },
        zhipuai: { apiKey: "" },
        elevenlabs: { apiKey: "" },
        logging: { level: "info" }
      };
      writeFileSync(p, JSON.stringify(seed, null, 2) + "\n");
      process.stdout.write(`Created ${p}\n`);
    });

  config
    .command("get <key>")
    .description("Get a resolved env value (across all sources)")
    .action((key: string) => {
      const { env } = resolveEnv();
      const val = env[key];
      if (val === undefined) {
        process.stderr.write(`(not set)\n`);
        process.exit(1);
      }
      process.stdout.write(val + "\n");
    });

  config
    .command("set <key> <value>")
    .description("Set a key in the user config JSON")
    .action((key: string, value: string) => {
      const p = getUserConfigPath();
      mkdirSync(dirname(p), { recursive: true });
      const current = existsSync(p) ? safeReadJson(p) : {};
      current[key] = value;
      writeFileSync(p, JSON.stringify(current, null, 2) + "\n");
      process.stdout.write(`${pc.green("✓")} Set ${key} in ${p}\n`);
    });

  config
    .command("list")
    .description("Show resolved env values and their source")
    .option("--all", "Show all keys (not just known)", false)
    .option("--show-values", "Print full values (default: mask secrets)", false)
    .action((opts) => {
      const resolved = resolveEnv();
      const keys = opts.all
        ? Array.from(
            new Set([
              ...Object.keys(resolved.sources.os),
              ...Object.keys(resolved.sources.userConfig),
              ...Object.keys(resolved.sources.processEnv),
              ...Object.keys(resolved.sources.dotenv),
              ...Object.keys(resolved.sources.inline)
            ])
          ).sort()
        : KNOWN_KEYS;

      for (const k of keys) {
        const v = resolved.env[k];
        if (v === undefined) {
          process.stdout.write(`${pc.dim(k.padEnd(36))} ${pc.dim("(unset)")}\n`);
          continue;
        }
        const display = opts.showValues ? v : maskIfSecret(k, v);
        const src = findSource(resolved.sources, k);
        process.stdout.write(
          `${k.padEnd(36)} ${display} ${pc.dim(`[${src}]`)}\n`
        );
      }
    });
}

function safeReadJson(p: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return {};
  }
}

function maskIfSecret(key: string, value: string): string {
  if (/KEY|SECRET|TOKEN|PASSWORD/i.test(key) && value.length > 6) {
    return value.slice(0, 4) + "…" + value.slice(-2);
  }
  return value;
}

function findSource(
  sources: ReturnType<typeof resolveEnv>["sources"],
  key: string
): string {
  // Report the highest-priority source containing the key
  if (sources.os[key] !== undefined) return "os";
  if (sources.userConfig[key] !== undefined) return "user-config";
  if (sources.processEnv[key] !== undefined) return "process.env";
  if (sources.dotenv[key] !== undefined) return "dotenv";
  if (sources.inline[key] !== undefined) return "inline";
  return "unknown";
}
