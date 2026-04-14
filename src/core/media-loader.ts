/**
 * Unified media loader — resolves file path, URL, data URI, or "-" (stdin)
 * into `{ data: base64, mimeType }`. Optionally compresses images via sharp
 * when available (same behaviour as human-mcp but sharp is optional here).
 */
import { readFile, stat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { ProcessingError } from "./errors.js";
import { logger } from "./logger.js";

export interface LoadedMedia {
  data: string; // base64
  mimeType: string;
}

export interface LoadOptions {
  fetchTimeout?: number;
  /** Resize large images to fit within (width, height) before base64. */
  maxImageDim?: number;
  /** JPEG quality when we recompress. */
  jpegQuality?: number;
}

export async function loadMedia(source: string, opts: LoadOptions = {}): Promise<LoadedMedia> {
  if (source.match(/^\[Image #\d+\]$/)) {
    throw new ProcessingError(
      `Virtual image reference "${source}" cannot be processed. ` +
        `Use a file path, URL, or base64 data URI instead.`
    );
  }

  if (source.startsWith("data:")) return parseDataUri(source);
  if (source.startsWith("http://") || source.startsWith("https://")) {
    return fetchUrl(source, opts);
  }
  return loadLocalFile(source, opts);
}

function parseDataUri(uri: string): LoadedMedia {
  const [header, data] = uri.split(",");
  if (!header || !data) throw new ProcessingError("Invalid data URI");
  const match = header.match(/data:([^;]+)/);
  if (!match?.[1]) throw new ProcessingError("Invalid data URI — missing mime type");
  return { data, mimeType: match[1] };
}

async function fetchUrl(url: string, opts: LoadOptions): Promise<LoadedMedia> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), opts.fetchTimeout ?? 30000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!response.ok) throw new ProcessingError(`Failed to fetch ${url}: ${response.statusText}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    const mime = response.headers.get("content-type") ?? "application/octet-stream";
    return await maybeCompressImage(buffer, mime, opts);
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      throw new ProcessingError(`Fetch timeout for ${url}`);
    }
    throw err instanceof ProcessingError
      ? err
      : new ProcessingError(`Failed to fetch ${url}: ${(err as Error).message}`);
  }
}

async function loadLocalFile(sourcePath: string, opts: LoadOptions): Promise<LoadedMedia> {
  const full = isAbsolute(sourcePath) ? sourcePath : resolve(process.cwd(), sourcePath);
  try {
    const stats = await stat(full);
    if (!stats.isFile()) throw new ProcessingError(`Not a file: ${sourcePath}`);
    const buffer = await readFile(full);
    const mime = guessMime(full);
    return await maybeCompressImage(buffer, mime, opts);
  } catch (err) {
    if (err instanceof ProcessingError) throw err;
    const msg = (err as Error).message ?? "unknown error";
    if (msg.includes("ENOENT")) throw new ProcessingError(`File not found: ${sourcePath}`);
    throw new ProcessingError(`Failed to read ${sourcePath}: ${msg}`);
  }
}

async function maybeCompressImage(
  buffer: Buffer,
  mime: string,
  opts: LoadOptions
): Promise<LoadedMedia> {
  if (!mime.startsWith("image/") || !opts.maxImageDim) {
    return { data: buffer.toString("base64"), mimeType: mime };
  }
  try {
    const { default: sharp } = (await import("sharp")) as { default: (b: Buffer) => SharpLike };
    const processed = await sharp(buffer)
      .resize(opts.maxImageDim, opts.maxImageDim, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: opts.jpegQuality ?? 85 })
      .toBuffer();
    return { data: processed.toString("base64"), mimeType: "image/jpeg" };
  } catch (err) {
    logger.debug(`sharp compression skipped: ${(err as Error).message}`);
    return { data: buffer.toString("base64"), mimeType: mime };
  }
}

interface SharpLike {
  resize: (w: number, h: number, opts?: Record<string, unknown>) => SharpLike;
  jpeg: (opts?: Record<string, unknown>) => SharpLike;
  toBuffer: () => Promise<Buffer>;
}

function guessMime(path: string): string {
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
    mov: "video/quicktime",
    pdf: "application/pdf",
    txt: "text/plain",
    md: "text/markdown",
    json: "application/json",
    csv: "text/csv",
    html: "text/html",
    xml: "application/xml",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  };
  return map[ext] ?? "application/octet-stream";
}
