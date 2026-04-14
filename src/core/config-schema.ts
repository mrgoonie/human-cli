/**
 * Config schema — the typed runtime configuration used by every processor.
 *
 * Slimmed from human-mcp to drop HTTP transport / server / security / cloudflare
 * concerns that don't apply to a CLI. Only the provider + feature-flag portions
 * remain. Input keys still match the env-var names human-mcp uses, so user
 * configs are backwards-compatible.
 */
import { z } from "zod";

export const ConfigSchema = z.object({
  gemini: z.object({
    apiKey: z.string().optional(),
    model: z.string().default("gemini-2.5-flash"),
    imageModel: z.string().default("gemini-2.5-flash-image"),
    useVertexAI: z.boolean().default(false),
    vertexProjectId: z.string().optional(),
    vertexLocation: z.string().default("us-central1")
  }),
  minimax: z
    .object({
      apiKey: z.string().optional(),
      apiHost: z.string().default("https://api.minimax.io")
    })
    .optional(),
  zhipuai: z
    .object({
      apiKey: z.string().optional(),
      apiHost: z.string().default("https://api.z.ai/api/paas/v4")
    })
    .optional(),
  elevenlabs: z
    .object({
      apiKey: z.string().optional(),
      apiHost: z.string().default("https://api.elevenlabs.io")
    })
    .optional(),
  providers: z
    .object({
      speech: z.enum(["gemini", "minimax", "elevenlabs"]).default("gemini"),
      video: z.enum(["gemini", "minimax", "zhipuai"]).default("gemini"),
      vision: z.enum(["gemini", "zhipuai"]).default("gemini"),
      image: z.enum(["gemini", "zhipuai"]).default("gemini")
    })
    .default({ speech: "gemini", video: "gemini", vision: "gemini", image: "gemini" }),
  logging: z.object({
    level: z.enum(["debug", "info", "warn", "error"]).default("info")
  }),
  server: z.object({
    fetchTimeout: z.number().default(60000),
    requestTimeout: z.number().default(300000)
  }),
  documentProcessing: z
    .object({
      enabled: z.boolean().default(true),
      maxFileSize: z.number().default(50 * 1024 * 1024),
      supportedFormats: z
        .array(z.string())
        .default([
          "pdf",
          "docx",
          "xlsx",
          "pptx",
          "txt",
          "md",
          "rtf",
          "odt",
          "csv",
          "json",
          "xml",
          "html"
        ]),
      timeout: z.number().default(300000),
      retryAttempts: z.number().default(3),
      ocrEnabled: z.boolean().default(false),
      geminiModel: z.string().default("gemini-2.5-flash")
    })
    .default({
      enabled: true,
      maxFileSize: 50 * 1024 * 1024,
      supportedFormats: [
        "pdf",
        "docx",
        "xlsx",
        "pptx",
        "txt",
        "md",
        "rtf",
        "odt",
        "csv",
        "json",
        "xml",
        "html"
      ],
      timeout: 300000,
      retryAttempts: 3,
      ocrEnabled: false,
      geminiModel: "gemini-2.5-flash"
    })
});

export type Config = z.infer<typeof ConfigSchema>;
