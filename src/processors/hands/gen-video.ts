/**
 * Video generation — ported from human-mcp's Minimax Hailuo 2.3 flow.
 *
 * Note: human-mcp's Gemini Veo integration is a placeholder/stub (returns
 * empty base64), so this processor only supports Minimax. When Veo lands for
 * real we'll add a `provider: "gemini"` branch here.
 *
 * Lifecycle: submit task → poll every 10s → retrieve download URL → download.
 */
import { MinimaxClient } from "../../core/providers/minimax-client.js";
import { APIError } from "../../core/errors.js";
import { logger } from "../../core/logger.js";
import type { Config } from "../../core/config-schema.js";

const DEFAULT_MODEL = "MiniMax-Hailuo-2.3";
const POLL_INTERVAL_MS = 10_000;
const MAX_POLL_TIME_MS = 900_000; // 15 min

export interface GenVideoOptions {
  prompt: string;
  provider?: "minimax"; // Gemini deferred
  model?: "MiniMax-Hailuo-2.3" | "MiniMax-Hailuo-2.3-Fast";
  duration?: number; // seconds
  resolution?: "768P" | "1080P";
  firstFrameImage?: string; // data URI / URL for image-to-video
  promptOptimizer?: boolean;
}

export interface GenVideoResult {
  videoBase64: string;
  mimeType: "video/mp4";
  metadata: {
    model: string;
    duration: number;
    resolution: string;
    width: number;
    height: number;
    fps: number;
    processing_time_ms: number;
  };
}

export async function generateVideo(config: Config, opts: GenVideoOptions): Promise<GenVideoResult> {
  const startTime = Date.now();
  const provider = opts.provider ?? "minimax";
  if (provider !== "minimax") {
    throw new APIError(
      `Video provider '${provider}' not supported in v2.1 — only 'minimax'. Gemini Veo lands in v2.2.`
    );
  }
  if (!MinimaxClient.isConfigured(config)) {
    throw new APIError("MINIMAX_API_KEY required for video generation. Set it in config or env.");
  }

  const model = opts.model ?? DEFAULT_MODEL;
  const duration = opts.duration ?? 6;
  const resolution = opts.resolution ?? "1080P";
  const firstFrameImage = opts.firstFrameImage;
  const promptOptimizer = opts.promptOptimizer ?? true;

  if (model === "MiniMax-Hailuo-2.3-Fast" && !firstFrameImage) {
    throw new APIError(
      "MiniMax-Hailuo-2.3-Fast is image-to-video only. Provide --image, or use MiniMax-Hailuo-2.3."
    );
  }
  if (resolution === "1080P" && duration > 6) {
    throw new APIError("1080P supports max 6s. Use 768P for longer clips.");
  }

  const client = new MinimaxClient(config);
  const body: Record<string, unknown> = {
    model,
    prompt: opts.prompt,
    prompt_optimizer: promptOptimizer,
    duration,
    resolution
  };
  if (firstFrameImage) body.first_frame_image = firstFrameImage;

  logger.info(
    `Minimax Video: model=${model} duration=${duration}s res=${resolution} i2v=${!!firstFrameImage}`
  );

  const create = await client.post("/v1/video_generation", body, 60_000);
  const taskId = create.task_id;
  if (!taskId) throw new APIError("Minimax Video returned no task_id");
  logger.info(`Minimax Video task: ${taskId}`);

  const { fileId, width, height } = await pollVideoTask(client, taskId);

  const fileRes = await client.get("/v1/files/retrieve", { file_id: fileId });
  const downloadUrl = fileRes.file?.download_url;
  if (!downloadUrl) throw new APIError("Minimax Video returned no download URL");

  const buffer = await client.downloadBuffer(downloadUrl, 120_000);
  return {
    videoBase64: buffer.toString("base64"),
    mimeType: "video/mp4",
    metadata: {
      model,
      duration,
      resolution,
      width: width || 0,
      height: height || 0,
      fps: 25,
      processing_time_ms: Date.now() - startTime
    }
  };
}

async function pollVideoTask(
  client: MinimaxClient,
  taskId: string
): Promise<{ fileId: string; width: number; height: number }> {
  const started = Date.now();
  while (Date.now() - started < MAX_POLL_TIME_MS) {
    const res = await client.get("/v1/query/video_generation", { task_id: taskId });
    const status = res.status;
    const elapsed = Math.floor((Date.now() - started) / 1000);
    logger.debug(`Minimax Video poll: status=${status} elapsed=${elapsed}s`);
    if (status === "Success") {
      const fileId = res.file_id;
      if (!fileId) throw new APIError("Minimax Video succeeded but file_id missing");
      return { fileId, width: res.video_width ?? 0, height: res.video_height ?? 0 };
    }
    if (status === "Fail") {
      const msg = res.base_resp?.status_msg || "unknown error";
      throw new APIError(`Minimax Video generation failed: ${msg}`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new APIError(`Minimax Video timed out after ${MAX_POLL_TIME_MS / 1000}s`);
}
