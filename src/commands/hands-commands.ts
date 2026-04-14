/**
 * "hands" command group — native generation & editing.
 *
 * Native processors (v2.0):
 *   - gen-image, edit-image, inpaint, outpaint, style-transfer, compose  (Gemini)
 *   - crop, resize, rotate, mask  (Jimp, local)
 *
 * Deferred to v2.1 (error on invocation):
 *   - gen-video, img-to-video, gen-music, gen-sfx, gen-music-el
 *   - screenshot, remove-bg
 */
import type { Command } from "commander";
import { runProcessor } from "../runtime/run-processor.js";
import { extractGlobalFlags } from "../runtime/global-flags.js";
import { generateImage, editImageWithGemini } from "../processors/hands/gen-image.js";
import {
  cropImage,
  resizeImage,
  rotateImage,
  maskImage
} from "../processors/hands/jimp-ops.js";
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
import { loadMedia } from "../core/media-loader.js";

export function registerHandsCommands(program: Command): void {
  const hands = program
    .command("hands")
    .description("Generation & media: images, videos, music, SFX, screenshots, edits");

  // ----- Image generation (native) -----
  hands
    .command("gen-image <prompt>")
    .alias("image")
    .description("Generate an image from text (Gemini Imagen)")
    .option("--model <id>", "Gemini model id")
    .option("--style <style>", "photorealistic | artistic | cartoon | sketch | digital_art")
    .option("--aspect <ratio>", "Aspect ratio (e.g. 1:1, 16:9, 9:16)", "1:1")
    .option("--negative <text>", "Negative prompt")
    .option("--seed <n>", "Random seed", Number)
    .action(async (prompt: string, opts, cmd) => {
      await runProcessor({
        tool: "hands.gen-image",
        globals: extractGlobalFlags(cmd),
        run: (config) =>
          generateImage(config, {
            prompt,
            model: opts.model,
            style: opts.style,
            aspectRatio: opts.aspect,
            negativePrompt: opts.negative,
            seed: opts.seed
          }),
        toOutput: (r) => ({
          text: r.textResponse ?? "",
          media: [{ kind: "image", mimeType: r.mimeType, base64: r.imageData }]
        })
      });
    });

  // ----- Image editing (native, Gemini image API with input images) -----
  const editCmd = (
    name: string,
    alias: string | undefined,
    promptBuilder: (userPrompt: string, opts: Record<string, unknown>) => string,
    opts: Array<[string, string, string?]> = []
  ) => {
    const cmd = hands
      .command(`${name} <input>`)
      .description(`AI image editing: ${name}`)
      .requiredOption("-p, --prompt <text>", "Edit instruction");
    if (alias) cmd.alias(alias);
    for (const [flag, desc, def] of opts) {
      if (def !== undefined) cmd.option(flag, desc, def);
      else cmd.option(flag, desc);
    }
    return cmd.action(async (input: string, cmdOpts, cmdObj) => {
      await runProcessor({
        tool: `hands.${name}`,
        globals: extractGlobalFlags(cmdObj),
        run: async (config) => {
          const img = await loadMedia(input, { fetchTimeout: config.server.fetchTimeout });
          const secondary: Array<{ mimeType: string; data: string }> = [];
          if (cmdOpts.styleImage) {
            const s = await loadMedia(cmdOpts.styleImage as string, {
              fetchTimeout: config.server.fetchTimeout
            });
            secondary.push({ mimeType: s.mimeType, data: s.data });
          }
          if (Array.isArray(cmdOpts.secondary)) {
            for (const p of cmdOpts.secondary as string[]) {
              const s = await loadMedia(p, { fetchTimeout: config.server.fetchTimeout });
              secondary.push({ mimeType: s.mimeType, data: s.data });
            }
          }
          const prompt = promptBuilder(cmdOpts.prompt as string, cmdOpts);
          return editImageWithGemini(
            config,
            { mimeType: img.mimeType, data: img.data },
            prompt,
            secondary,
            cmdOpts.model as string | undefined
          );
        },
        toOutput: (r) => ({
          text: r.textResponse ?? "",
          media: [{ kind: "image", mimeType: r.mimeType, base64: r.imageData }]
        })
      });
    });
  };

  editCmd("edit-image", undefined, (p) => p, [["--model <id>", "Gemini model id"]]);
  editCmd("inpaint", undefined, (p, o) => `Modify this image: ${p}${o.maskPrompt ? `. Focus on: ${o.maskPrompt as string}` : ""}`, [
    ["--mask-prompt <text>", "Describe the area to modify"]
  ]);
  editCmd("outpaint", undefined, (p, o) => {
    const dir = (o.direction as string) || "all";
    const ratio = (o.ratio as number) ?? 0.5;
    return `Extend this image ${dir === "all" ? "in all directions" : `to the ${dir}`} by ${Math.round(ratio * 100)}%. ${p}`;
  }, [["--direction <dir>", "up | down | left | right | all", "all"], ["--ratio <n>", "Expansion ratio 0-2"]]);
  editCmd("style-transfer", undefined, (p) => `Apply the style of the second reference image to the first image. ${p}`, [
    ["--style-image <src>", "Reference style image (required)"]
  ]);
  editCmd("compose", undefined, (p, o) => {
    const layout = (o.layout as string) || "grid";
    return `Compose all provided images in a ${layout} layout. ${p}`;
  }, [["--secondary <paths...>", "Additional images (space-separated)"], ["--layout <mode>", "horizontal | vertical | grid | overlay", "grid"]]);

  // ----- Jimp local ops (native, no API) -----
  hands
    .command("crop <input>")
    .description("Crop an image (local, no API)")
    .option("--mode <mode>", "manual | center | top_left | top_right | bottom_left | bottom_right", "manual")
    .option("--x <n>", "X offset", Number)
    .option("--y <n>", "Y offset", Number)
    .option("--width <n>", "Width", Number)
    .option("--height <n>", "Height", Number)
    .option("--format <fmt>", "png | jpeg | bmp", "png")
    .option("--quality <n>", "JPEG quality (1-100)", Number, 90)
    .action(async (input: string, opts, cmd) => {
      await runProcessor({
        tool: "hands.crop",
        globals: extractGlobalFlags(cmd),
        run: async () =>
          cropImage({
            inputImage: input,
            mode: opts.mode,
            x: opts.x,
            y: opts.y,
            width: opts.width,
            height: opts.height,
            outputFormat: opts.format,
            quality: opts.quality
          }),
        toOutput: (r) => ({
          text: `Cropped from ${r.originalDimensions.width}×${r.originalDimensions.height} to ${r.finalDimensions.width}×${r.finalDimensions.height}`,
          media: [{ kind: "image", mimeType: r.mimeType, base64: r.base64 }]
        })
      });
    });

  hands
    .command("resize <input>")
    .description("Resize an image (local)")
    .option("--width <n>", "Target width", Number)
    .option("--height <n>", "Target height", Number)
    .option("--scale <n>", "Scale factor", Number)
    .option("--no-aspect", "Do not preserve aspect ratio")
    .option("--format <fmt>", "png | jpeg | bmp", "png")
    .option("--quality <n>", "JPEG quality", Number, 90)
    .action(async (input: string, opts, cmd) => {
      await runProcessor({
        tool: "hands.resize",
        globals: extractGlobalFlags(cmd),
        run: async () =>
          resizeImage({
            inputImage: input,
            width: opts.width,
            height: opts.height,
            scale: opts.scale,
            maintainAspectRatio: opts.aspect !== false,
            outputFormat: opts.format,
            quality: opts.quality
          }),
        toOutput: (r) => ({
          text: `Resized from ${r.originalDimensions.width}×${r.originalDimensions.height} to ${r.finalDimensions.width}×${r.finalDimensions.height}`,
          media: [{ kind: "image", mimeType: r.mimeType, base64: r.base64 }]
        })
      });
    });

  hands
    .command("rotate <input>")
    .description("Rotate an image (local)")
    .requiredOption("--angle <deg>", "Rotation angle in degrees", Number)
    .option("--format <fmt>", "png | jpeg | bmp", "png")
    .option("--quality <n>", "JPEG quality", Number, 90)
    .action(async (input: string, opts, cmd) => {
      await runProcessor({
        tool: "hands.rotate",
        globals: extractGlobalFlags(cmd),
        run: async () =>
          rotateImage({
            inputImage: input,
            angle: opts.angle,
            outputFormat: opts.format,
            quality: opts.quality
          }),
        toOutput: (r) => ({
          text: `Rotated by ${opts.angle}°`,
          media: [{ kind: "image", mimeType: r.mimeType, base64: r.base64 }]
        })
      });
    });

  hands
    .command("mask <input>")
    .description("Apply an alpha mask (local)")
    .requiredOption("--mask <src>", "Mask image")
    .option("--format <fmt>", "png | jpeg | bmp", "png")
    .option("--quality <n>", "JPEG quality", Number, 90)
    .action(async (input: string, opts, cmd) => {
      await runProcessor({
        tool: "hands.mask",
        globals: extractGlobalFlags(cmd),
        run: async () =>
          maskImage({
            inputImage: input,
            maskImage: opts.mask,
            outputFormat: opts.format,
            quality: opts.quality
          }),
        toOutput: (r) => ({
          text: `Mask applied (${r.finalDimensions.width}×${r.finalDimensions.height})`,
          media: [{ kind: "image", mimeType: r.mimeType, base64: r.base64 }]
        })
      });
    });

  // ----- Video generation (Minimax Hailuo) -----
  hands
    .command("gen-video <prompt>")
    .alias("video")
    .description("Generate a video from text (Minimax Hailuo 2.3; Gemini Veo in v2.2)")
    .option("--provider <p>", "minimax", "minimax")
    .option("--model <id>", "MiniMax-Hailuo-2.3 | MiniMax-Hailuo-2.3-Fast")
    .option("--duration <sec>", "Video duration in seconds", Number, 6)
    .option("--resolution <r>", "768P | 1080P", "1080P")
    .option("--image <src>", "First-frame image (for image-to-video)")
    .option("--no-optimize", "Disable prompt optimization")
    .action(async (prompt: string, opts, cmd) => {
      await runProcessor({
        tool: "hands.gen-video",
        globals: extractGlobalFlags(cmd),
        run: (config) =>
          generateVideo(config, {
            prompt,
            provider: opts.provider,
            model: opts.model,
            duration: opts.duration,
            resolution: opts.resolution,
            firstFrameImage: opts.image,
            promptOptimizer: opts.optimize !== false
          }),
        toOutput: (r) => ({
          text: `Video ${r.metadata.width}×${r.metadata.height}, ${r.metadata.duration}s, model ${r.metadata.model}`,
          media: [{ kind: "video", mimeType: r.mimeType, base64: r.videoBase64 }]
        })
      });
    });

  hands
    .command("img-to-video <image>")
    .description("Animate a still image (Minimax Hailuo I2V)")
    .option("-p, --prompt <text>", "Motion description", "")
    .option("--model <id>", "MiniMax-Hailuo-2.3 | MiniMax-Hailuo-2.3-Fast", "MiniMax-Hailuo-2.3-Fast")
    .option("--duration <sec>", "Video duration in seconds", Number, 6)
    .option("--resolution <r>", "768P | 1080P", "1080P")
    .action(async (image: string, opts, cmd) => {
      await runProcessor({
        tool: "hands.img-to-video",
        globals: extractGlobalFlags(cmd),
        run: (config) =>
          generateVideo(config, {
            prompt: opts.prompt || "animate this image",
            model: opts.model,
            duration: opts.duration,
            resolution: opts.resolution,
            firstFrameImage: image
          }),
        toOutput: (r) => ({
          text: `Video ${r.metadata.width}×${r.metadata.height}, ${r.metadata.duration}s`,
          media: [{ kind: "video", mimeType: r.mimeType, base64: r.videoBase64 }]
        })
      });
    });

  // ----- Music & SFX -----
  hands
    .command("gen-music <lyrics>")
    .description("Generate music with vocals (Minimax Music 2.5). '-' or @file supported.")
    .option("-p, --prompt <text>", "Style / genre prompt")
    .option("--format <fmt>", "mp3 | wav", "mp3")
    .option("--sample-rate <n>", "Sample rate", Number, 44100)
    .option("--bitrate <n>", "Bitrate (bps)", Number, 256000)
    .action(async (lyrics: string, opts, cmd) => {
      await runProcessor({
        tool: "hands.gen-music",
        globals: extractGlobalFlags(cmd),
        run: (config) =>
          generateMinimaxMusic(config, {
            lyrics: materializeText(lyrics),
            prompt: opts.prompt,
            audioFormat: opts.format,
            sampleRate: opts.sampleRate,
            bitrate: opts.bitrate
          }),
        toOutput: (r) => ({
          text: `Music: model ${r.metadata.model}, format ${r.metadata.format}${r.metadata.duration_seconds ? `, ${r.metadata.duration_seconds}s` : ""}`,
          media: [{ kind: "audio", mimeType: r.mimeType, base64: r.audioBase64 }]
        })
      });
    });

  hands
    .command("gen-sfx <description>")
    .description("Generate sound effects (ElevenLabs, paid plan required)")
    .option("--duration <sec>", "Duration in seconds", Number)
    .option("--loop", "Make the SFX loopable", false)
    .option("--prompt-influence <n>", "Prompt influence 0-1", Number)
    .action(async (description: string, opts, cmd) => {
      await runProcessor({
        tool: "hands.gen-sfx",
        globals: extractGlobalFlags(cmd),
        run: (config) =>
          generateElevenLabsSfx(config, {
            text: description,
            duration_seconds: opts.duration,
            loop: opts.loop,
            prompt_influence: opts.promptInfluence
          }),
        toOutput: (r) => ({
          text: `SFX: model ${r.metadata.model}${r.metadata.duration_seconds ? `, ${r.metadata.duration_seconds}s` : ""}`,
          media: [{ kind: "audio", mimeType: r.mimeType, base64: r.audioBase64 }]
        })
      });
    });

  hands
    .command("gen-music-el <prompt>")
    .description("Generate music tracks (ElevenLabs Music, 3s-10min, paid plan)")
    .option("--length <ms>", "Duration in ms (3000-600000)", Number, 30000)
    .option("--instrumental", "Force instrumental", false)
    .action(async (prompt: string, opts, cmd) => {
      await runProcessor({
        tool: "hands.gen-music-el",
        globals: extractGlobalFlags(cmd),
        run: (config) =>
          generateElevenLabsMusic(config, {
            prompt,
            music_length_ms: opts.length,
            force_instrumental: opts.instrumental
          }),
        toOutput: (r) => ({
          text: `Music: ${r.metadata.duration_seconds}s, model ${r.metadata.model}`,
          media: [{ kind: "audio", mimeType: r.mimeType, base64: r.audioBase64 }]
        })
      });
    });

  // ----- Background removal (optional: rmbg + onnxruntime) -----
  hands
    .command("remove-bg <input>")
    .description("Remove background from an image (rmbg local AI)")
    .option("--quality <level>", "fast | balanced | high", "balanced")
    .option("--format <fmt>", "png | jpeg", "png")
    .option("--background <color>", "Background color for JPEG (e.g. #ffffff)")
    .option("--jpeg-quality <n>", "JPEG quality 1-100", Number, 85)
    .action(async (input: string, opts, cmd) => {
      await runProcessor({
        tool: "hands.remove-bg",
        globals: extractGlobalFlags(cmd),
        run: (config) =>
          removeBackground(config, {
            inputImage: input,
            quality: opts.quality,
            outputFormat: opts.format,
            backgroundColor: opts.background,
            jpegQuality: opts.jpegQuality
          }),
        toOutput: (r) => ({
          text: `BG removed from ${r.originalDimensions.width}×${r.originalDimensions.height}, quality=${r.quality}`,
          media: [{ kind: "image", mimeType: r.mimeType, base64: r.base64 }]
        })
      });
    });

  // ----- Playwright screenshots (optional) -----
  hands
    .command("screenshot <url>")
    .description("Capture a webpage screenshot (requires optional `playwright`)")
    .option("-m, --mode <mode>", "fullpage | viewport | element", "fullpage")
    .option("-s, --selector <q>", "Element selector (for --mode element)")
    .option("--selector-type <t>", "css | text | role", "css")
    .option("--format <fmt>", "png | jpeg", "png")
    .option("--quality <n>", "JPEG quality", Number)
    .option("--viewport-width <n>", "Viewport width", Number)
    .option("--viewport-height <n>", "Viewport height", Number)
    .option("--wait-until <m>", "load | domcontentloaded | networkidle", "load")
    .action(async (url: string, opts, cmd) => {
      await runProcessor({
        tool: `hands.screenshot.${opts.mode}`,
        globals: extractGlobalFlags(cmd),
        run: async () => {
          const base = {
            url,
            format: opts.format,
            quality: opts.quality,
            viewportWidth: opts.viewportWidth,
            viewportHeight: opts.viewportHeight,
            waitUntil: opts.waitUntil
          };
          if (opts.mode === "viewport") return captureViewport(base);
          if (opts.mode === "element") {
            if (!opts.selector) throw new Error("--selector is required for --mode element");
            return captureElement({
              ...base,
              selector: opts.selector,
              selectorType: opts.selectorType
            });
          }
          return captureFullPage(base);
        },
        toOutput: (r) => ({
          text: `Screenshot of ${r.url} (${r.viewport.width}×${r.viewport.height})`,
          media: [{ kind: "image", mimeType: r.mimeType, base64: r.base64 }]
        })
      });
    });
}

function materializeText(input: string): string {
  if (input === "-") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require("node:fs").readFileSync(0, "utf8") as string;
    } catch {
      return "";
    }
  }
  if (input.startsWith("@")) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs") as typeof import("node:fs");
    const path = input.slice(1);
    if (fs.existsSync(path)) return fs.readFileSync(path, "utf8");
  }
  return input;
}
