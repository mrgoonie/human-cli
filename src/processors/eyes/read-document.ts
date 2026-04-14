/**
 * Document reader — supports:
 *   - Text-based (md, txt, json, csv, xml, html): read directly
 *   - PDF: sent as inlineData to Gemini (native multimodal PDF support)
 *   - DOCX/XLSX/PPTX/RTF/ODT: deferred to v2.1 (requires optional parser libs)
 *
 * Ported & simplified from human-mcp/src/tools/eyes/processors/*.ts factory.
 */
import { readFile, stat } from "node:fs/promises";
import { isAbsolute, resolve, extname } from "node:path";
import { GeminiClient } from "../../core/providers/gemini-client.js";
import { ProcessingError, MissingDependencyError } from "../../core/errors.js";
import { loadMedia } from "../../core/media-loader.js";
import { logger } from "../../core/logger.js";
import type { Config } from "../../core/config-schema.js";

export interface ReadDocumentOptions {
  pages?: string; // "all" | "1-5" | "2,4,6"
  extract?: "text" | "tables" | "both";
}

export interface ReadDocumentResult {
  text: string;
  tables: unknown[];
  metadata: {
    format: string;
    processing_time_ms: number;
    size_bytes: number;
  };
}

const NATIVE_TEXT_FORMATS = new Set(["txt", "md", "csv", "json", "xml", "html", "htm"]);
const PDF_FORMAT = "pdf";
const DEFERRED_FORMATS = new Set(["docx", "xlsx", "pptx", "rtf", "odt"]);

export async function readDocument(
  config: Config,
  source: string,
  options: ReadDocumentOptions = {}
): Promise<ReadDocumentResult> {
  const startTime = Date.now();
  const extract = options.extract ?? "both";
  const format = await detectFormat(source);

  logger.debug(`Reading document: ${source} (format=${format})`);

  if (NATIVE_TEXT_FORMATS.has(format)) {
    return readTextDocument(source, format, extract, startTime);
  }
  if (format === PDF_FORMAT) {
    return readPdfViaGemini(config, source, options, startTime);
  }
  if (DEFERRED_FORMATS.has(format)) {
    throw new MissingDependencyError(
      format === "docx" ? "mammoth" : format === "xlsx" ? "xlsx" : "pptx-automizer",
      `Reading ${format.toUpperCase()} files requires an optional parser. Install it, or use '.txt'/'.md'/'.pdf' instead.`
    );
  }
  throw new ProcessingError(`Unsupported document format: ${format}`);
}

export interface SummarizeDocumentOptions {
  length?: "brief" | "medium" | "detailed";
  focus?: string;
}

export async function summarizeDocument(
  config: Config,
  source: string,
  options: SummarizeDocumentOptions = {}
): Promise<{ summary: string; metadata: { format: string; processing_time_ms: number } }> {
  const startTime = Date.now();
  const format = await detectFormat(source);
  const length = options.length ?? "medium";
  const focus = options.focus;

  const doc = await readDocument(config, source, { extract: "both" });
  const client = new GeminiClient(config);
  const model = client.getModel("detailed");

  const lengthMap = {
    brief: "a brief 2-3 sentence summary",
    medium: "a comprehensive 1-2 paragraph summary",
    detailed: "a detailed multi-paragraph summary"
  };
  const focusText = focus ? `Focus specifically on: ${focus}.` : "";
  const prompt = `Create ${lengthMap[length]} of this document content. ${focusText}\n\nDocument content:\n${doc.text.slice(0, 12000)}\n\nProvide:\n• **Summary**: main points and conclusions\n• **Key Insights**: important findings\n• **Recommendations**: suggested actions (if applicable)`;

  const summary = await client.analyzeContent(model, prompt, []);
  return {
    summary,
    metadata: { format, processing_time_ms: Date.now() - startTime }
  };
}

async function readTextDocument(
  source: string,
  format: string,
  extract: "text" | "tables" | "both",
  startTime: number
): Promise<ReadDocumentResult> {
  const buffer = await loadRawBuffer(source);
  const text = buffer.toString("utf8");

  const tables: unknown[] = [];
  if (format === "csv" && (extract === "tables" || extract === "both")) {
    tables.push(parseCsvAsTable(text));
  }

  return {
    text,
    tables,
    metadata: { format, processing_time_ms: Date.now() - startTime, size_bytes: buffer.length }
  };
}

async function readPdfViaGemini(
  config: Config,
  source: string,
  options: ReadDocumentOptions,
  startTime: number
): Promise<ReadDocumentResult> {
  const client = new GeminiClient(config);
  const model = client.getModel("detailed");
  const { data, mimeType } = await loadMedia(source, { fetchTimeout: config.server.fetchTimeout });

  const extract = options.extract ?? "both";
  const pages = options.pages && options.pages !== "all" ? ` from pages ${options.pages}` : "";
  const prompt = `Extract ${extract === "text" ? "all text" : extract === "tables" ? "all tables" : "text content and tables"}${pages} from this PDF document. Return the full raw text in the order it appears, preserving paragraphs. For tables, format as markdown tables.`;

  const text = await client.analyzeContent(model, prompt, [{ mimeType, data }]);
  const buffer = Buffer.from(data, "base64");

  return {
    text,
    tables: [],
    metadata: { format: "pdf", processing_time_ms: Date.now() - startTime, size_bytes: buffer.length }
  };
}

async function loadRawBuffer(source: string): Promise<Buffer> {
  if (source.startsWith("data:")) {
    const [, data] = source.split(",");
    return Buffer.from(data ?? "", "base64");
  }
  if (source.startsWith("http://") || source.startsWith("https://")) {
    const res = await fetch(source);
    if (!res.ok) throw new ProcessingError(`Failed to fetch ${source}: ${res.statusText}`);
    return Buffer.from(await res.arrayBuffer());
  }
  const full = isAbsolute(source) ? source : resolve(process.cwd(), source);
  const stats = await stat(full);
  if (!stats.isFile()) throw new ProcessingError(`Not a file: ${source}`);
  return readFile(full);
}

async function detectFormat(source: string): Promise<string> {
  if (source.startsWith("data:")) {
    const match = source.match(/data:([^;]+)/);
    if (match?.[1]) return mimeToFormat(match[1]);
  }
  const ext = extname(source).toLowerCase().replace(/^\./, "");
  return ext || "txt";
}

function mimeToFormat(mime: string): string {
  const m: Record<string, string> = {
    "application/pdf": "pdf",
    "text/plain": "txt",
    "text/markdown": "md",
    "text/csv": "csv",
    "application/json": "json",
    "application/xml": "xml",
    "text/html": "html"
  };
  return m[mime] ?? "txt";
}

function parseCsvAsTable(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const splitCsv = (line: string) => line.split(",").map((c) => c.trim());
  const headers = splitCsv(lines[0]!);
  const rows = lines.slice(1).map(splitCsv);
  return { headers, rows };
}
