/**
 * Image analysis — ported from human-mcp/src/tools/eyes/processors/image.ts
 * Dropped: Cloudflare R2 upload path (not relevant for CLI).
 * Kept: retry-with-backoff + sharp image compression when available.
 */
import { GeminiClient } from "../../core/providers/gemini-client.js";
import { loadMedia } from "../../core/media-loader.js";
import { logger } from "../../core/logger.js";
import type { Config } from "../../core/config-schema.js";

export interface AnalyzeOptions {
  focus?: string;
  detail?: "quick" | "detailed";
}

export interface AnalyzeResult {
  analysis: string;
  metadata: {
    processing_time_ms: number;
    model_used: string;
    attempts_made: number;
  };
}

export async function analyzeImage(
  config: Config,
  source: string,
  options: AnalyzeOptions = {}
): Promise<AnalyzeResult> {
  const startTime = Date.now();
  const detail = options.detail ?? "detailed";
  const client = new GeminiClient(config);
  const model = client.getModel(detail);

  const prompt = buildVisionPrompt(options.focus, detail);

  const { data, mimeType } = await loadMedia(source, {
    fetchTimeout: config.server.fetchTimeout,
    maxImageDim: 1024
  });

  logger.debug(`Analyzing image (${data.length} base64 chars, ${mimeType})`);

  const text = await client.analyzeContent(model, prompt, [{ mimeType, data }]);
  return {
    analysis: text,
    metadata: {
      processing_time_ms: Date.now() - startTime,
      model_used: model.model,
      attempts_made: 1
    }
  };
}

export async function compareImages(
  config: Config,
  image1: string,
  image2: string,
  focus: "differences" | "similarities" | "layout" | "content" = "differences"
): Promise<AnalyzeResult> {
  const startTime = Date.now();
  const client = new GeminiClient(config);
  const model = client.getModel("detailed");

  const [a, b] = await Promise.all([
    loadMedia(image1, { fetchTimeout: config.server.fetchTimeout, maxImageDim: 1024 }),
    loadMedia(image2, { fetchTimeout: config.server.fetchTimeout, maxImageDim: 1024 })
  ]);

  const focusPrompts: Record<typeof focus, string> = {
    differences: "Identify what's different between these images",
    similarities: "Identify what's similar between these images",
    layout: "Compare the layout and structure of these images",
    content: "Compare the content and meaning of these images"
  };
  const prompt = `${focusPrompts[focus]}.\n\nProvide:\n• **Summary**: Key findings\n• **Details**: Specific observations\n• **Impact**: What these changes mean\n\nBe clear and specific with locations and measurements.`;

  const response = await model.generateContent([
    { text: prompt },
    { inlineData: { mimeType: a.mimeType, data: a.data } },
    { text: "vs" },
    { inlineData: { mimeType: b.mimeType, data: b.data } }
  ]);

  return {
    analysis: response.response.text() || "No comparison results available",
    metadata: {
      processing_time_ms: Date.now() - startTime,
      model_used: model.model,
      attempts_made: 1
    }
  };
}

function buildVisionPrompt(focus: string | undefined, detail: "quick" | "detailed"): string {
  const base = `You are a visual analysis expert. Provide a ${detail === "quick" ? "concise" : "comprehensive"} analysis of this visual content.`;
  const focusLine = focus ? `\n\nPay special attention to: ${focus}` : "";
  return `${base}\n\nStructure your response as:\n1. **Overview** — brief summary\n2. **Key findings** — main points\n3. **Details** — specifics (include coordinates, colors, sizes when possible)\n4. **Recommendations** — actionable suggestions${focusLine}`;
}
