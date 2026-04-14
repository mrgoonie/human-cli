/**
 * Local image operations via Jimp — no API, no network.
 * Ported from human-mcp/src/tools/hands/processors/jimp-processor.ts,
 * stripped of R2 upload / saveToFile wrappers (handled at the CLI output layer).
 */
import { readFile } from "node:fs/promises";
import { isAbsolute, resolve as resolvePath } from "node:path";
import { ProcessingError } from "../../core/errors.js";

interface JimpImage {
  width: number;
  height: number;
  crop: (opts: { x: number; y: number; w: number; h: number }) => JimpImage;
  resize: (opts: { w: number; h: number; mode?: string }) => JimpImage;
  scale: (factor: number) => JimpImage;
  rotate: (degrees: number) => JimpImage;
  getBuffer: (mime: string, opts?: Record<string, unknown>) => Promise<Buffer>;
  composite: (img: JimpImage, x: number, y: number) => JimpImage;
}

async function loadJimp(source: string): Promise<JimpImage> {
  let jimpModule: { Jimp: { read: (src: Buffer | ArrayBuffer) => Promise<JimpImage> } };
  try {
    jimpModule = (await import("jimp")) as unknown as typeof jimpModule;
  } catch {
    throw new ProcessingError("jimp is required for image ops but not installed. Run: npm i jimp");
  }
  const { Jimp } = jimpModule;
  if (!Jimp?.read) {
    throw new ProcessingError("Installed jimp version lacks Jimp.read — upgrade to jimp@^1.0");
  }
  const input = await loadBuffer(source);
  // jimp v1 expects Buffer or ArrayBuffer-like
  return Jimp.read(input);
}

async function loadBuffer(source: string): Promise<Buffer> {
  if (source.startsWith("data:")) {
    const [, data] = source.split(",");
    return Buffer.from(data ?? "", "base64");
  }
  if (source.startsWith("http://") || source.startsWith("https://")) {
    const res = await fetch(source);
    if (!res.ok) throw new ProcessingError(`Failed to fetch ${source}: ${res.statusText}`);
    return Buffer.from(await res.arrayBuffer());
  }
  const full = isAbsolute(source) ? source : resolvePath(process.cwd(), source);
  return readFile(full);
}

export type CropMode = "manual" | "center" | "top_left" | "top_right" | "bottom_left" | "bottom_right";

export interface CropOptions {
  inputImage: string;
  mode?: CropMode;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  outputFormat?: "png" | "jpeg" | "bmp";
  quality?: number;
}

export interface ImageOpResult {
  base64: string;
  mimeType: string;
  originalDimensions: { width: number; height: number };
  finalDimensions: { width: number; height: number };
  processingTime: number;
}

export async function cropImage(opts: CropOptions): Promise<ImageOpResult> {
  const start = Date.now();
  const img = await loadJimp(opts.inputImage);
  const { width: ow, height: oh } = img;
  const mode = opts.mode ?? "manual";
  const w = opts.width ?? Math.floor(ow / 2);
  const h = opts.height ?? Math.floor(oh / 2);
  let x: number;
  let y: number;
  switch (mode) {
    case "center":
      x = Math.floor((ow - w) / 2);
      y = Math.floor((oh - h) / 2);
      break;
    case "top_right":
      x = ow - w;
      y = 0;
      break;
    case "bottom_left":
      x = 0;
      y = oh - h;
      break;
    case "bottom_right":
      x = ow - w;
      y = oh - h;
      break;
    case "top_left":
      x = 0;
      y = 0;
      break;
    default:
      x = opts.x ?? 0;
      y = opts.y ?? 0;
  }
  img.crop({ x, y, w, h });
  return exportImage(img, opts.outputFormat ?? "png", opts.quality ?? 90, { ow, oh }, start);
}

export interface ResizeOptions {
  inputImage: string;
  width?: number;
  height?: number;
  scale?: number;
  maintainAspectRatio?: boolean;
  outputFormat?: "png" | "jpeg" | "bmp";
  quality?: number;
}

export async function resizeImage(opts: ResizeOptions): Promise<ImageOpResult> {
  const start = Date.now();
  const img = await loadJimp(opts.inputImage);
  const { width: ow, height: oh } = img;
  if (opts.scale !== undefined) {
    img.scale(opts.scale);
  } else {
    let w = opts.width;
    let h = opts.height;
    if (opts.maintainAspectRatio !== false && (w === undefined || h === undefined)) {
      if (w !== undefined) h = Math.round((oh / ow) * w);
      else if (h !== undefined) w = Math.round((ow / oh) * h);
    }
    if (w === undefined || h === undefined) {
      throw new ProcessingError("Provide either --scale, --width and --height, or one of width/height with aspect-ratio preservation");
    }
    img.resize({ w, h });
  }
  return exportImage(img, opts.outputFormat ?? "png", opts.quality ?? 90, { ow, oh }, start);
}

export interface RotateOptions {
  inputImage: string;
  angle: number;
  outputFormat?: "png" | "jpeg" | "bmp";
  quality?: number;
}

export async function rotateImage(opts: RotateOptions): Promise<ImageOpResult> {
  const start = Date.now();
  const img = await loadJimp(opts.inputImage);
  const { width: ow, height: oh } = img;
  img.rotate(opts.angle);
  return exportImage(img, opts.outputFormat ?? "png", opts.quality ?? 90, { ow, oh }, start);
}

export interface MaskOptions {
  inputImage: string;
  maskImage: string;
  outputFormat?: "png" | "jpeg" | "bmp";
  quality?: number;
}

export async function maskImage(opts: MaskOptions): Promise<ImageOpResult> {
  const start = Date.now();
  const img = await loadJimp(opts.inputImage);
  const mask = await loadJimp(opts.maskImage);
  const { width: ow, height: oh } = img;
  img.composite(mask, 0, 0);
  return exportImage(img, opts.outputFormat ?? "png", opts.quality ?? 90, { ow, oh }, start);
}

async function exportImage(
  img: JimpImage,
  format: "png" | "jpeg" | "bmp",
  quality: number,
  originalDimensions: { ow: number; oh: number },
  startTime: number
): Promise<ImageOpResult> {
  const mime =
    format === "jpeg" ? "image/jpeg" : format === "bmp" ? "image/bmp" : "image/png";
  const buffer = await img.getBuffer(mime, { quality });
  return {
    base64: buffer.toString("base64"),
    mimeType: mime,
    originalDimensions: { width: originalDimensions.ow, height: originalDimensions.oh },
    finalDimensions: { width: img.width, height: img.height },
    processingTime: Date.now() - startTime
  };
}
