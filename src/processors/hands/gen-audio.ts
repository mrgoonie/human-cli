/**
 * Music & sound-effect generators — ported from human-mcp's Minimax + ElevenLabs providers.
 * File-storage bits stripped; the CLI's format-result layer handles media saving.
 */
import { MinimaxClient } from "../../core/providers/minimax-client.js";
import { ElevenLabsClient } from "../../core/providers/elevenlabs-client.js";
import { APIError } from "../../core/errors.js";
import { logger } from "../../core/logger.js";
import type { Config } from "../../core/config-schema.js";

export interface AudioGenResult {
  audioBase64: string;
  mimeType: string;
  metadata: {
    model: string;
    format: string;
    duration_seconds?: number;
    processing_time_ms: number;
  };
}

/* ──────────────── Minimax Music 2.5 ──────────────── */

export interface MinimaxMusicOptions {
  lyrics: string;
  prompt?: string;
  model?: string;
  audioFormat?: "mp3" | "wav";
  sampleRate?: number;
  bitrate?: number;
}

export async function generateMinimaxMusic(
  config: Config,
  opts: MinimaxMusicOptions
): Promise<AudioGenResult> {
  const startTime = Date.now();
  if (!opts.lyrics?.trim()) throw new APIError("Lyrics are required for Minimax music generation");
  if (!MinimaxClient.isConfigured(config)) {
    throw new APIError("MINIMAX_API_KEY required for music generation");
  }

  const model = opts.model ?? "music-2.5";
  const audioFormat = opts.audioFormat ?? "mp3";
  const sampleRate = opts.sampleRate ?? 44100;
  const bitrate = opts.bitrate ?? 256000;

  const client = new MinimaxClient(config);
  const body: Record<string, unknown> = {
    model,
    lyrics: opts.lyrics,
    output_format: "url",
    audio_setting: { sample_rate: sampleRate, bitrate, format: audioFormat }
  };
  if (opts.prompt) body.prompt = opts.prompt;

  logger.info(
    `Minimax Music: model=${model} lyrics=${opts.lyrics.length}chars prompt="${(opts.prompt ?? "").slice(0, 50)}"`
  );
  const response = await client.post("/v1/music_generation", body, 300_000);
  const audioUrl = (response.data as { audio?: string })?.audio;
  if (!audioUrl) throw new APIError("Minimax Music returned no audio URL");

  const durationSec = (response.extra_info as { music_duration?: number })?.music_duration;
  const buffer = await client.downloadBuffer(audioUrl, 120_000);

  return {
    audioBase64: buffer.toString("base64"),
    mimeType: audioFormat === "wav" ? "audio/wav" : "audio/mpeg",
    metadata: {
      model,
      format: audioFormat,
      duration_seconds: durationSec,
      processing_time_ms: Date.now() - startTime
    }
  };
}

/* ──────────────── ElevenLabs SFX ──────────────── */

export interface ElevenLabsSfxOptions {
  text: string;
  duration_seconds?: number;
  prompt_influence?: number;
  loop?: boolean;
}

export async function generateElevenLabsSfx(
  config: Config,
  opts: ElevenLabsSfxOptions
): Promise<AudioGenResult> {
  const startTime = Date.now();
  if (!opts.text?.trim()) throw new APIError("Text prompt required for SFX generation");
  if (!ElevenLabsClient.isConfigured(config)) {
    throw new APIError("ELEVENLABS_API_KEY required for SFX generation (paid plan)");
  }

  const client = new ElevenLabsClient(config);
  const body: Record<string, unknown> = {
    text: opts.text,
    model_id: "eleven_text_to_sound_v2",
    prompt_influence: opts.prompt_influence ?? 0.3,
    loop: opts.loop ?? false
  };
  if (opts.duration_seconds !== undefined) body.duration_seconds = opts.duration_seconds;

  logger.info(
    `ElevenLabs SFX: "${opts.text.slice(0, 60)}" duration=${opts.duration_seconds ?? "auto"}`
  );
  const buffer = await client.postBinary(
    "/v1/sound-generation",
    body,
    { output_format: "mp3_44100_128" },
    60_000
  );

  return {
    audioBase64: buffer.toString("base64"),
    mimeType: "audio/mpeg",
    metadata: {
      model: "eleven_text_to_sound_v2",
      format: "mp3",
      duration_seconds: opts.duration_seconds,
      processing_time_ms: Date.now() - startTime
    }
  };
}

/* ──────────────── ElevenLabs Music ──────────────── */

export interface ElevenLabsMusicOptions {
  prompt: string;
  music_length_ms?: number;
  force_instrumental?: boolean;
}

export async function generateElevenLabsMusic(
  config: Config,
  opts: ElevenLabsMusicOptions
): Promise<AudioGenResult> {
  const startTime = Date.now();
  if (!opts.prompt?.trim()) throw new APIError("Prompt required for ElevenLabs music generation");
  if (!ElevenLabsClient.isConfigured(config)) {
    throw new APIError("ELEVENLABS_API_KEY required for music generation (paid plan)");
  }
  const lengthMs = opts.music_length_ms ?? 30_000;
  if (lengthMs < 3000 || lengthMs > 600_000) {
    throw new APIError("music_length_ms must be between 3000 (3s) and 600000 (10min)");
  }

  const client = new ElevenLabsClient(config);
  const body: Record<string, unknown> = {
    prompt: opts.prompt,
    music_length_ms: lengthMs,
    model_id: "music_v1",
    force_instrumental: opts.force_instrumental ?? false
  };

  logger.info(
    `ElevenLabs Music: "${opts.prompt.slice(0, 60)}" length=${lengthMs}ms instrumental=${body.force_instrumental}`
  );
  const buffer = await client.postBinary(
    "/v1/music",
    body,
    { output_format: "mp3_44100_128" },
    300_000
  );

  return {
    audioBase64: buffer.toString("base64"),
    mimeType: "audio/mpeg",
    metadata: {
      model: "music_v1",
      format: "mp3",
      duration_seconds: lengthMs / 1000,
      processing_time_ms: Date.now() - startTime
    }
  };
}
