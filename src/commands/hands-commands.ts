/**
 * "hands" command group — generation, editing, screenshots, media.
 */
import type { Command } from "commander";
import { runTool } from "../runtime/run-tool.js";
import { extractGlobalFlags } from "../runtime/global-flags.js";

export function registerHandsCommands(program: Command): void {
  const hands = program
    .command("hands")
    .description("Generation & media: images, videos, music, SFX, screenshots, edits");

  // ----- Image generation -----
  hands
    .command("gen-image <prompt>")
    .alias("image")
    .description("Generate an image from text (Gemini Imagen)")
    .option("--model <id>", "Gemini model id")
    .option("--style <style>", "photorealistic | artistic | cartoon | sketch | digital_art")
    .option("--aspect <ratio>", "Aspect ratio (e.g. 1:1, 16:9, 9:16)", "1:1")
    .option("--negative <text>", "Negative prompt")
    .option("--seed <n>", "Random seed", Number)
    .option("--format <fmt>", "base64 | url", "base64")
    .action(async (prompt: string, opts, cmd) => {
      await runTool({
        tool: "gemini_gen_image",
        args: {
          prompt,
          model: opts.model,
          style: opts.style,
          aspect_ratio: opts.aspect,
          negative_prompt: opts.negative,
          seed: opts.seed,
          output_format: opts.format
        },
        globals: extractGlobalFlags(cmd)
      });
    });

  hands
    .command("edit-image <input>")
    .description("Edit an image with AI")
    .requiredOption("-p, --prompt <text>", "Edit instruction")
    .option("--operation <op>", "inpaint | outpaint | style_transfer | compose | refine", "refine")
    .option("--strength <n>", "Style strength 0-1", Number)
    .action(async (input: string, opts, cmd) => {
      await runTool({
        tool: "gemini_edit_image",
        args: {
          input_image: input,
          prompt: opts.prompt,
          operation: opts.operation,
          style_strength: opts.strength
        },
        sourceFields: ["input_image"],
        globals: extractGlobalFlags(cmd)
      });
    });

  hands
    .command("inpaint <input>")
    .description("Add/modify specific areas of an image")
    .requiredOption("-p, --prompt <text>", "What to add/modify")
    .option("--mask-prompt <text>", "Describe the area to mask")
    .action(async (input: string, opts, cmd) => {
      await runTool({
        tool: "gemini_inpaint_image",
        args: { input_image: input, prompt: opts.prompt, mask_prompt: opts.maskPrompt },
        sourceFields: ["input_image"],
        globals: extractGlobalFlags(cmd)
      });
    });

  hands
    .command("outpaint <input>")
    .description("Expand image borders")
    .requiredOption("--direction <dir>", "up | down | left | right | all")
    .option("--ratio <n>", "Expansion ratio 0-2", Number, 0.5)
    .option("-p, --prompt <text>", "Expansion guidance")
    .action(async (input: string, opts, cmd) => {
      await runTool({
        tool: "gemini_outpaint_image",
        args: {
          input_image: input,
          expand_direction: opts.direction,
          expansion_ratio: opts.ratio,
          prompt: opts.prompt
        },
        sourceFields: ["input_image"],
        globals: extractGlobalFlags(cmd)
      });
    });

  hands
    .command("style-transfer <input>")
    .description("Apply a style from a reference image")
    .requiredOption("--style-image <src>", "Reference style image")
    .option("--strength <n>", "Style strength 0-1", Number, 0.7)
    .action(async (input: string, opts, cmd) => {
      await runTool({
        tool: "gemini_style_transfer_image",
        args: {
          input_image: input,
          style_image: opts.styleImage,
          style_strength: opts.strength
        },
        sourceFields: ["input_image", "style_image"],
        globals: extractGlobalFlags(cmd)
      });
    });

  hands
    .command("compose <baseImage> <secondary...>")
    .description("Compose multiple images together")
    .option("--layout <mode>", "horizontal | vertical | grid | overlay", "grid")
    .option("-p, --prompt <text>", "Composition guidance")
    .action(async (baseImage: string, secondary: string[], opts, cmd) => {
      await runTool({
        tool: "gemini_compose_images",
        args: {
          input_image: baseImage,
          secondary_images: secondary,
          composition_layout: opts.layout,
          prompt: opts.prompt
        },
        sourceFields: ["input_image"],
        globals: extractGlobalFlags(cmd)
      });
    });

  // ----- Video generation -----
  hands
    .command("gen-video <prompt>")
    .alias("video")
    .description("Generate a video from text (Gemini Veo or Minimax)")
    .option("--provider <name>", "gemini | minimax")
    .option("--duration <len>", "4s | 8s | 12s", "4s")
    .option("--aspect <ratio>", "Aspect ratio", "16:9")
    .option("--fps <n>", "Frames per second", Number, 24)
    .option("--style <style>", "realistic | cinematic | artistic | cartoon | animation")
    .option("--image <src>", "Starting frame image")
    .option("--format <fmt>", "mp4 | webm", "mp4")
    .action(async (prompt: string, opts, cmd) => {
      await runTool({
        tool: "gemini_gen_video",
        args: {
          prompt,
          provider: opts.provider,
          duration: opts.duration,
          aspect_ratio: opts.aspect,
          fps: opts.fps,
          style: opts.style,
          image_input: opts.image,
          output_format: opts.format
        },
        sourceFields: opts.image ? ["image_input"] : [],
        globals: extractGlobalFlags(cmd)
      });
    });

  hands
    .command("img-to-video <image>")
    .description("Animate a still image")
    .option("-p, --prompt <text>", "Motion description")
    .option("--duration <len>", "4s | 8s | 12s", "4s")
    .action(async (image: string, opts, cmd) => {
      await runTool({
        tool: "gemini_image_to_video",
        args: { image_input: image, prompt: opts.prompt, duration: opts.duration },
        sourceFields: ["image_input"],
        globals: extractGlobalFlags(cmd)
      });
    });

  // ----- Music & SFX -----
  hands
    .command("gen-music <style>")
    .description("Generate music with vocals (Minimax)")
    .option("-l, --lyrics <text>", "Lyrics for the song")
    .option("--sample-rate <n>", "Sample rate", Number, 44100)
    .option("--bitrate <n>", "Bitrate kbps", Number, 192)
    .action(async (style: string, opts, cmd) => {
      await runTool({
        tool: "minimax_gen_music",
        args: {
          style,
          lyrics: opts.lyrics,
          sample_rate: opts.sampleRate,
          bitrate: opts.bitrate
        },
        globals: extractGlobalFlags(cmd)
      });
    });

  hands
    .command("gen-sfx <description>")
    .description("Generate sound effects (ElevenLabs)")
    .option("--duration <sec>", "Duration in seconds", Number)
    .option("--loop", "Loopable output", false)
    .option("--prompt-influence <n>", "Prompt influence 0-1", Number)
    .action(async (description: string, opts, cmd) => {
      await runTool({
        tool: "elevenlabs_gen_sfx",
        args: {
          text: description,
          duration_seconds: opts.duration,
          loop: opts.loop,
          prompt_influence: opts.promptInfluence
        },
        globals: extractGlobalFlags(cmd)
      });
    });

  hands
    .command("gen-music-el <prompt>")
    .description("Generate music with ElevenLabs")
    .option("--length <ms>", "Music length in ms (3000-600000)", Number)
    .option("--instrumental", "Force instrumental", false)
    .action(async (prompt: string, opts, cmd) => {
      await runTool({
        tool: "elevenlabs_gen_music",
        args: {
          prompt,
          music_length_ms: opts.length,
          force_instrumental: opts.instrumental
        },
        globals: extractGlobalFlags(cmd)
      });
    });

  // ----- Jimp processing -----
  hands
    .command("crop <input>")
    .description("Crop an image")
    .option("--mode <mode>", "manual | center | aspect", "manual")
    .option("--x <n>", "X offset", Number)
    .option("--y <n>", "Y offset", Number)
    .option("--width <n>", "Width", Number)
    .option("--height <n>", "Height", Number)
    .option("--aspect <ratio>", "Aspect ratio (for --mode aspect)")
    .action(async (input: string, opts, cmd) => {
      await runTool({
        tool: "jimp_crop_image",
        args: {
          input_image: input,
          mode: opts.mode,
          x: opts.x,
          y: opts.y,
          width: opts.width,
          height: opts.height,
          aspect_ratio: opts.aspect
        },
        sourceFields: ["input_image"],
        globals: extractGlobalFlags(cmd)
      });
    });

  hands
    .command("resize <input>")
    .description("Resize an image")
    .option("--width <n>", "Target width", Number)
    .option("--height <n>", "Target height", Number)
    .option("--scale <n>", "Scale factor", Number)
    .option("--no-aspect", "Do not preserve aspect ratio")
    .action(async (input: string, opts, cmd) => {
      await runTool({
        tool: "jimp_resize_image",
        args: {
          input_image: input,
          width: opts.width,
          height: opts.height,
          scale: opts.scale,
          maintain_aspect_ratio: opts.aspect !== false
        },
        sourceFields: ["input_image"],
        globals: extractGlobalFlags(cmd)
      });
    });

  hands
    .command("rotate <input>")
    .description("Rotate an image")
    .requiredOption("--angle <deg>", "Rotation angle in degrees", Number)
    .option("--background <color>", "Background color (hex)")
    .action(async (input: string, opts, cmd) => {
      await runTool({
        tool: "jimp_rotate_image",
        args: { input_image: input, angle: opts.angle, background_color: opts.background },
        sourceFields: ["input_image"],
        globals: extractGlobalFlags(cmd)
      });
    });

  hands
    .command("mask <input>")
    .description("Apply an alpha mask")
    .requiredOption("--mask <src>", "Mask image")
    .action(async (input: string, opts, cmd) => {
      await runTool({
        tool: "jimp_mask_image",
        args: { input_image: input, mask_image: opts.mask },
        sourceFields: ["input_image", "mask_image"],
        globals: extractGlobalFlags(cmd)
      });
    });

  // ----- Background removal -----
  hands
    .command("remove-bg <input>")
    .description("Remove background from an image")
    .option("--quality <level>", "fast | balanced | high", "balanced")
    .action(async (input: string, opts, cmd) => {
      await runTool({
        tool: "rmbg_remove_background",
        args: { input_image: input, quality: opts.quality },
        sourceFields: ["input_image"],
        globals: extractGlobalFlags(cmd)
      });
    });

  // ----- Playwright screenshots -----
  hands
    .command("screenshot <url>")
    .description("Capture a webpage screenshot")
    .option("-m, --mode <mode>", "fullpage | viewport | element", "fullpage")
    .option("-s, --selector <q>", "Element selector (for --mode element)")
    .option("--selector-type <t>", "css | text | role", "css")
    .option("--format <fmt>", "png | jpeg", "png")
    .option("--viewport-width <n>", "Viewport width", Number)
    .option("--viewport-height <n>", "Viewport height", Number)
    .action(async (url: string, opts, cmd) => {
      const toolMap: Record<string, string> = {
        fullpage: "playwright_screenshot_fullpage",
        viewport: "playwright_screenshot_viewport",
        element: "playwright_screenshot_element"
      };
      const tool = toolMap[opts.mode] ?? toolMap.fullpage!;
      const args: Record<string, unknown> = {
        url,
        format: opts.format,
        viewport_width: opts.viewportWidth,
        viewport_height: opts.viewportHeight
      };
      if (opts.mode === "element") {
        args.selector = opts.selector;
        args.selector_type = opts.selectorType;
      }
      await runTool({ tool, args, globals: extractGlobalFlags(cmd) });
    });
}
