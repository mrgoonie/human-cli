/**
 * Background removal via rmbg (AI, local inference on onnxruntime-node).
 * Ported from human-mcp. R2 upload / file-storage paths stripped.
 * Both rmbg and its onnxruntime-node dep are optional — lazy-loaded on demand.
 */
import { MissingDependencyError, ProcessingError } from "../../core/errors.js";
import { loadMedia } from "../../core/media-loader.js";
import { logger } from "../../core/logger.js";
import type { Config } from "../../core/config-schema.js";

export interface RemoveBackgroundOptions {
  inputImage: string;
  quality?: "fast" | "balanced" | "high";
  outputFormat?: "png" | "jpeg";
  backgroundColor?: string;
  jpegQuality?: number;
}

export interface RemoveBackgroundResult {
  base64: string;
  mimeType: string;
  originalDimensions: { width: number; height: number };
  quality: string;
  processing_time_ms: number;
}

export async function removeBackground(
  config: Config,
  opts: RemoveBackgroundOptions
): Promise<RemoveBackgroundResult> {
  const startTime = Date.now();

  // Lazy-load optional deps
  const rmbgPkg = "rmbg";
  const rmbgModelsPkg = "rmbg/models";
  const jimpPkg = "jimp";

  let rmbgFn: (buf: Buffer, opts: { model: unknown }) => Promise<Buffer>;
  let createBriaaiModel: () => unknown;
  let createModnetModel: () => unknown;
  let createU2netpModel: () => unknown;
  let Jimp: {
    fromBuffer: (buf: Buffer) => Promise<{
      width: number;
      height: number;
      getBuffer: (mime: string, opts?: Record<string, unknown>) => Promise<Buffer>;
      composite: (other: unknown, x: number, y: number) => unknown;
    }>;
    new (opts: { width: number; height: number; color: number }): unknown;
  };

  try {
    const rmbgMod = (await import(rmbgPkg)) as { rmbg: typeof rmbgFn };
    rmbgFn = rmbgMod.rmbg;
    const modelsMod = (await import(rmbgModelsPkg)) as {
      createBriaaiModel: typeof createBriaaiModel;
      createModnetModel: typeof createModnetModel;
      createU2netpModel: typeof createU2netpModel;
    };
    createBriaaiModel = modelsMod.createBriaaiModel;
    createModnetModel = modelsMod.createModnetModel;
    createU2netpModel = modelsMod.createU2netpModel;
    const jimpMod = (await import(jimpPkg)) as unknown as { Jimp: typeof Jimp };
    Jimp = jimpMod.Jimp;
  } catch {
    throw new MissingDependencyError(
      "rmbg",
      "Background removal needs `rmbg` + `onnxruntime-node`. Install: npm i rmbg onnxruntime-node"
    );
  }

  const quality = opts.quality ?? "balanced";
  const outputFormat = opts.outputFormat ?? "png";

  const { data, mimeType } = await loadMedia(opts.inputImage, {
    fetchTimeout: config.server.fetchTimeout
  });
  if (!mimeType.startsWith("image/")) {
    throw new ProcessingError(`Expected an image, got: ${mimeType}`);
  }
  const imageBuffer = Buffer.from(data, "base64");

  const model =
    quality === "fast"
      ? createU2netpModel()
      : quality === "high"
        ? createBriaaiModel()
        : createModnetModel();

  logger.info(`Removing background with quality=${quality}...`);
  const resultBuffer = await rmbgFn(imageBuffer, { model });

  const originalImage = await Jimp.fromBuffer(imageBuffer);
  const originalWidth = originalImage.width;
  const originalHeight = originalImage.height;

  let outBase64: string;
  let outMime: string;

  if (outputFormat === "jpeg") {
    const result = await Jimp.fromBuffer(resultBuffer);
    // JPEG has no alpha — composite on white (or user-specified) background
    const bgColor = parseColorToJimp(opts.backgroundColor) ?? 0xffffffff;
    const bg = new Jimp({ width: originalWidth, height: originalHeight, color: bgColor });
    (bg as { composite: (other: unknown, x: number, y: number) => unknown }).composite(
      result,
      0,
      0
    );
    const buffer = await (bg as {
      getBuffer: (mime: string, opts?: Record<string, unknown>) => Promise<Buffer>;
    }).getBuffer("image/jpeg", { quality: opts.jpegQuality ?? 85 });
    outBase64 = buffer.toString("base64");
    outMime = "image/jpeg";
  } else {
    const result = await Jimp.fromBuffer(resultBuffer);
    const buffer = await result.getBuffer("image/png");
    outBase64 = buffer.toString("base64");
    outMime = "image/png";
  }

  return {
    base64: outBase64,
    mimeType: outMime,
    originalDimensions: { width: originalWidth, height: originalHeight },
    quality,
    processing_time_ms: Date.now() - startTime
  };
}

/** Parse a `#RRGGBB` or `#RRGGBBAA` color into Jimp's 0xRRGGBBAA integer. */
function parseColorToJimp(color?: string): number | null {
  if (!color) return null;
  const hex = color.replace(/^#/, "");
  if (hex.length === 6) return parseInt(hex + "ff", 16);
  if (hex.length === 8) return parseInt(hex, 16);
  return null;
}
