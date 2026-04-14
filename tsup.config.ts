import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    cli: "src/cli.ts",
    index: "src/index.ts"
  },
  format: ["esm"],
  target: "node18",
  platform: "node",
  clean: true,
  skipNodeModulesBundle: true,
  dts: {
    entry: { index: "src/index.ts" }
  },
  sourcemap: true,
  splitting: false,
  shims: false,
  banner: ({ format }) => {
    // Shebang only for the CLI entry (ESM)
    if (format === "esm") {
      return { js: "" };
    }
    return {};
  },
  esbuildOptions(options) {
    options.banner = {
      js: ""
    };
  },
  onSuccess: async () => {
    // Ensure shebang on dist/cli.js
    const { readFileSync, writeFileSync, chmodSync, existsSync } = await import("node:fs");
    const path = "dist/cli.js";
    if (existsSync(path)) {
      const content = readFileSync(path, "utf8");
      if (!content.startsWith("#!/usr/bin/env node")) {
        writeFileSync(path, `#!/usr/bin/env node\n${content}`);
      }
      chmodSync(path, 0o755);
    }
  }
});
