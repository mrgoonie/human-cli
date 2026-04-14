/**
 * Thin wrapper around @modelcontextprotocol/sdk that spawns the local
 * human-mcp package as a stdio subprocess and issues tool calls.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";

export interface McpClientOptions {
  /** Env to pass to the child process. */
  env: Record<string, string>;
  /** Override path to human-mcp executable/entry. */
  binPath?: string;
  /** Override node interpreter. */
  command?: string;
  /** CLI args appended when spawning the server. */
  args?: string[];
  /** Timeout for MCP operations in ms. */
  timeoutMs?: number;
  /** Pipe server stderr to this process (default: false — suppresses noisy logs). */
  verbose?: boolean;
}

export class HumanMcpClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private readonly opts: McpClientOptions;

  constructor(opts: McpClientOptions) {
    this.opts = opts;
  }

  async connect(): Promise<void> {
    const { command, args } = resolveServerLaunch(this.opts);

    this.transport = new StdioClientTransport({
      command,
      args,
      env: this.opts.env,
      stderr: this.opts.verbose ? "inherit" : "ignore"
    });

    this.client = new Client(
      { name: "human-cli", version: "0.0.0" },
      { capabilities: {} }
    );

    await this.client.connect(this.transport);
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    if (!this.client) throw new Error("MCP client not connected");
    const timeout = this.opts.timeoutMs ?? 600_000;
    const raw = (await this.client.callTool(
      { name, arguments: args },
      undefined,
      { timeout }
    )) as {
      content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
      isError?: boolean;
    };
    return normalizeToolResult(raw);
  }

  async listTools(): Promise<Array<{ name: string; description?: string }>> {
    if (!this.client) throw new Error("MCP client not connected");
    const res = await this.client.listTools();
    return res.tools.map((t) => ({ name: t.name, description: t.description }));
  }

  async close(): Promise<void> {
    try {
      await this.client?.close();
    } catch {
      // ignore
    }
    try {
      await this.transport?.close();
    } catch {
      // ignore
    }
    this.client = null;
    this.transport = null;
  }
}

export interface ToolResult {
  ok: boolean;
  text: string;
  media: Array<{ kind: "image" | "audio" | "video" | "blob"; mimeType: string; base64: string }>;
  raw: unknown;
}

function normalizeToolResult(raw: {
  content?: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
  isError?: boolean;
}): ToolResult {
  const media: ToolResult["media"] = [];
  const textParts: string[] = [];
  for (const c of raw.content ?? []) {
    if (c.type === "text" && c.text) textParts.push(c.text);
    else if (c.type === "image" && c.data) {
      media.push({ kind: "image", mimeType: c.mimeType ?? "image/png", base64: c.data });
    } else if (c.type === "audio" && c.data) {
      media.push({ kind: "audio", mimeType: c.mimeType ?? "audio/wav", base64: c.data });
    } else if ((c.type === "resource" || c.type === "blob") && c.data) {
      media.push({
        kind: guessKindFromMime(c.mimeType),
        mimeType: c.mimeType ?? "application/octet-stream",
        base64: c.data
      });
    }
  }
  return { ok: !raw.isError, text: textParts.join("\n\n"), media, raw };
}

function guessKindFromMime(mime?: string): ToolResult["media"][number]["kind"] {
  if (!mime) return "blob";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  return "blob";
}

/**
 * Locate the human-mcp server binary.
 * Priority:
 *   1. opts.binPath
 *   2. HUMAN_MCP_BIN env var
 *   3. resolve("@goonnguyen/human-mcp/bin/human-mcp.js")
 *   4. resolve("@goonnguyen/human-mcp") → package root → "bin/human-mcp.js"
 */
function resolveServerLaunch(opts: McpClientOptions): { command: string; args: string[] } {
  if (opts.command) return { command: opts.command, args: opts.args ?? [] };

  const explicit = opts.binPath ?? opts.env.HUMAN_MCP_BIN ?? process.env.HUMAN_MCP_BIN;
  if (explicit && existsSync(explicit)) {
    return { command: process.execPath, args: [explicit, ...(opts.args ?? [])] };
  }

  const require = createRequire(import.meta.url);
  let pkgPath: string | undefined;
  try {
    pkgPath = require.resolve("@goonnguyen/human-mcp/package.json");
  } catch {
    // try resolving bin directly
    try {
      const binPath = require.resolve("@goonnguyen/human-mcp/bin/human-mcp.js");
      return { command: process.execPath, args: [binPath, ...(opts.args ?? [])] };
    } catch {
      throw new Error(
        "Cannot locate @goonnguyen/human-mcp. Install it or set HUMAN_MCP_BIN to the server entry."
      );
    }
  }

  const pkgDir = dirname(pkgPath);
  const candidates = [
    join(pkgDir, "bin", "human-mcp.js"),
    join(pkgDir, "dist", "index.js"),
    join(pkgDir, "src", "index.ts") // last resort (dev checkouts)
  ];
  for (const c of candidates) {
    if (existsSync(c)) {
      return { command: process.execPath, args: [c, ...(opts.args ?? [])] };
    }
  }
  throw new Error(`human-mcp found at ${pkgDir} but no runnable entry detected`);
}

export function resolveHumanMcpEntry(): string | null {
  try {
    const require = createRequire(import.meta.url);
    const pkgPath = require.resolve("@goonnguyen/human-mcp/package.json");
    const pkgDir = dirname(pkgPath);
    for (const c of [join(pkgDir, "bin", "human-mcp.js"), join(pkgDir, "dist", "index.js")]) {
      if (existsSync(c)) return c;
    }
  } catch {
    // noop
  }
  return null;
}
