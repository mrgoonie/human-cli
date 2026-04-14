/**
 * Version — replaced at build time by tsup define plugin or read from package.json.
 * Keeping a runtime read to stay simple for dev.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

function readVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    // Walk up to find package.json (dist/ and src/ both sit at repo root + 1)
    for (const p of [
      join(here, "..", "package.json"),
      join(here, "..", "..", "package.json")
    ]) {
      try {
        const pkg = JSON.parse(readFileSync(p, "utf8")) as { version?: string };
        if (pkg.version) return pkg.version;
      } catch {
        // try next
      }
    }
  } catch {
    // noop
  }
  return "0.0.0-dev";
}

export const version = readVersion();
