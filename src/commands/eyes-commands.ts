/**
 * "eyes" command group — vision & document analysis.
 * Native execution via processors in `src/processors/eyes/`.
 */
import type { Command } from "commander";
import { runProcessor } from "../runtime/run-processor.js";
import { extractGlobalFlags } from "../runtime/global-flags.js";
import { analyzeImage, compareImages } from "../processors/eyes/analyze-image.js";
import { readDocument, summarizeDocument } from "../processors/eyes/read-document.js";

export function registerEyesCommands(program: Command): void {
  const eyes = program
    .command("eyes")
    .description("Vision & document analysis (images, videos, gifs, PDFs, docs)");

  eyes
    .command("analyze <source>")
    .description("Analyze an image (video/gif support via PDF/Gemini multimodal coming in v2.1)")
    .option("-f, --focus <text>", "What to focus on in the analysis")
    .option("-d, --detail <level>", "Analysis depth: quick | detailed", "detailed")
    .action(async (source: string, opts, cmd) => {
      await runProcessor({
        tool: "eyes.analyze",
        globals: extractGlobalFlags(cmd),
        run: (config) => analyzeImage(config, source, { focus: opts.focus, detail: opts.detail }),
        toOutput: (r) => ({ text: r.analysis })
      });
    });

  eyes
    .command("compare <image1> <image2>")
    .description("Compare two images")
    .option("-f, --focus <mode>", "differences | similarities | layout | content", "differences")
    .action(async (image1: string, image2: string, opts, cmd) => {
      await runProcessor({
        tool: "eyes.compare",
        globals: extractGlobalFlags(cmd),
        run: (config) => compareImages(config, image1, image2, opts.focus),
        toOutput: (r) => ({ text: r.analysis })
      });
    });

  eyes
    .command("read <document>")
    .alias("read-document")
    .description("Extract text/tables from a document (PDF, txt, md, csv, json, html, xml)")
    .option("-p, --pages <range>", "Page range (e.g. '1-5' or 'all')", "all")
    .option("-x, --extract <mode>", "text | tables | both", "both")
    .action(async (document: string, opts, cmd) => {
      await runProcessor({
        tool: "eyes.read",
        globals: extractGlobalFlags(cmd),
        run: (config) => readDocument(config, document, { pages: opts.pages, extract: opts.extract }),
        toOutput: (r) => ({
          text: [
            r.text,
            r.tables.length > 0 ? `\n## Tables\n${JSON.stringify(r.tables, null, 2)}` : ""
          ]
            .filter(Boolean)
            .join("\n")
        })
      });
    });

  eyes
    .command("summarize <document>")
    .alias("summarise")
    .description("Summarize a document")
    .option("-l, --length <size>", "brief | medium | detailed", "medium")
    .option("-f, --focus <text>", "Specific topics to focus on")
    .action(async (document: string, opts, cmd) => {
      await runProcessor({
        tool: "eyes.summarize",
        globals: extractGlobalFlags(cmd),
        run: (config) =>
          summarizeDocument(config, document, { length: opts.length, focus: opts.focus }),
        toOutput: (r) => ({ text: r.summary })
      });
    });
}
