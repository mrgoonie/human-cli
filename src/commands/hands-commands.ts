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

  // ----- Deferred to v2.1 -----
  for (const { name, hint } of [
    { name: "gen-video", hint: "Veo video generation" },
    { name: "img-to-video", hint: "Image-to-video animation" },
    { name: "gen-music", hint: "Minimax music generation" },
    { name: "gen-sfx", hint: "ElevenLabs sound effects" },
    { name: "gen-music-el", hint: "ElevenLabs music" },
    { name: "remove-bg", hint: "AI background removal (rmbg + onnxruntime)" },
    { name: "screenshot", hint: "Playwright web screenshots" }
  ]) {
    hands
      .command(`${name} [args...]`)
      .description(`${hint} — native port deferred to v2.1`)
      .allowUnknownOption()
      .action(() => {
        process.stderr.write(
          `✗ 'human hands ${name}' is not yet native in v2.0.\n` +
            `   Deferred to v2.1 (${hint}).\n` +
            `   Workaround: install @goonnguyen/human-mcp and run 'human call <mcp_tool>' directly.\n`
        );
        process.exit(4);
      });
  }
}
