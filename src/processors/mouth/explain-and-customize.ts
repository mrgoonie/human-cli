/**
 * Code-to-speech explanation + voice customization.
 * Ported from human-mcp's mouth processors with the same algorithmic shape
 * (analyze → explain text → TTS), dropping file-storage wrappers.
 */
import { GeminiClient } from "../../core/providers/gemini-client.js";
import { APIError } from "../../core/errors.js";
import { logger } from "../../core/logger.js";
import type { Config } from "../../core/config-schema.js";
import { speak, type SpeakResult } from "./speak.js";

/* ─────────── mouth.explain ─────────── */

export interface ExplainOptions {
  code: string;
  language?: string; // spoken lang (e.g. "en-US")
  programmingLanguage?: string;
  voice?: string;
  explanationLevel?: "beginner" | "intermediate" | "advanced";
  includeExamples?: boolean;
}

export interface ExplainResult extends SpeakResult {
  explanation: string;
  codeAnalysis: string;
}

export async function explainCode(
  config: Config,
  opts: ExplainOptions
): Promise<ExplainResult> {
  if (!opts.code?.trim()) throw new APIError("Code is required for explanation");

  const client = new GeminiClient(config);
  const model = client.getModel("detailed");
  const level = opts.explanationLevel ?? "intermediate";

  logger.info(
    `Explaining ${opts.code.length} chars of ${opts.programmingLanguage ?? "code"} at ${level} level`
  );

  // 1. Short structural analysis
  const analysisPrompt = `Analyse this ${opts.programmingLanguage ?? ""} code for a spoken explanation.
Respond with: (a) main concepts, (b) data flow, (c) notable patterns, (d) any gotchas. Keep under 200 words.

\`\`\`
${opts.code.slice(0, 6000)}
\`\`\``;
  const codeAnalysis = await client.analyzeContent(model, analysisPrompt, []);

  // 2. Narratable explanation
  const audience =
    level === "beginner"
      ? "someone new to programming — explain every concept, avoid jargon"
      : level === "advanced"
        ? "an expert — focus on architecture, trade-offs, and subtle behaviour"
        : "an experienced developer new to this codebase — balance structure with detail";
  const examplesLine = opts.includeExamples ? "Include a short usage example." : "";
  const explanationPrompt = `Based on this analysis, produce a clear spoken explanation of the code for ${audience}. ${examplesLine}
Use plain prose — no markdown, no code fences. Aim for ~180-300 words.

Analysis:
${codeAnalysis}

Code:
\`\`\`
${opts.code.slice(0, 6000)}
\`\`\``;
  const explanation = await client.analyzeContent(model, explanationPrompt, []);

  // 3. Speak
  const stylePrompt =
    level === "beginner"
      ? "Speak slowly and patiently, like a teacher"
      : level === "advanced"
        ? "Speak concisely and technically, like a senior engineer"
        : "Speak clearly and evenly, like a tech presenter";

  const speech = await speak(config, {
    text: explanation,
    voice: opts.voice ?? "Apollo",
    language: opts.language ?? "en-US",
    stylePrompt
  });

  return { ...speech, explanation, codeAnalysis };
}

/* ─────────── mouth.customize ─────────── */

export interface CustomizeOptions {
  text: string;
  voice?: string;
  language?: string;
  /** Comma-style style prompts to render against the same text. */
  styleVariations?: string[];
  /** Other voices to compare the base voice against. */
  compareVoices?: string[];
}

export interface CustomizeVariantResult {
  voice: string;
  stylePrompt?: string;
  audioBase64: string;
  mimeType: "audio/wav";
  processing_time_ms: number;
}

export interface CustomizeResult {
  text: string;
  variants: CustomizeVariantResult[];
  totalVariants: number;
  processing_time_ms: number;
}

export async function customizeVoice(
  config: Config,
  opts: CustomizeOptions
): Promise<CustomizeResult> {
  const startTime = Date.now();
  if (!opts.text?.trim()) throw new APIError("Text is required for voice customization");

  const primaryVoice = opts.voice ?? "Zephyr";
  const voices = Array.from(new Set([primaryVoice, ...(opts.compareVoices ?? [])]));
  const styles = opts.styleVariations?.length ? opts.styleVariations : [undefined];

  const variants: CustomizeVariantResult[] = [];
  for (const v of voices) {
    for (const style of styles) {
      const stepStart = Date.now();
      const result = await speak(config, {
        text: opts.text,
        voice: v,
        language: opts.language ?? "en-US",
        stylePrompt: style
      });
      variants.push({
        voice: v,
        stylePrompt: style,
        audioBase64: result.audioBase64,
        mimeType: result.mimeType,
        processing_time_ms: Date.now() - stepStart
      });
    }
  }

  return {
    text: opts.text,
    variants,
    totalVariants: variants.length,
    processing_time_ms: Date.now() - startTime
  };
}
