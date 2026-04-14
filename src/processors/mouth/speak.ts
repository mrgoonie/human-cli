/**
 * Text-to-speech via Gemini TTS. Returns a fully-wrapped WAV base64.
 * Gemini TTS emits 16-bit PCM mono at 24 kHz; we prepend a RIFF/WAVE header
 * in-memory so the output plays in any audio tool without extra wrapping.
 *
 * Ported from human-mcp/src/tools/mouth/processors/speech-synthesis.ts,
 * dropping Minimax/ElevenLabs provider branches for v2.0-alpha (deferred).
 */
import { GeminiClient } from "../../core/providers/gemini-client.js";
import { APIError } from "../../core/errors.js";
import type { Config } from "../../core/config-schema.js";

export interface SpeakOptions {
  text: string;
  voice?: string;
  model?: string;
  language?: string;
  stylePrompt?: string;
}

export interface SpeakResult {
  audioBase64: string; // WAV-wrapped base64
  mimeType: "audio/wav";
  metadata: {
    voice: string;
    model: string;
    language: string;
    sampleRate: number;
    channels: number;
    bitDepth: number;
    textLength: number;
    processing_time_ms: number;
  };
}

export async function speak(config: Config, opts: SpeakOptions): Promise<SpeakResult> {
  const startTime = Date.now();
  if (!opts.text || opts.text.trim().length === 0) {
    throw new APIError("Text is required for speech generation");
  }
  if (opts.text.length > 32000) {
    throw new APIError("Text too long. Max 32,000 characters for Gemini TTS");
  }

  const client = new GeminiClient(config);
  const raw = await client.generateSpeech(opts.text, {
    voice: opts.voice,
    model: opts.model,
    language: opts.language,
    stylePrompt: opts.stylePrompt
  });

  const pcm = Buffer.from(raw.audioData, "base64");
  const wav = wrapPcmAsWav(pcm, {
    sampleRate: raw.metadata.sampleRate,
    channels: raw.metadata.channels,
    bitDepth: 16
  });

  return {
    audioBase64: wav.toString("base64"),
    mimeType: "audio/wav",
    metadata: {
      voice: raw.metadata.voice,
      model: raw.metadata.model,
      language: raw.metadata.language,
      sampleRate: raw.metadata.sampleRate,
      channels: raw.metadata.channels,
      bitDepth: 16,
      textLength: opts.text.length,
      processing_time_ms: Date.now() - startTime
    }
  };
}

/**
 * Long-form narration — chunks text and concatenates audio.
 * Simple approach: split on paragraph boundaries under maxChunkSize chars.
 */
export interface NarrateOptions {
  content: string;
  voice?: string;
  model?: string;
  language?: string;
  narrationStyle?: "professional" | "casual" | "educational" | "storytelling";
  chapterBreaks?: boolean;
  maxChunkSize?: number;
}

export async function narrate(
  config: Config,
  opts: NarrateOptions
): Promise<SpeakResult & { chunks: number }> {
  const startTime = Date.now();
  const maxChunkSize = opts.maxChunkSize ?? 8000;
  const chunks = splitForSpeech(opts.content, maxChunkSize);

  const stylePrompt = opts.narrationStyle
    ? `Narrate in a ${opts.narrationStyle} tone`
    : undefined;

  const pcmBuffers: Buffer[] = [];
  let commonMeta: SpeakResult["metadata"] | null = null;
  for (const chunk of chunks) {
    const client = new GeminiClient(config);
    const raw = await client.generateSpeech(chunk, {
      voice: opts.voice ?? "Sage",
      model: opts.model,
      language: opts.language,
      stylePrompt
    });
    pcmBuffers.push(Buffer.from(raw.audioData, "base64"));
    commonMeta = {
      voice: raw.metadata.voice,
      model: raw.metadata.model,
      language: raw.metadata.language,
      sampleRate: raw.metadata.sampleRate,
      channels: raw.metadata.channels,
      bitDepth: 16,
      textLength: opts.content.length,
      processing_time_ms: 0
    };
  }
  if (!commonMeta) throw new APIError("No audio chunks generated");

  const fullPcm = Buffer.concat(pcmBuffers);
  const wav = wrapPcmAsWav(fullPcm, {
    sampleRate: commonMeta.sampleRate,
    channels: commonMeta.channels,
    bitDepth: 16
  });

  return {
    audioBase64: wav.toString("base64"),
    mimeType: "audio/wav",
    chunks: chunks.length,
    metadata: { ...commonMeta, processing_time_ms: Date.now() - startTime }
  };
}

/** Split text into speech-friendly chunks, prefer paragraph boundaries. */
function splitForSpeech(text: string, maxSize: number): string[] {
  if (text.length <= maxSize) return [text];
  const chunks: string[] = [];
  const paragraphs = text.split(/\n\s*\n/);
  let current = "";
  for (const p of paragraphs) {
    if ((current + "\n\n" + p).length > maxSize && current) {
      chunks.push(current);
      current = p;
    } else {
      current = current ? `${current}\n\n${p}` : p;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** Prepend a RIFF/WAVE header to raw PCM data. No dependencies. */
function wrapPcmAsWav(
  pcm: Buffer,
  opts: { sampleRate: number; channels: number; bitDepth: number }
): Buffer {
  const { sampleRate, channels, bitDepth } = opts;
  const byteRate = (sampleRate * channels * bitDepth) / 8;
  const blockAlign = (channels * bitDepth) / 8;
  const dataSize = pcm.length;
  const fileSize = 36 + dataSize;

  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(fileSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // PCM subchunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitDepth, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcm]);
}
