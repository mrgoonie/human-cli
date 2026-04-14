/**
 * Playwright web screenshots — ported from human-mcp.
 * `playwright` is an optional dep; lazy-loaded at invocation with a friendly
 * error when missing so the base CLI install stays lean.
 */
import { MissingDependencyError, ProcessingError } from "../../core/errors.js";
import { logger } from "../../core/logger.js";

export interface ScreenshotOptions {
  url: string;
  format?: "png" | "jpeg";
  quality?: number;
  viewportWidth?: number;
  viewportHeight?: number;
  timeout?: number;
  waitUntil?: "load" | "domcontentloaded" | "networkidle";
}

export interface ElementScreenshotOptions extends ScreenshotOptions {
  selector: string;
  selectorType?: "css" | "text" | "role";
  waitForSelector?: boolean;
}

export interface ScreenshotResult {
  base64: string;
  mimeType: string;
  url: string;
  viewport: { width: number; height: number };
  processing_time_ms: number;
  dimensions?: { width: number; height: number; x?: number; y?: number };
}

type Mode = "fullpage" | "viewport" | "element";

/**
 * Minimal structural types so TypeScript doesn't try to resolve the optional
 * `playwright` module at typecheck time. The real shapes are richer, but the
 * subset below is all this processor uses.
 */
interface PwLocator {
  waitFor: (opts: { state?: string; timeout?: number }) => Promise<void>;
  boundingBox: () => Promise<{ x: number; y: number; width: number; height: number } | null>;
  screenshot: (opts: Record<string, unknown>) => Promise<Buffer>;
}
interface PwPage {
  setDefaultTimeout: (ms: number) => void;
  goto: (url: string, opts?: { waitUntil?: string }) => Promise<unknown>;
  screenshot: (opts: Record<string, unknown>) => Promise<Buffer>;
  getByText: (selector: string) => PwLocator;
  getByRole: (role: string) => PwLocator;
  locator: (selector: string) => PwLocator;
}
interface PwBrowser {
  newContext: (opts: { viewport?: { width: number; height: number } }) => Promise<{
    newPage: () => Promise<PwPage>;
  }>;
  close: () => Promise<void>;
}
interface PwModule {
  chromium: {
    launch: (opts: { headless?: boolean; timeout?: number }) => Promise<PwBrowser>;
  };
}

async function requirePlaywright(): Promise<PwModule> {
  const pkgName = "playwright";
  try {
    return (await import(pkgName)) as unknown as PwModule;
  } catch {
    throw new MissingDependencyError(
      "playwright",
      "Screenshots need Playwright. Install with: npm i playwright && npx playwright install chromium"
    );
  }
}

async function captureScreenshot(
  mode: Mode,
  opts: ScreenshotOptions | ElementScreenshotOptions
): Promise<ScreenshotResult> {
  if (!opts.url.match(/^https?:\/\//)) {
    throw new ProcessingError(`Invalid URL (must start with http:// or https://): ${opts.url}`);
  }
  const startTime = Date.now();
  const format = opts.format ?? "png";
  const quality = opts.quality;
  const viewport = {
    width: opts.viewportWidth ?? 1920,
    height: opts.viewportHeight ?? 1080
  };

  const { chromium } = await requirePlaywright();
  logger.info(`Launching Chromium for ${mode} screenshot of ${opts.url}`);
  const browser = await chromium.launch({ headless: true, timeout: opts.timeout ?? 30_000 });
  try {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.setDefaultTimeout(opts.timeout ?? 30_000);
    await page.goto(opts.url, { waitUntil: opts.waitUntil ?? "load" });

    const screenshotOpts: Record<string, unknown> = {
      type: format,
      ...(format === "jpeg" && quality !== undefined ? { quality } : {})
    };

    let buffer: Buffer;
    let dimensions: ScreenshotResult["dimensions"];

    if (mode === "fullpage") {
      buffer = await page.screenshot({ ...screenshotOpts, fullPage: true });
    } else if (mode === "viewport") {
      buffer = await page.screenshot(screenshotOpts);
    } else {
      const e = opts as ElementScreenshotOptions;
      const locator = buildLocator(page, e.selector, e.selectorType ?? "css");
      if (e.waitForSelector !== false) {
        await locator.waitFor({ state: "visible", timeout: opts.timeout ?? 30_000 });
      }
      const box = await locator.boundingBox();
      if (box) dimensions = box;
      buffer = await locator.screenshot(screenshotOpts);
    }

    return {
      base64: buffer.toString("base64"),
      mimeType: format === "jpeg" ? "image/jpeg" : "image/png",
      url: opts.url,
      viewport,
      processing_time_ms: Date.now() - startTime,
      dimensions
    };
  } finally {
    await browser.close();
  }
}

function buildLocator(
  page: PwPage,
  selector: string,
  selectorType: "css" | "text" | "role"
): PwLocator {
  if (selectorType === "text") return page.getByText(selector);
  if (selectorType === "role") return page.getByRole(selector);
  return page.locator(selector);
}

export const captureFullPage = (opts: ScreenshotOptions) => captureScreenshot("fullpage", opts);
export const captureViewport = (opts: ScreenshotOptions) => captureScreenshot("viewport", opts);
export const captureElement = (opts: ElementScreenshotOptions) => captureScreenshot("element", opts);
