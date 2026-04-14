/**
 * ElevenLabs API HTTP client — ported from human-mcp/src/utils/elevenlabs-client.ts.
 * Shared surface for TTS, Sound Effects, and Music Generation APIs.
 */
import { logger } from "../logger.js";
import { APIError } from "../errors.js";
import type { Config } from "../config-schema.js";

export class ElevenLabsApiError extends APIError {
  constructor(statusCode: number, message: string, public requestId?: string) {
    super(`ElevenLabs: ${message}`, statusCode);
    this.name = "ElevenLabsApiError";
  }
}

export class ElevenLabsClient {
  private apiKey: string;
  private apiHost: string;

  constructor(config: Config) {
    const key = config.elevenlabs?.apiKey;
    if (!key) throw new APIError("ELEVENLABS_API_KEY is required");
    this.apiKey = key;
    this.apiHost = config.elevenlabs?.apiHost || "https://api.elevenlabs.io";
  }

  static isConfigured(config: Config): boolean {
    return !!config.elevenlabs?.apiKey;
  }

  /**
   * POST binary → returns raw audio bytes. Used by TTS, SFX and Music endpoints.
   */
  async postBinary(
    endpoint: string,
    body: Record<string, unknown>,
    queryParams?: Record<string, string>,
    timeoutMs = 600_000
  ): Promise<Buffer> {
    const url = new URL(`${this.apiHost}${endpoint}`);
    if (queryParams) for (const [k, v] of Object.entries(queryParams)) url.searchParams.set(k, v);
    logger.debug(`ElevenLabs POST (binary) ${url.toString()}`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "xi-api-key": this.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      if (!res.ok) {
        const requestId = res.headers.get("request-id") || undefined;
        let msg = `HTTP ${res.status}`;
        try {
          const json = (await res.json()) as unknown;
          msg = this.extractErrorMessage(json, res.status);
        } catch {
          // body wasn't JSON
        }
        throw new ElevenLabsApiError(res.status, msg, requestId);
      }
      return Buffer.from(await res.arrayBuffer());
    } finally {
      clearTimeout(timer);
    }
  }

  async postJson<T = unknown>(
    endpoint: string,
    body: Record<string, unknown>,
    timeoutMs = 60_000
  ): Promise<T> {
    const url = `${this.apiHost}${endpoint}`;
    logger.debug(`ElevenLabs POST (json) ${url}`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "xi-api-key": this.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      const json = (await res.json()) as unknown;
      if (!res.ok) {
        const requestId = res.headers.get("request-id") || undefined;
        throw new ElevenLabsApiError(res.status, this.extractErrorMessage(json, res.status), requestId);
      }
      return json as T;
    } finally {
      clearTimeout(timer);
    }
  }

  private extractErrorMessage(errorJson: unknown, statusCode: number): string {
    const e = errorJson as { detail?: { message?: string } | string | unknown[] };
    if (e?.detail && typeof e.detail === "object" && !Array.isArray(e.detail) && "message" in e.detail) {
      return (e.detail as { message: string }).message;
    }
    if (typeof e?.detail === "string") return e.detail;
    if (Array.isArray(e?.detail)) {
      return (e.detail as Array<{ msg?: string }>).map((d) => d.msg || JSON.stringify(d)).join("; ");
    }
    return `ElevenLabs API error (HTTP ${statusCode})`;
  }
}
