/**
 * "eyes" command group — vision & document analysis.
 * Maps to MCP tools: eyes_analyze, eyes_compare, eyes_read_document, eyes_summarize_document
 */
import type { Command } from "commander";
import { runTool } from "../runtime/run-tool.js";
import { extractGlobalFlags } from "../runtime/global-flags.js";

export function registerEyesCommands(program: Command): void {
  const eyes = program
    .command("eyes")
    .description("Vision & document analysis (images, videos, gifs, PDFs, docs)");

  eyes
    .command("analyze <source>")
    .description("Analyze an image, video, or GIF (file path, URL, data URI, or '-' for stdin)")
    .option("-f, --focus <text>", "What to focus on in the analysis")
    .option("-d, --detail <level>", "Analysis depth: quick | detailed", "detailed")
    .action(async (source: string, opts, cmd) => {
      await runTool({
        tool: "eyes_analyze",
        args: { source, focus: opts.focus, detail: opts.detail },
        sourceFields: ["source"],
        globals: extractGlobalFlags(cmd)
      });
    });

  eyes
    .command("compare <image1> <image2>")
    .description("Compare two images")
    .option("-f, --focus <mode>", "differences | similarities | layout | content", "differences")
    .action(async (image1: string, image2: string, opts, cmd) => {
      await runTool({
        tool: "eyes_compare",
        args: { image1, image2, focus: opts.focus },
        sourceFields: ["image1", "image2"],
        globals: extractGlobalFlags(cmd)
      });
    });

  eyes
    .command("read <document>")
    .alias("read-document")
    .description("Extract text/tables from a document (PDF, DOCX, XLSX, PPTX, …)")
    .option("-p, --pages <range>", "Page range (e.g. '1-5' or 'all')", "all")
    .option("-x, --extract <mode>", "text | tables | both", "both")
    .action(async (document: string, opts, cmd) => {
      await runTool({
        tool: "eyes_read_document",
        args: { document, pages: opts.pages, extract: opts.extract },
        sourceFields: ["document"],
        globals: extractGlobalFlags(cmd)
      });
    });

  eyes
    .command("summarize <document>")
    .alias("summarise")
    .description("Summarize a document")
    .option("-l, --length <size>", "brief | medium | detailed", "medium")
    .option("-f, --focus <text>", "Specific topics to focus on")
    .action(async (document: string, opts, cmd) => {
      await runTool({
        tool: "eyes_summarize_document",
        args: { document, length: opts.length, focus: opts.focus },
        sourceFields: ["document"],
        globals: extractGlobalFlags(cmd)
      });
    });
}
