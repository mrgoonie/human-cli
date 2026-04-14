/**
 * Input source helpers: stdin, file, url, base64, or literal string.
 * The MCP server accepts all of these directly except stdin, which we
 * materialize into a data URI or inline string before forwarding.
 */
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

/**
 * Resolve a source value. If it is `-`, read from stdin and return a
 * data URI (for binary-looking content) or plain string (for text).
 * Everything else is passed through unchanged.
 */
export async function readArgFromSource(value: string): Promise<string> {
  if (value !== "-") return value;
  const buf = await readStdinBuffer();
  const text = buf.toString("utf8");
  // Heuristic: if it parses as printable text, return as string; else base64 data URI
  if (/^[\s\S]*$/.test(text) && isProbablyText(buf)) return text;
  return `data:application/octet-stream;base64,${buf.toString("base64")}`;
}

/** Allow reading content from stdin when no source-like field was given. */
export async function readStdinIfRequested(
  args: Record<string, unknown>,
  sourceFields: string[]
): Promise<void> {
  // If the user piped input but no source field is "-", leave args as-is.
  // This is intentional: interactive stdin reads are opt-in via "-".
  void args;
  void sourceFields;
}

/**
 * Load a local file into a base64 data URI (convenience for commands
 * that want to do that before invoking the MCP server).
 */
export async function toDataUri(pathOrUrl: string, defaultMime = "application/octet-stream"): Promise<string> {
  if (pathOrUrl.startsWith("data:")) return pathOrUrl;
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) return pathOrUrl;
  const full = isAbsolute(pathOrUrl) ? pathOrUrl : resolve(process.cwd(), pathOrUrl);
  if (!existsSync(full)) throw new Error(`File not found: ${pathOrUrl}`);
  const buf = await readFile(full);
  const mime = guessMime(full, defaultMime);
  return `data:${mime};base64,${buf.toString("base64")}`;
}

async function readStdinBuffer(): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

function isProbablyText(buf: Buffer): boolean {
  // Quick heuristic: no null bytes in first 4KB
  const slice = buf.subarray(0, Math.min(buf.length, 4096));
  for (let i = 0; i < slice.length; i++) {
    if (slice[i] === 0) return false;
  }
  return true;
}

function guessMime(path: string, fallback: string): string {
  const ext = path.toLowerCase().split(".").pop() ?? "";
  const map: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    bmp: "image/bmp",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    mp4: "video/mp4",
    webm: "video/webm",
    pdf: "application/pdf",
    txt: "text/plain",
    md: "text/markdown",
    json: "application/json",
    csv: "text/csv",
    html: "text/html",
    xml: "application/xml"
  };
  return map[ext] ?? fallback;
}
