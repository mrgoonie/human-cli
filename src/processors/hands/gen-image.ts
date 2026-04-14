/**
 * Image generation — ported from human-mcp/src/tools/hands/processors/image-generator.ts
 * Dropped: R2 upload, ZhipuAI provider routing (Gemini-only for v2.0-alpha).
 * Kept: style/aspect/negative-prompt enhancement.
 */
import { GeminiClient } from "../../core/providers/gemini-client.js";
import type { Config } from "../../core/config-schema.js";

const STYLE_MAP: Record<string, string> = {
  photorealistic: "photorealistic, high quality, detailed",
  artistic: "artistic style, creative, expressive",
  cartoon: "cartoon style, animated, colorful",
  sketch: "pencil sketch, hand-drawn, artistic",
  digital_art: "digital art, modern, stylized"
};

export interface GenImageOptions {
  prompt: string;
  model?: string;
  style?: keyof typeof STYLE_MAP;
  aspectRatio?: string;
  negativePrompt?: string;
  seed?: number;
}

export interface GenImageResult {
  imageData: string; // base64
  mimeType: string;
  textResponse?: string;
  metadata: {
    processing_time_ms: number;
    model_used: string;
    prompt_used: string;
  };
}

export async function generateImage(config: Config, opts: GenImageOptions): Promise<GenImageResult> {
  const startTime = Date.now();
  const client = new GeminiClient(config);

  let prompt = opts.prompt;
  if (opts.style && STYLE_MAP[opts.style]) prompt = `${prompt}, ${STYLE_MAP[opts.style]}`;
  if (opts.aspectRatio && opts.aspectRatio !== "1:1") {
    prompt = `${prompt}, aspect ratio ${opts.aspectRatio}`;
  }
  if (opts.negativePrompt) prompt = `${prompt}. Avoid: ${opts.negativePrompt}`;
  if (opts.seed !== undefined) prompt = `${prompt} [seed:${opts.seed}]`;

  const result = await client.generateImageContent({ prompt, model: opts.model });
  return {
    imageData: result.imageData,
    mimeType: result.mimeType,
    textResponse: result.textResponse,
    metadata: {
      processing_time_ms: Date.now() - startTime,
      model_used: opts.model || config.gemini.imageModel,
      prompt_used: prompt
    }
  };
}

export interface EditImageOptions {
  input: string; // file/url/data-uri for the input image (passed through to media-loader by caller)
  prompt: string;
  model?: string;
  operation?: "inpaint" | "outpaint" | "style_transfer" | "compose" | "refine";
  secondaryImages?: string[];
  styleStrength?: number;
}

/**
 * Image editing — the caller loads media first, passes base64/mime pairs here.
 * This lets the processor stay sync-free of I/O concerns.
 */
export async function editImageWithGemini(
  config: Config,
  inputImage: { mimeType: string; data: string },
  prompt: string,
  secondaryImages: Array<{ mimeType: string; data: string }> = [],
  model?: string
): Promise<GenImageResult> {
  const startTime = Date.now();
  const client = new GeminiClient(config);

  const result = await client.generateImageContent({
    prompt,
    model,
    inputImages: [inputImage, ...secondaryImages]
  });

  return {
    imageData: result.imageData,
    mimeType: result.mimeType,
    textResponse: result.textResponse,
    metadata: {
      processing_time_ms: Date.now() - startTime,
      model_used: model || config.gemini.imageModel,
      prompt_used: prompt
    }
  };
}
