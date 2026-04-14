/**
 * Gemini client — ported from human-mcp's gemini-client.ts, slimmed to the
 * methods our CLI commands actually exercise:
 *   - getModel(detailLevel)       → for text/vision/analysis
 *   - getImageGenerationModel()   → model builder for image gen
 *   - generateImageContent(opts)  → REST call (SDK doesn't support responseModalities)
 *   - generateSpeech(text, opts)  → REST TTS
 *   - analyzeContent(...)         → vision/multimodal with retry
 *
 * Supports both Google AI Studio (API key) and Vertex AI (ADC) auth modes.
 * Heavy doc-specific methods (processDocument, extractStructuredData, …) were
 * intentionally dropped — document processors now call analyzeContent directly.
 */
import { GoogleGenerativeAI, type GenerativeModel } from "@google/generative-ai";
import { APIError } from "../errors.js";
import { logger } from "../logger.js";
import type { Config } from "../config-schema.js";

export interface IGeminiProvider {
  getGenerativeModel(params: {
    model: string;
    safetySettings?: unknown[];
    generationConfig?: Record<string, unknown>;
    systemInstruction?: unknown;
  }): GenerativeModel;
  getProviderType(): "google-ai-studio" | "vertex-ai";
  getProviderName(): string;
}

class GoogleAIStudioProvider implements IGeminiProvider {
  private genAI: GoogleGenerativeAI;

  constructor(apiKey: string) {
    if (!apiKey) throw new APIError("Google Gemini API key is required");
    this.genAI = new GoogleGenerativeAI(apiKey);
    logger.debug("Initialized Google AI Studio provider");
  }

  getGenerativeModel(params: {
    model: string;
    safetySettings?: unknown[];
    generationConfig?: Record<string, unknown>;
    systemInstruction?: unknown;
  }): GenerativeModel {
    return this.genAI.getGenerativeModel({
      model: params.model,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      safetySettings: params.safetySettings as any,
      generationConfig: params.generationConfig,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      systemInstruction: params.systemInstruction as any
    });
  }

  getProviderType(): "google-ai-studio" {
    return "google-ai-studio";
  }

  getProviderName(): string {
    return "Google AI Studio";
  }
}

class VertexAIProvider implements IGeminiProvider {
  private projectId: string;
  private location: string;
  private sdk: unknown | null = null;

  constructor(projectId: string, location: string) {
    this.projectId = projectId;
    this.location = location;
    logger.debug(`Initialized Vertex AI provider (project=${projectId}, location=${location})`);
  }

  getGenerativeModel(params: {
    model: string;
    safetySettings?: unknown[];
    generationConfig?: Record<string, unknown>;
    systemInstruction?: unknown;
  }): GenerativeModel {
    // Vertex AI path is rarely used; lazy-require to avoid pulling the SDK for AI Studio users
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { VertexAI } = require("@google-cloud/vertexai") as {
        VertexAI: new (opts: { project: string; location: string }) => {
          getGenerativeModel: (p: unknown) => GenerativeModel;
        };
      };
      if (!this.sdk) {
        this.sdk = new VertexAI({ project: this.projectId, location: this.location });
      }
      return (this.sdk as { getGenerativeModel: (p: unknown) => GenerativeModel }).getGenerativeModel({
        model: params.model,
        safetySettings: params.safetySettings,
        generationConfig: params.generationConfig,
        systemInstruction: params.systemInstruction
      });
    } catch {
      throw new APIError(
        "Vertex AI mode requires @google-cloud/vertexai. Install with: npm i @google-cloud/vertexai"
      );
    }
  }

  getProviderType(): "vertex-ai" {
    return "vertex-ai";
  }

  getProviderName(): string {
    return "Vertex AI";
  }
}

export class GeminiClient {
  private provider: IGeminiProvider;

  constructor(private config: Config) {
    if (config.gemini.useVertexAI) {
      if (!config.gemini.vertexProjectId) {
        throw new APIError(
          "Vertex AI mode enabled (USE_VERTEX=1) but VERTEX_PROJECT_ID is not set."
        );
      }
      this.provider = new VertexAIProvider(
        config.gemini.vertexProjectId,
        config.gemini.vertexLocation
      );
    } else {
      if (!config.gemini.apiKey) {
        throw new APIError(
          "Google Gemini API key is required. Set GOOGLE_GEMINI_API_KEY, or enable Vertex AI with USE_VERTEX=1 and VERTEX_PROJECT_ID."
        );
      }
      this.provider = new GoogleAIStudioProvider(config.gemini.apiKey);
    }
  }

  static isConfigured(config: Config): boolean {
    return Boolean(config.gemini.apiKey || (config.gemini.useVertexAI && config.gemini.vertexProjectId));
  }

  getProviderInfo(): { type: string; name: string } {
    return { type: this.provider.getProviderType(), name: this.provider.getProviderName() };
  }

  private isGemini3(modelName: string): boolean {
    return /^gemini-3(\.\d+)?/.test(modelName);
  }

  /** Model for text/vision/analysis tasks. */
  getModel(detailLevel: "quick" | "detailed"): GenerativeModel {
    const modelName = detailLevel === "detailed" ? this.config.gemini.model : "gemini-2.5-flash";
    const generationConfig = this.isGemini3(modelName)
      ? { topK: 1, topP: 0.95, maxOutputTokens: 8192 }
      : { temperature: 0.1, topK: 1, topP: 0.95, maxOutputTokens: 8192 };
    return this.provider.getGenerativeModel({ model: modelName, generationConfig });
  }

  /** Model for image generation (used when SDK supports it). */
  getImageGenerationModel(modelName?: string): GenerativeModel {
    const name = modelName || this.config.gemini.imageModel || "gemini-2.5-flash-image";
    const generationConfig = this.isGemini3(name)
      ? { topK: 32, topP: 0.95, maxOutputTokens: 8192 }
      : { temperature: 0.7, topK: 32, topP: 0.95, maxOutputTokens: 8192 };
    return this.provider.getGenerativeModel({ model: name, generationConfig });
  }

  /** Model for TTS generation. */
  getSpeechModel(modelName?: string): GenerativeModel {
    const name = modelName || "gemini-2.5-flash-preview-tts";
    const generationConfig = { temperature: 0.7, topK: 32, topP: 0.95, maxOutputTokens: 8192 };
    return this.provider.getGenerativeModel({ model: name, generationConfig });
  }

  /**
   * Analyze media/text with retry. `mediaData` items become inlineData parts.
   */
  async analyzeContent(
    model: GenerativeModel,
    prompt: string,
    mediaData: Array<{ mimeType: string; data: string }> = [],
    maxRetries = 3
  ): Promise<string> {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const parts = [
          { text: prompt },
          ...mediaData.map((m) => ({ inlineData: { mimeType: m.mimeType, data: m.data } }))
        ];
        const analysisPromise = model.generateContent(parts);
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new APIError("Gemini API request timed out")),
            this.config.server.requestTimeout
          );
        });
        const result = await Promise.race([analysisPromise, timeoutPromise]);
        const text = result.response.text();
        if (!text) throw new APIError("No response from Gemini API");
        return text;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Unknown error");
        logger.warn(`Content analysis attempt ${attempt} failed: ${lastError.message}`);
        if (!isRetryableError(error) || attempt === maxRetries) break;
        await sleep(backoffDelay(attempt));
      }
    }
    throw this.humanizeError(lastError, "Content analysis");
  }

  /**
   * Generate an image via REST (SDK v0.21.0 doesn't support responseModalities).
   */
  async generateImageContent(options: {
    prompt: string;
    model?: string;
    inputImages?: Array<{ mimeType: string; data: string }>;
  }): Promise<{ imageData: string; mimeType: string; textResponse?: string }> {
    const modelName =
      options.model || this.config.gemini.imageModel || "gemini-2.5-flash-image";

    const parts: Array<Record<string, unknown>> = [{ text: options.prompt }];
    if (options.inputImages?.length) {
      for (const img of options.inputImages) {
        parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
      }
    }

    const body = {
      contents: [{ parts }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] }
    };

    const response = await this.callGeminiRest(modelName, body, "image generation");
    const data = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data: string; mimeType?: string }; text?: string }> } }> };
    const firstParts = data.candidates?.[0]?.content?.parts;
    if (!firstParts || firstParts.length === 0) {
      throw new APIError("Invalid response format from Gemini API");
    }

    let imageData: string | null = null;
    let mimeType = "image/png";
    let textResponse: string | undefined;
    for (const p of firstParts) {
      if (p.inlineData) {
        imageData = p.inlineData.data;
        mimeType = p.inlineData.mimeType ?? "image/png";
      } else if (p.text) {
        textResponse = p.text;
      }
    }
    if (!imageData) throw new APIError("No image data found in Gemini response");
    return { imageData, mimeType, textResponse };
  }

  /**
   * Generate speech audio via REST TTS.
   */
  async generateSpeech(
    text: string,
    options: {
      voice?: string;
      model?: string;
      language?: string;
      stylePrompt?: string;
    } = {}
  ): Promise<{
    audioData: string;
    metadata: {
      voice: string;
      model: string;
      language: string;
      sampleRate: number;
      channels: number;
      format: string;
      textLength: number;
      timestamp: string;
    };
  }> {
    const voice = options.voice ?? "Zephyr";
    const model = options.model ?? "gemini-2.5-flash-preview-tts";
    const language = options.language ?? "en-US";
    const prompt = options.stylePrompt ? `${options.stylePrompt}: ${text}` : text;

    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } }
        }
      }
    };

    const response = await this.callGeminiRest(model, body, "speech generation");
    const result = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data: string } }> } }> };
    const audioData = result.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!audioData) throw new APIError("No audio data received from Gemini Speech API");

    return {
      audioData,
      metadata: {
        voice,
        model,
        language,
        sampleRate: 24000,
        channels: 1,
        format: "wav",
        textLength: text.length,
        timestamp: new Date().toISOString()
      }
    };
  }

  /** Shared REST caller — handles both AI Studio and Vertex auth. */
  private async callGeminiRest(
    model: string,
    body: unknown,
    opLabel: string
  ): Promise<Response> {
    let response: Response;
    if (this.config.gemini.useVertexAI) {
      const location = this.config.gemini.vertexLocation;
      const projectId = this.config.gemini.vertexProjectId;
      const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:generateContent`;
      const token = await getVertexToken();
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body)
      });
    } else {
      if (!this.config.gemini.apiKey) {
        throw new APIError(`${opLabel}: GOOGLE_GEMINI_API_KEY not set`);
      }
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": this.config.gemini.apiKey },
        body: JSON.stringify(body)
      });
    }
    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`${opLabel} API error (${response.status}): ${errorText}`);
      throw new APIError(`${opLabel} failed (${response.status}): ${errorText}`);
    }
    return response;
  }

  private humanizeError(err: Error | null, op: string): never {
    const e = err as { status?: number; code?: string; message?: string } | null;
    if (e?.status === 400) throw new APIError(`${op}: invalid request`);
    if (e?.status === 403) throw new APIError(`${op}: API key invalid or insufficient permissions`);
    if (e?.status === 429) throw new APIError(`${op}: rate limit exceeded — please retry later`);
    if (e?.status === 500) throw new APIError(`${op}: Gemini server error — please retry`);
    if (e?.status === 503) throw new APIError(`${op}: Gemini temporarily unavailable (503)`);
    if (e?.code === "ECONNRESET" || e?.code === "ETIMEDOUT") {
      throw new APIError(`${op}: network error — check connection`);
    }
    throw new APIError(`${op}: ${e?.message ?? "unknown error"}`);
  }
}

async function getVertexToken(): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { GoogleAuth } = require("google-auth-library") as {
      GoogleAuth: new (opts: { scopes: string[] }) => {
        getClient: () => Promise<{ getAccessToken: () => Promise<{ token: string | null }> }>;
      };
    };
    const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    if (!token.token) throw new APIError("No access token from ADC");
    return token.token;
  } catch (err) {
    throw new APIError(
      `Failed to obtain Vertex AI credentials. Run 'gcloud auth application-default login' or install google-auth-library. ${err instanceof Error ? err.message : err}`
    );
  }
}

function isRetryableError(err: unknown): boolean {
  const e = err as { status?: number; code?: string; message?: string };
  const retryStatuses = [429, 500, 502, 503, 504];
  const retryCodes = ["ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "ECONNREFUSED"];
  return (
    (e?.status !== undefined && retryStatuses.includes(e.status)) ||
    (e?.code !== undefined && retryCodes.includes(e.code)) ||
    (e?.message?.includes("timeout") ?? false) ||
    (e?.message?.includes("network") ?? false)
  );
}

function backoffDelay(attempt: number, base = 1000): number {
  const exp = base * Math.pow(2, attempt - 1);
  const jitter = Math.random() * 0.1 * exp;
  return Math.min(exp + jitter, 30_000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}
