/**
 * Build a validated Config object from a plain env record.
 *
 * The resolver in `src/config/resolve-env.ts` owns the 5-layer merge
 * (OS > userConfig > process.env > .env > inline). This file takes the
 * resulting key/value map and shapes it into the nested Config schema used
 * by every processor.
 */
import { ConfigSchema, type Config } from "./config-schema.js";
import type { EnvRecord } from "../config/env-sources.js";

export function buildConfig(env: EnvRecord): Config {
  const useVertex = env.USE_VERTEX === "1" || env.USE_VERTEX === "true";
  return ConfigSchema.parse({
    gemini: {
      apiKey: env.GOOGLE_GEMINI_API_KEY || "",
      model: env.GOOGLE_GEMINI_MODEL || "gemini-2.5-flash",
      imageModel: env.GOOGLE_GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image",
      useVertexAI: useVertex,
      vertexProjectId: env.VERTEX_PROJECT_ID,
      vertexLocation: env.VERTEX_LOCATION || "us-central1"
    },
    minimax: {
      apiKey: env.MINIMAX_API_KEY,
      apiHost: env.MINIMAX_API_HOST || "https://api.minimax.io"
    },
    zhipuai: {
      apiKey: env.ZHIPUAI_API_KEY,
      apiHost: env.ZHIPUAI_API_HOST || "https://api.z.ai/api/paas/v4"
    },
    elevenlabs: {
      apiKey: env.ELEVENLABS_API_KEY,
      apiHost: env.ELEVENLABS_API_HOST || "https://api.elevenlabs.io"
    },
    providers: {
      speech: (env.SPEECH_PROVIDER as Config["providers"]["speech"]) || "gemini",
      video: (env.VIDEO_PROVIDER as Config["providers"]["video"]) || "gemini",
      vision: (env.VISION_PROVIDER as Config["providers"]["vision"]) || "gemini",
      image: (env.IMAGE_PROVIDER as Config["providers"]["image"]) || "gemini"
    },
    logging: {
      level: (env.LOG_LEVEL as Config["logging"]["level"]) || "info"
    },
    server: {
      fetchTimeout: Number(env.FETCH_TIMEOUT) || 60000,
      requestTimeout: Number(env.REQUEST_TIMEOUT) || 300000
    },
    documentProcessing: {
      enabled: env.DOCUMENT_PROCESSING_ENABLED !== "false",
      maxFileSize: Number(env.DOCUMENT_MAX_FILE_SIZE) || 50 * 1024 * 1024,
      supportedFormats: env.DOCUMENT_SUPPORTED_FORMATS
        ? env.DOCUMENT_SUPPORTED_FORMATS.split(",").map((s) => s.trim())
        : undefined,
      timeout: Number(env.DOCUMENT_TIMEOUT) || 300000,
      retryAttempts: Number(env.DOCUMENT_RETRY_ATTEMPTS) || 3,
      ocrEnabled: env.DOCUMENT_OCR_ENABLED === "true",
      geminiModel: env.DOCUMENT_GEMINI_MODEL || "gemini-2.5-flash"
    }
  });
}
