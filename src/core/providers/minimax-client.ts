/**
 * Minimax API HTTP client — ported from human-mcp/src/utils/minimax-client.ts.
 * Shared surface for Speech 2.6, Music 2.5, and Hailuo 2.3 Video APIs.
 */
import { logger } from "../logger.js";
import { APIError } from "../errors.js";
import type { Config } from "../config-schema.js";

export interface MinimaxApiResponse {
  base_resp: { status_code: number; status_msg: string };
  data?: Record<string, unknown>;
  extra_info?: Record<string, unknown>;
  trace_id?: string;
  task_id?: string;
  status?: string;
  file_id?: string;
  file?: { file_id: string; download_url: string };
  video_width?: number;
  video_height?: number;
}

export class MinimaxApiError extends APIError {
  constructor(statusCode: number, message: string, public traceId?: string) {
    super(`Minimax: ${message}`, statusCode);
    this.name = "MinimaxApiError";
  }
}

export class MinimaxClient {
  private apiKey: string;
  private apiHost: string;

  constructor(config: Config) {
    const key = config.minimax?.apiKey;
    if (!key) throw new APIError("MINIMAX_API_KEY is required");
    this.apiKey = key;
    this.apiHost = config.minimax?.apiHost || "https://api.minimax.io";
  }

  static isConfigured(config: Config): boolean {
    return !!config.minimax?.apiKey;
  }

  async post(
    endpoint: string,
    body: Record<string, unknown>,
    timeoutMs = 300_000
  ): Promise<MinimaxApiResponse> {
    const url = `${this.apiHost}${endpoint}`;
    logger.debug(`Minimax POST ${url}`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      const json = (await res.json()) as MinimaxApiResponse;
      this.checkError(json);
      return json;
    } finally {
      clearTimeout(timer);
    }
  }

  async get(
    endpoint: string,
    params?: Record<string, string>,
    timeoutMs = 60_000
  ): Promise<MinimaxApiResponse> {
    const url = new URL(`${this.apiHost}${endpoint}`);
    if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    logger.debug(`Minimax GET ${url.toString()}`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: controller.signal
      });
      const json = (await res.json()) as MinimaxApiResponse;
      this.checkError(json);
      return json;
    } finally {
      clearTimeout(timer);
    }
  }

  async downloadBuffer(downloadUrl: string, timeoutMs = 120_000): Promise<Buffer> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(downloadUrl, { signal: controller.signal });
      if (!res.ok) throw new APIError(`Download failed: HTTP ${res.status}`, res.status);
      return Buffer.from(await res.arrayBuffer());
    } finally {
      clearTimeout(timer);
    }
  }

  private checkError(response: MinimaxApiResponse): void {
    const code = response.base_resp?.status_code;
    if (code === undefined || code === 0) return;
    const msg = response.base_resp?.status_msg || "Unknown error";
    const traceId = response.trace_id;
    const err = (label: string) => new MinimaxApiError(code, `${label}: ${msg}`, traceId);
    if (code === 1002 || code === 1039) throw err("Rate limit exceeded");
    if (code === 1004 || code === 2049) throw err("Authentication failed");
    if (code === 1008) throw err("Insufficient balance");
    if (code === 1026 || code === 1027) throw err("Content policy violation");
    if (code === 2013) throw err("Invalid parameters");
    throw err(`API error ${code}`);
  }
}
