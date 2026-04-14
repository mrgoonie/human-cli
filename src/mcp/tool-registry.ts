/**
 * Native tool registry — maps MCP-compatible tool names to our processor
 * functions. Consumed by:
 *   - `human call <tool>`     — direct invocation with JSON args
 *   - `human tools`           — list available tools
 *   - `human mcp start`       — serve as MCP stdio server
 */
import type { Config } from "../core/config-schema.js";
import { loadMedia } from "../core/media-loader.js";
import { analyzeImage, compareImages } from "../processors/eyes/analyze-image.js";
import { readDocument, summarizeDocument } from "../processors/eyes/read-document.js";
import { generateImage, editImageWithGemini } from "../processors/hands/gen-image.js";
import { cropImage, resizeImage, rotateImage, maskImage } from "../processors/hands/jimp-ops.js";
import { speak, narrate } from "../processors/mouth/speak.js";
import { explainCode, customizeVoice } from "../processors/mouth/explain-and-customize.js";
import { think, reflect, analyzeSimple, patternsInfo } from "../processors/brain/think.js";
import { generateVideo } from "../processors/hands/gen-video.js";
import {
  generateMinimaxMusic,
  generateElevenLabsSfx,
  generateElevenLabsMusic
} from "../processors/hands/gen-audio.js";
import { removeBackground } from "../processors/hands/remove-background.js";
import {
  captureFullPage,
  captureViewport,
  captureElement
} from "../processors/hands/screenshot.js";

export interface ToolCallResult {
  text: string;
  media: Array<{ kind: "image" | "audio" | "video" | "blob"; mimeType: string; base64: string }>;
}

export interface ToolSpec {
  name: string;
  description: string;
  /** Exposed to MCP clients — rough inputSchema hint. Keep loose. */
  inputSchema: Record<string, { type: string; description?: string; required?: boolean }>;
  run: (config: Config, args: Record<string, unknown>) => Promise<ToolCallResult>;
}

const imageMedia = (data: string, mime: string): ToolCallResult["media"] => [
  { kind: "image", mimeType: mime, base64: data }
];
const audioMedia = (data: string, mime: string): ToolCallResult["media"] => [
  { kind: "audio", mimeType: mime, base64: data }
];
const videoMedia = (data: string, mime: string): ToolCallResult["media"] => [
  { kind: "video", mimeType: mime, base64: data }
];

export const TOOL_REGISTRY: ToolSpec[] = [
  {
    name: "eyes_analyze",
    description: "Analyze image with AI vision (Gemini)",
    inputSchema: {
      source: { type: "string", required: true, description: "File path, URL, or data URI" },
      focus: { type: "string", description: "What to focus on" },
      detail: { type: "string", description: "quick | detailed" }
    },
    run: async (config, args) => {
      const r = await analyzeImage(config, String(args.source), {
        focus: args.focus ? String(args.focus) : undefined,
        detail: (args.detail as "quick" | "detailed") ?? "detailed"
      });
      return { text: r.analysis, media: [] };
    }
  },
  {
    name: "eyes_compare",
    description: "Compare two images",
    inputSchema: {
      image1: { type: "string", required: true },
      image2: { type: "string", required: true },
      focus: { type: "string", description: "differences | similarities | layout | content" }
    },
    run: async (config, args) => {
      const r = await compareImages(
        config,
        String(args.image1),
        String(args.image2),
        (args.focus as "differences") ?? "differences"
      );
      return { text: r.analysis, media: [] };
    }
  },
  {
    name: "eyes_read_document",
    description: "Extract text/tables from a document",
    inputSchema: {
      document: { type: "string", required: true },
      pages: { type: "string" },
      extract: { type: "string", description: "text | tables | both" }
    },
    run: async (config, args) => {
      const r = await readDocument(config, String(args.document), {
        pages: args.pages ? String(args.pages) : undefined,
        extract: (args.extract as "text" | "tables" | "both") ?? "both"
      });
      return { text: r.text, media: [] };
    }
  },
  {
    name: "eyes_summarize_document",
    description: "Summarize a document",
    inputSchema: {
      document: { type: "string", required: true },
      length: { type: "string", description: "brief | medium | detailed" },
      focus: { type: "string" }
    },
    run: async (config, args) => {
      const r = await summarizeDocument(config, String(args.document), {
        length: (args.length as "brief" | "medium" | "detailed") ?? "medium",
        focus: args.focus ? String(args.focus) : undefined
      });
      return { text: r.summary, media: [] };
    }
  },
  {
    name: "hands_gen_image",
    description: "Generate an image from text",
    inputSchema: {
      prompt: { type: "string", required: true },
      style: { type: "string" },
      aspect: { type: "string" },
      model: { type: "string" }
    },
    run: async (config, args) => {
      const r = await generateImage(config, {
        prompt: String(args.prompt),
        style: args.style as "photorealistic" | undefined,
        aspectRatio: args.aspect ? String(args.aspect) : undefined,
        model: args.model ? String(args.model) : undefined,
        negativePrompt: args.negative_prompt ? String(args.negative_prompt) : undefined,
        seed: args.seed ? Number(args.seed) : undefined
      });
      return { text: r.textResponse ?? "", media: imageMedia(r.imageData, r.mimeType) };
    }
  },
  {
    name: "hands_edit_image",
    description: "Edit an image via AI",
    inputSchema: {
      input: { type: "string", required: true },
      prompt: { type: "string", required: true }
    },
    run: async (config, args) => {
      const img = await loadMedia(String(args.input), { fetchTimeout: config.server.fetchTimeout });
      const r = await editImageWithGemini(
        config,
        { mimeType: img.mimeType, data: img.data },
        String(args.prompt)
      );
      return { text: r.textResponse ?? "", media: imageMedia(r.imageData, r.mimeType) };
    }
  },
  {
    name: "hands_crop_image",
    description: "Crop an image locally (Jimp)",
    inputSchema: {
      input: { type: "string", required: true },
      mode: { type: "string" },
      x: { type: "number" },
      y: { type: "number" },
      width: { type: "number" },
      height: { type: "number" }
    },
    run: async (_config, args) => {
      const r = await cropImage({
        inputImage: String(args.input),
        mode: args.mode as "manual" | undefined,
        x: args.x ? Number(args.x) : undefined,
        y: args.y ? Number(args.y) : undefined,
        width: args.width ? Number(args.width) : undefined,
        height: args.height ? Number(args.height) : undefined
      });
      return { text: "", media: imageMedia(r.base64, r.mimeType) };
    }
  },
  {
    name: "hands_resize_image",
    description: "Resize an image locally (Jimp)",
    inputSchema: {
      input: { type: "string", required: true },
      width: { type: "number" },
      height: { type: "number" },
      scale: { type: "number" }
    },
    run: async (_config, args) => {
      const r = await resizeImage({
        inputImage: String(args.input),
        width: args.width ? Number(args.width) : undefined,
        height: args.height ? Number(args.height) : undefined,
        scale: args.scale ? Number(args.scale) : undefined
      });
      return { text: "", media: imageMedia(r.base64, r.mimeType) };
    }
  },
  {
    name: "hands_rotate_image",
    description: "Rotate an image locally (Jimp)",
    inputSchema: {
      input: { type: "string", required: true },
      angle: { type: "number", required: true }
    },
    run: async (_config, args) => {
      const r = await rotateImage({ inputImage: String(args.input), angle: Number(args.angle) });
      return { text: "", media: imageMedia(r.base64, r.mimeType) };
    }
  },
  {
    name: "hands_mask_image",
    description: "Apply an alpha mask locally (Jimp)",
    inputSchema: {
      input: { type: "string", required: true },
      mask: { type: "string", required: true }
    },
    run: async (_config, args) => {
      const r = await maskImage({
        inputImage: String(args.input),
        maskImage: String(args.mask)
      });
      return { text: "", media: imageMedia(r.base64, r.mimeType) };
    }
  },
  {
    name: "mouth_speak",
    description: "Text-to-speech via Gemini TTS",
    inputSchema: {
      text: { type: "string", required: true },
      voice: { type: "string" },
      language: { type: "string" }
    },
    run: async (config, args) => {
      const r = await speak(config, {
        text: String(args.text),
        voice: args.voice ? String(args.voice) : undefined,
        language: args.language ? String(args.language) : undefined,
        stylePrompt: args.style_prompt ? String(args.style_prompt) : undefined
      });
      return { text: "", media: audioMedia(r.audioBase64, r.mimeType) };
    }
  },
  {
    name: "mouth_narrate",
    description: "Long-form narration with chunking",
    inputSchema: {
      content: { type: "string", required: true },
      voice: { type: "string" },
      narration_style: { type: "string" }
    },
    run: async (config, args) => {
      const r = await narrate(config, {
        content: String(args.content),
        voice: args.voice ? String(args.voice) : undefined,
        narrationStyle: args.narration_style as "professional" | undefined
      });
      return { text: "", media: audioMedia(r.audioBase64, r.mimeType) };
    }
  },
  {
    name: "brain_think",
    description: "Sequential thinking via Gemini",
    inputSchema: {
      problem: { type: "string", required: true },
      max_thoughts: { type: "number" }
    },
    run: async (config, args) => {
      const r = await think(config, {
        problem: String(args.problem),
        maxThoughts: args.max_thoughts ? Number(args.max_thoughts) : undefined
      });
      return {
        text:
          r.thoughts
            .map((t) => `${t.step}. ${t.thought} (confidence ${(t.confidence * 100).toFixed(0)}%)`)
            .join("\n") + `\n\nConclusion: ${r.conclusion}`,
        media: []
      };
    }
  },
  {
    name: "brain_reflect",
    description: "AI reflection on a prior analysis",
    inputSchema: {
      analysis: { type: "string", required: true },
      focus_areas: { type: "array" }
    },
    run: async (config, args) => {
      const focus = Array.isArray(args.focus_areas)
        ? (args.focus_areas as string[])
        : args.focus_areas
          ? String(args.focus_areas).split(",").map((s) => s.trim())
          : undefined;
      const r = await reflect(config, {
        analysis: String(args.analysis),
        focusAreas: focus as ("assumptions" | "logic_gaps")[] | undefined
      });
      return { text: r.reflection, media: [] };
    }
  },
  {
    name: "brain_analyze_simple",
    description: "Pattern-based local analysis (no API)",
    inputSchema: {
      input: { type: "string", required: true },
      analysis_type: { type: "string" }
    },
    run: async (_config, args) => {
      const r = analyzeSimple({
        input: String(args.input),
        analysisType: args.analysis_type ? String(args.analysis_type) : undefined
      });
      return { text: r.analysis, media: [] };
    }
  },
  {
    name: "brain_patterns_info",
    description: "List reasoning patterns / frameworks",
    inputSchema: { query: { type: "string" } },
    run: async (_config, args) => {
      const r = patternsInfo(args.query ? String(args.query) : undefined);
      return {
        text:
          "# Reasoning Patterns\n\n" +
          r.patterns.map((p) => `- **${p.name}** — ${p.purpose}`).join("\n"),
        media: []
      };
    }
  },
  {
    name: "hands_gen_video",
    description: "Generate a video from text (Minimax Hailuo 2.3)",
    inputSchema: {
      prompt: { type: "string", required: true },
      duration: { type: "number", description: "seconds (default 6)" },
      resolution: { type: "string", description: "768P | 1080P" },
      first_frame_image: { type: "string", description: "image for I2V" },
      model: { type: "string" }
    },
    run: async (config, args) => {
      const r = await generateVideo(config, {
        prompt: String(args.prompt),
        duration: args.duration !== undefined ? Number(args.duration) : undefined,
        resolution: args.resolution as "768P" | "1080P" | undefined,
        firstFrameImage: args.first_frame_image ? String(args.first_frame_image) : undefined,
        model: args.model as "MiniMax-Hailuo-2.3" | undefined
      });
      return {
        text: `Video ${r.metadata.width}×${r.metadata.height}, ${r.metadata.duration}s`,
        media: videoMedia(r.videoBase64, r.mimeType)
      };
    }
  },
  {
    name: "hands_gen_music",
    description: "Generate music with vocals (Minimax Music 2.5)",
    inputSchema: {
      lyrics: { type: "string", required: true },
      prompt: { type: "string" },
      format: { type: "string", description: "mp3 | wav" }
    },
    run: async (config, args) => {
      const r = await generateMinimaxMusic(config, {
        lyrics: String(args.lyrics),
        prompt: args.prompt ? String(args.prompt) : undefined,
        audioFormat: (args.format as "mp3" | "wav") ?? "mp3"
      });
      return { text: `Music ${r.metadata.format}`, media: audioMedia(r.audioBase64, r.mimeType) };
    }
  },
  {
    name: "hands_gen_sfx",
    description: "Generate sound effects (ElevenLabs, paid plan)",
    inputSchema: {
      text: { type: "string", required: true },
      duration_seconds: { type: "number" },
      loop: { type: "boolean" }
    },
    run: async (config, args) => {
      const r = await generateElevenLabsSfx(config, {
        text: String(args.text),
        duration_seconds: args.duration_seconds ? Number(args.duration_seconds) : undefined,
        loop: !!args.loop
      });
      return { text: "SFX generated", media: audioMedia(r.audioBase64, r.mimeType) };
    }
  },
  {
    name: "hands_gen_music_el",
    description: "Generate music tracks (ElevenLabs Music, paid plan)",
    inputSchema: {
      prompt: { type: "string", required: true },
      music_length_ms: { type: "number" },
      force_instrumental: { type: "boolean" }
    },
    run: async (config, args) => {
      const r = await generateElevenLabsMusic(config, {
        prompt: String(args.prompt),
        music_length_ms: args.music_length_ms ? Number(args.music_length_ms) : undefined,
        force_instrumental: !!args.force_instrumental
      });
      return {
        text: `ElevenLabs music ${r.metadata.duration_seconds}s`,
        media: audioMedia(r.audioBase64, r.mimeType)
      };
    }
  },
  {
    name: "hands_remove_bg",
    description: "Remove background from an image (rmbg local AI)",
    inputSchema: {
      input: { type: "string", required: true },
      quality: { type: "string", description: "fast | balanced | high" },
      format: { type: "string", description: "png | jpeg" }
    },
    run: async (config, args) => {
      const r = await removeBackground(config, {
        inputImage: String(args.input),
        quality: args.quality as "fast" | "balanced" | "high" | undefined,
        outputFormat: args.format as "png" | "jpeg" | undefined,
        backgroundColor: args.background ? String(args.background) : undefined
      });
      return {
        text: `BG removed: ${r.originalDimensions.width}×${r.originalDimensions.height}, quality=${r.quality}`,
        media: imageMedia(r.base64, r.mimeType)
      };
    }
  },
  {
    name: "hands_screenshot_fullpage",
    description: "Capture a full-page screenshot (Playwright)",
    inputSchema: {
      url: { type: "string", required: true },
      format: { type: "string", description: "png | jpeg" },
      viewport_width: { type: "number" },
      viewport_height: { type: "number" }
    },
    run: async (_config, args) => {
      const r = await captureFullPage({
        url: String(args.url),
        format: args.format as "png" | "jpeg" | undefined,
        viewportWidth: args.viewport_width ? Number(args.viewport_width) : undefined,
        viewportHeight: args.viewport_height ? Number(args.viewport_height) : undefined
      });
      return {
        text: `Screenshot of ${r.url} (${r.viewport.width}×${r.viewport.height})`,
        media: imageMedia(r.base64, r.mimeType)
      };
    }
  },
  {
    name: "hands_screenshot_viewport",
    description: "Capture visible viewport of a page (Playwright)",
    inputSchema: {
      url: { type: "string", required: true },
      viewport_width: { type: "number" },
      viewport_height: { type: "number" }
    },
    run: async (_config, args) => {
      const r = await captureViewport({
        url: String(args.url),
        viewportWidth: args.viewport_width ? Number(args.viewport_width) : undefined,
        viewportHeight: args.viewport_height ? Number(args.viewport_height) : undefined
      });
      return {
        text: `Viewport of ${r.url}`,
        media: imageMedia(r.base64, r.mimeType)
      };
    }
  },
  {
    name: "hands_screenshot_element",
    description: "Capture a specific element (Playwright)",
    inputSchema: {
      url: { type: "string", required: true },
      selector: { type: "string", required: true },
      selector_type: { type: "string", description: "css | text | role" }
    },
    run: async (_config, args) => {
      const r = await captureElement({
        url: String(args.url),
        selector: String(args.selector),
        selectorType: (args.selector_type as "css" | "text" | "role") ?? "css"
      });
      return {
        text: `Element "${args.selector}" on ${r.url}`,
        media: imageMedia(r.base64, r.mimeType)
      };
    }
  },
  {
    name: "mouth_explain",
    description: "Spoken explanation of code (Gemini + TTS)",
    inputSchema: {
      code: { type: "string", required: true },
      programming_language: { type: "string" },
      level: { type: "string", description: "beginner | intermediate | advanced" }
    },
    run: async (config, args) => {
      const r = await explainCode(config, {
        code: String(args.code),
        programmingLanguage: args.programming_language
          ? String(args.programming_language)
          : undefined,
        explanationLevel: args.level as "beginner" | "intermediate" | "advanced" | undefined
      });
      return { text: r.explanation, media: audioMedia(r.audioBase64, r.mimeType) };
    }
  },
  {
    name: "mouth_customize",
    description: "Voice + style comparison (Gemini TTS)",
    inputSchema: {
      text: { type: "string", required: true },
      voice: { type: "string" },
      compare_voices: { type: "array" },
      style_variations: { type: "array" }
    },
    run: async (config, args) => {
      const arr = (v: unknown): string[] | undefined =>
        Array.isArray(v) ? (v as string[]) : undefined;
      const r = await customizeVoice(config, {
        text: String(args.text),
        voice: args.voice ? String(args.voice) : undefined,
        compareVoices: arr(args.compare_voices),
        styleVariations: arr(args.style_variations)
      });
      return {
        text: `Generated ${r.totalVariants} variants`,
        media: r.variants.map((v) => ({
          kind: "audio" as const,
          mimeType: v.mimeType,
          base64: v.audioBase64
        }))
      };
    }
  }
];

export function findTool(name: string): ToolSpec | undefined {
  return TOOL_REGISTRY.find((t) => t.name === name);
}

export function listToolNames(): string[] {
  return TOOL_REGISTRY.map((t) => t.name);
}
