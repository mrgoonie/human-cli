/**
 * Smoke tests for native processors that don't require network / API keys.
 */
import { describe, it, expect } from "vitest";
import { analyzeSimple, patternsInfo } from "../src/processors/brain/think.js";
import { TOOL_REGISTRY, findTool, listToolNames } from "../src/mcp/tool-registry.js";
import { buildConfig } from "../src/core/build-config.js";

describe("brain.analyzeSimple", () => {
  it("returns a tradeoff analysis with 5 steps", () => {
    const r = analyzeSimple({ input: "monolith vs microservices", analysisType: "tradeoff" });
    expect(r.analysis).toContain("Options");
    expect(r.analysis).toContain("Decision criteria");
    expect(r.metadata.method).toBe("pattern:tradeoff");
  });

  it("falls back to general framework for unknown type", () => {
    const r = analyzeSimple({ input: "x", analysisType: "nonexistent" });
    expect(r.analysis).toContain("Observation");
  });
});

describe("brain.patternsInfo", () => {
  it("lists all patterns without a query", () => {
    const r = patternsInfo();
    expect(r.patterns.length).toBeGreaterThanOrEqual(10);
    expect(r.patterns.some((p) => p.name === "First principles")).toBe(true);
  });

  it("filters by keyword", () => {
    const r = patternsInfo("bayesian");
    expect(r.patterns).toHaveLength(1);
    expect(r.patterns[0]?.name).toBe("Bayesian update");
  });
});

describe("tool-registry", () => {
  it("exposes the expected native tools", () => {
    const names = listToolNames();
    expect(names).toContain("eyes_analyze");
    expect(names).toContain("hands_gen_image");
    expect(names).toContain("mouth_speak");
    expect(names).toContain("brain_think");
    expect(names.length).toBeGreaterThanOrEqual(16);
  });

  it("findTool returns a spec with description + run", () => {
    const spec = findTool("brain_patterns_info");
    expect(spec).toBeDefined();
    expect(spec?.description).toContain("reasoning patterns");
    expect(typeof spec?.run).toBe("function");
  });

  it("all tools have non-empty descriptions and inputSchema", () => {
    for (const t of TOOL_REGISTRY) {
      expect(t.description.length).toBeGreaterThan(5);
      expect(Object.keys(t.inputSchema).length).toBeGreaterThan(0);
    }
  });
});

describe("build-config", () => {
  it("produces a valid config with only Gemini key set", () => {
    const config = buildConfig({ GOOGLE_GEMINI_API_KEY: "test" });
    expect(config.gemini.apiKey).toBe("test");
    expect(config.gemini.model).toBe("gemini-2.5-flash");
    expect(config.providers.speech).toBe("gemini");
    expect(config.logging.level).toBe("info");
  });

  it("parses USE_VERTEX correctly", () => {
    const config = buildConfig({ USE_VERTEX: "1", VERTEX_PROJECT_ID: "my-proj" });
    expect(config.gemini.useVertexAI).toBe(true);
    expect(config.gemini.vertexProjectId).toBe("my-proj");
  });
});
