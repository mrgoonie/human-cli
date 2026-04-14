/**
 * Formats MCP tool results for human (TTY) and agent (JSON) consumption.
 * Handles media extraction, file saving, and structured envelope construction.
 */
import { writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import pc from "picocolors";
import type { ToolResult } from "../mcp/mcp-client.js";

export interface RenderContext {
  tool: string;
  durationMs: number;
  jsonMode: boolean;
  quiet: boolean;
  noColor: boolean;
  outputDir: string;
  /** When true, write base64 media to disk. When false, keep inline in JSON output. */
  saveMedia: boolean;
}

export interface Envelope {
  ok: boolean;
  tool: string;
  data: {
    text: string;
    media: Array<{
      kind: string;
      mimeType: string;
      path?: string;
      base64?: string;
    }>;
  };
  metadata: {
    duration_ms: number;
  };
  error: string | null;
}

export async function renderResult(result: ToolResult, ctx: RenderContext): Promise<Envelope> {
  const envelope: Envelope = {
    ok: result.ok,
    tool: ctx.tool,
    data: { text: result.text, media: [] },
    metadata: { duration_ms: ctx.durationMs },
    error: result.ok ? null : result.text || "Tool returned an error"
  };

  // Persist media if requested
  if (result.media.length > 0) {
    if (ctx.saveMedia) await mkdir(ctx.outputDir, { recursive: true });
    for (let i = 0; i < result.media.length; i++) {
      const m = result.media[i]!;
      const ext = extFromMime(m.mimeType);
      const filename = `${timestamp()}-${ctx.tool}-${i + 1}.${ext}`;
      if (ctx.saveMedia) {
        const path = join(ctx.outputDir, filename);
        await writeFile(path, Buffer.from(m.base64, "base64"));
        envelope.data.media.push({
          kind: m.kind,
          mimeType: m.mimeType,
          path: resolve(path)
        });
      } else {
        envelope.data.media.push({ kind: m.kind, mimeType: m.mimeType, base64: m.base64 });
      }
    }
  }

  if (ctx.jsonMode) {
    process.stdout.write(JSON.stringify(envelope) + "\n");
  } else {
    renderHuman(envelope, ctx);
  }
  return envelope;
}

function renderHuman(env: Envelope, ctx: RenderContext): void {
  const color = !ctx.noColor;
  const icon = env.ok ? (color ? pc.green("✓") : "OK") : (color ? pc.red("✗") : "ERR");
  const title = color ? pc.bold(env.tool) : env.tool;

  if (!ctx.quiet) {
    process.stdout.write(`\n${icon} ${title} ${color ? pc.dim(`(${env.metadata.duration_ms}ms)`) : `(${env.metadata.duration_ms}ms)`}\n`);
  }

  if (env.data.text) {
    process.stdout.write(`\n${env.data.text}\n`);
  }

  if (env.data.media.length > 0) {
    process.stdout.write("\n");
    for (const m of env.data.media) {
      const label = color ? pc.cyan(m.kind) : m.kind;
      if (m.path) {
        process.stdout.write(`  ${label}  ${m.path}\n`);
      } else if (m.base64) {
        process.stdout.write(`  ${label}  <${m.base64.length} bytes base64>\n`);
      }
    }
  }

  if (!env.ok && env.error) {
    process.stderr.write(`\n${color ? pc.red("Error:") : "Error:"} ${env.error}\n`);
  }

  if (!ctx.quiet) process.stdout.write("\n");
}

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/bmp": "bmp",
    "audio/wav": "wav",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/ogg": "ogg",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "application/json": "json",
    "application/pdf": "pdf",
    "text/plain": "txt"
  };
  return map[mime.toLowerCase()] ?? "bin";
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
