/**
 * Env resolution chain per project spec:
 *   OS > JSON config in user dir > process.env > .env.* > inline env vars
 *
 * "Higher" sources override "lower" ones when merged.
 * This is unusual (inline flags usually win) but follows the explicit user
 * requirement so sysadmin/OS-level vars remain authoritative for AI agents.
 */
import {
  loadOsEnv,
  loadUserConfig,
  loadProcessEnv,
  loadDotenvFiles,
  loadInlineEnv,
  getUserConfigPath,
  type EnvRecord
} from "./env-sources.js";

export interface ResolveOptions {
  inlineEnv?: string[];
  configPath?: string;
  cwd?: string;
  /**
   * If true, invert priority so inline flags win (conventional UX).
   * Opt-in via --inline-first or HUMAN_CLI_INLINE_FIRST=1.
   */
  inlineFirst?: boolean;
}

export interface ResolvedEnv {
  env: EnvRecord;
  sources: {
    os: EnvRecord;
    userConfig: EnvRecord;
    processEnv: EnvRecord;
    dotenv: EnvRecord;
    inline: EnvRecord;
  };
  configPath: string;
}

export function resolveEnv(opts: ResolveOptions = {}): ResolvedEnv {
  const os = loadOsEnv();
  const userConfig = loadUserConfig(opts.configPath);
  const processEnv = loadProcessEnv();
  const dotenv = loadDotenvFiles(opts.cwd);
  const inline = loadInlineEnv(opts.inlineEnv);

  // Merge order = reverse of priority (Object.assign later wins).
  const chain = opts.inlineFirst
    ? [os, userConfig, processEnv, dotenv, inline] // inline wins
    : [inline, dotenv, processEnv, userConfig, os]; // OS wins (spec default)

  const env: EnvRecord = {};
  for (const src of chain) Object.assign(env, src);

  return {
    env,
    sources: { os, userConfig, processEnv, dotenv, inline },
    configPath: opts.configPath ?? getUserConfigPath()
  };
}

/** Extract well-known keys for display / validation. */
export const KNOWN_KEYS = [
  "GOOGLE_GEMINI_API_KEY",
  "GOOGLE_GEMINI_MODEL",
  "GOOGLE_GEMINI_IMAGE_MODEL",
  "USE_VERTEX",
  "VERTEX_PROJECT_ID",
  "VERTEX_LOCATION",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "MINIMAX_API_KEY",
  "ZHIPUAI_API_KEY",
  "ELEVENLABS_API_KEY",
  "SPEECH_PROVIDER",
  "VIDEO_PROVIDER",
  "VISION_PROVIDER",
  "IMAGE_PROVIDER",
  "TRANSPORT_TYPE",
  "LOG_LEVEL"
] as const;

export type KnownKey = (typeof KNOWN_KEYS)[number];
