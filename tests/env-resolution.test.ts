/**
 * Tests env resolution priority: OS > userConfig > process.env > dotenv > inline.
 * Uses mocked source loaders via environment variables & temp config file.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveEnv } from "../src/config/resolve-env.js";

describe("resolveEnv priority chain", () => {
  let tempDir: string;
  let configPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "human-cli-test-"));
    configPath = join(tempDir, "config.json");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("reads flat env-style keys from user config", () => {
    writeFileSync(
      configPath,
      JSON.stringify({ GOOGLE_GEMINI_API_KEY: "from-user-config" })
    );
    const { env, sources } = resolveEnv({ configPath, cwd: tempDir });
    expect(sources.userConfig.GOOGLE_GEMINI_API_KEY).toBe("from-user-config");
    // OS env should win if set (so only assert if not set)
    if (!sources.os.GOOGLE_GEMINI_API_KEY) {
      expect(env.GOOGLE_GEMINI_API_KEY).toBe("from-user-config");
    }
  });

  it("reads nested aliases like gemini.apiKey → GOOGLE_GEMINI_API_KEY", () => {
    writeFileSync(
      configPath,
      JSON.stringify({ gemini: { apiKey: "nested-key" } })
    );
    const { sources } = resolveEnv({ configPath, cwd: tempDir });
    expect(sources.userConfig.GOOGLE_GEMINI_API_KEY).toBe("nested-key");
  });

  it("inline flags have lowest priority by default (spec)", () => {
    writeFileSync(configPath, JSON.stringify({ FOO_VAR: "from-config" }));
    const { env } = resolveEnv({
      configPath,
      cwd: tempDir,
      inlineEnv: ["FOO_VAR=from-inline"]
    });
    // user-config beats inline (per spec)
    if (!process.env.FOO_VAR) {
      expect(env.FOO_VAR).toBe("from-config");
    }
  });

  it("--inline-first inverts priority so inline wins", () => {
    writeFileSync(configPath, JSON.stringify({ FOO_VAR: "from-config" }));
    const { env } = resolveEnv({
      configPath,
      cwd: tempDir,
      inlineEnv: ["FOO_VAR=from-inline"],
      inlineFirst: true
    });
    expect(env.FOO_VAR).toBe("from-inline");
  });

  it("parses .env.* files from cwd", () => {
    writeFileSync(join(tempDir, ".env"), "TEST_DOTENV_KEY=dotenv-value\n");
    const { sources } = resolveEnv({ configPath, cwd: tempDir });
    expect(sources.dotenv.TEST_DOTENV_KEY).toBe("dotenv-value");
  });

  it("inline flags parse KEY=VAL correctly", () => {
    const { sources } = resolveEnv({
      configPath,
      cwd: tempDir,
      inlineEnv: ["A=1", "B=hello=world", "bad-no-equals"]
    });
    expect(sources.inline.A).toBe("1");
    expect(sources.inline.B).toBe("hello=world");
    expect(sources.inline["bad-no-equals"]).toBeUndefined();
  });
});
