/**
 * Env source loaders — each returns a plain Record<string,string>.
 * Silently returns {} when source is unavailable.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir, platform } from "node:os";
import { execSync } from "node:child_process";

export type EnvRecord = Record<string, string>;

/**
 * OS-level env vars — the "native shell" environment, distinct from process.env
 * which may have been mutated by parent tools.
 * Best-effort: on Unix, snapshot via `env`; on Windows, via `set`. Falls back to
 * process.env when the shell call fails.
 */
export function loadOsEnv(): EnvRecord {
  try {
    const isWin = platform() === "win32";
    const cmd = isWin ? "set" : "env";
    const out = execSync(cmd, { encoding: "utf8", shell: isWin ? "cmd.exe" : "/bin/sh" });
    return parseEnvLines(out);
  } catch {
    // Fallback: treat process.env as OS env
    return { ...(process.env as EnvRecord) };
  }
}

/**
 * User config JSON file.
 * Looks up XDG_CONFIG_HOME / ~/.config/human-cli/config.json (Unix)
 * or %APPDATA%/human-cli/config.json (Windows).
 */
export function loadUserConfig(explicitPath?: string): EnvRecord {
  const path = explicitPath ?? getUserConfigPath();
  if (!path || !existsSync(path)) return {};
  try {
    const raw = readFileSync(path, "utf8");
    const json = JSON.parse(raw);
    return flattenConfig(json);
  } catch {
    return {};
  }
}

export function getUserConfigPath(): string {
  if (platform() === "win32") {
    const appData = process.env.APPDATA ?? join(homedir(), "AppData", "Roaming");
    return join(appData, "human-cli", "config.json");
  }
  const xdg = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
  return join(xdg, "human-cli", "config.json");
}

/** process.env snapshot at CLI start. */
export function loadProcessEnv(): EnvRecord {
  return { ...(process.env as EnvRecord) };
}

/**
 * .env.* files in current working directory.
 * Precedence (higher wins within this source): .env.local > .env.<NODE_ENV> > .env
 */
export function loadDotenvFiles(cwd: string = process.cwd()): EnvRecord {
  const env = process.env.NODE_ENV;
  const files = [".env", env ? `.env.${env}` : null, ".env.local"].filter(Boolean) as string[];
  const merged: EnvRecord = {};
  for (const f of files) {
    const p = resolve(cwd, f);
    if (!existsSync(p)) continue;
    try {
      const parsed = parseEnvLines(readFileSync(p, "utf8"));
      Object.assign(merged, parsed);
    } catch {
      // skip malformed files
    }
  }
  return merged;
}

/** Inline --env KEY=VAL flags (repeatable). */
export function loadInlineEnv(pairs: string[] = []): EnvRecord {
  const out: EnvRecord = {};
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1);
    if (k) out[k] = v;
  }
  return out;
}

/** Minimal .env / env-style parser. Handles quotes & simple escapes. */
function parseEnvLines(text: string): EnvRecord {
  const out: EnvRecord = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, "");
    let value = line.slice(eq + 1).trim();
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

/**
 * Flatten nested JSON config like { gemini: { apiKey: "..." } }
 * into { GOOGLE_GEMINI_API_KEY: "..." } using a small alias map,
 * while also letting users write env names directly.
 */
function flattenConfig(json: Record<string, unknown>): EnvRecord {
  const out: EnvRecord = {};
  // Pass 1: verbatim env-style keys
  for (const [k, v] of Object.entries(json)) {
    if (isEnvKey(k) && (typeof v === "string" || typeof v === "number" || typeof v === "boolean")) {
      out[k] = String(v);
    }
  }
  // Pass 2: nested aliases
  for (const [group, body] of Object.entries(json)) {
    if (!body || typeof body !== "object") continue;
    for (const [key, val] of Object.entries(body as Record<string, unknown>)) {
      if (typeof val !== "string" && typeof val !== "number" && typeof val !== "boolean") continue;
      const envName = toEnvName(group, key);
      if (envName) out[envName] = String(val);
    }
  }
  return out;
}

function isEnvKey(k: string): boolean {
  return /^[A-Z][A-Z0-9_]*$/.test(k);
}

function toEnvName(group: string, key: string): string | null {
  const map: Record<string, Record<string, string>> = {
    gemini: {
      apiKey: "GOOGLE_GEMINI_API_KEY",
      model: "GOOGLE_GEMINI_MODEL",
      imageModel: "GOOGLE_GEMINI_IMAGE_MODEL",
      useVertex: "USE_VERTEX",
      vertexProjectId: "VERTEX_PROJECT_ID",
      vertexLocation: "VERTEX_LOCATION"
    },
    minimax: { apiKey: "MINIMAX_API_KEY", apiHost: "MINIMAX_API_HOST" },
    zhipuai: { apiKey: "ZHIPUAI_API_KEY", apiHost: "ZHIPUAI_API_HOST" },
    elevenlabs: { apiKey: "ELEVENLABS_API_KEY", apiHost: "ELEVENLABS_API_HOST" },
    providers: {
      speech: "SPEECH_PROVIDER",
      video: "VIDEO_PROVIDER",
      vision: "VISION_PROVIDER",
      image: "IMAGE_PROVIDER"
    },
    transport: {
      type: "TRANSPORT_TYPE",
      httpPort: "HTTP_PORT",
      httpHost: "HTTP_HOST"
    },
    logging: { level: "LOG_LEVEL" },
    cloudflare: {
      projectName: "CLOUDFLARE_CDN_PROJECT_NAME",
      bucketName: "CLOUDFLARE_CDN_BUCKET_NAME",
      accessKey: "CLOUDFLARE_CDN_ACCESS_KEY",
      secretKey: "CLOUDFLARE_CDN_SECRET_KEY",
      endpointUrl: "CLOUDFLARE_CDN_ENDPOINT_URL",
      baseUrl: "CLOUDFLARE_CDN_BASE_URL"
    }
  };
  return map[group]?.[key] ?? null;
}
