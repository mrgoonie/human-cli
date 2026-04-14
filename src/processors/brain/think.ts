/**
 * Brain processors — CLI-friendly reasoning.
 *
 * `think`      — Gemini chain-of-thought with structured output
 * `reflect`    — Gemini reflection on a prior analysis
 * `analyze`    — Local pattern-based analysis (no API)
 * `patterns`   — Static list of frameworks/patterns (no API)
 *
 * The session-based `mcp__reasoning__sequentialthinking` API from human-mcp
 * doesn't make sense in a one-shot CLI — we collapse it to a single Gemini
 * call that returns the full chain of thoughts + synthesised answer.
 */
import { GeminiClient } from "../../core/providers/gemini-client.js";
import type { Config } from "../../core/config-schema.js";

export interface ThinkOptions {
  problem: string;
  maxThoughts?: number;
}

export interface ThinkResult {
  thoughts: Array<{ step: number; thought: string; confidence: number }>;
  conclusion: string;
  metadata: { model_used: string; processing_time_ms: number };
}

export async function think(config: Config, opts: ThinkOptions): Promise<ThinkResult> {
  const startTime = Date.now();
  const client = new GeminiClient(config);
  const model = client.getModel("detailed");
  const maxThoughts = opts.maxThoughts ?? 10;

  const prompt = `You are an expert problem-solver. Think through this problem step by step.

Problem: ${opts.problem}

Produce a sequential reasoning chain (up to ${maxThoughts} thoughts). For each thought, provide:
- A clear thinking step
- A confidence score between 0.0 and 1.0

After the chain, synthesise a final conclusion.

Return your response in this exact JSON format (no markdown fences):
{
  "thoughts": [
    { "step": 1, "thought": "...", "confidence": 0.8 },
    { "step": 2, "thought": "...", "confidence": 0.85 }
  ],
  "conclusion": "..."
}`;

  const text = await client.analyzeContent(model, prompt, []);
  const parsed = extractJson(text);

  return {
    thoughts: Array.isArray(parsed?.thoughts) ? parsed.thoughts : [],
    conclusion: typeof parsed?.conclusion === "string" ? parsed.conclusion : text,
    metadata: { model_used: model.model, processing_time_ms: Date.now() - startTime }
  };
}

export interface ReflectOptions {
  analysis: string;
  focusAreas?: Array<
    "assumptions" | "logic_gaps" | "alternative_approaches" | "evidence_quality" | "bias_detection" | "completeness"
  >;
  improvementGoal?: string;
  detailLevel?: "concise" | "detailed";
}

export interface ReflectResult {
  reflection: string;
  improvements: string[];
  metadata: { model_used: string; processing_time_ms: number };
}

export async function reflect(config: Config, opts: ReflectOptions): Promise<ReflectResult> {
  const startTime = Date.now();
  const client = new GeminiClient(config);
  const model = client.getModel("detailed");

  const focus = opts.focusAreas?.length ? opts.focusAreas.join(", ") : "assumptions, logic_gaps";
  const detail = opts.detailLevel ?? "detailed";
  const goal = opts.improvementGoal ? `\n\nPrimary improvement goal: ${opts.improvementGoal}` : "";

  const prompt = `You are a critical reviewer performing meta-analysis on the following reasoning.

Original analysis:
"""
${opts.analysis}
"""

Reflect ${detail === "concise" ? "briefly" : "thoroughly"} on these aspects: ${focus}.${goal}

Provide:
1. **Reflection** — what holds up, what doesn't, where the logic is weak
2. **Improvements** — specific, actionable upgrades to the analysis

Format as markdown with an explicit "## Improvements" section containing a bulleted list.`;

  const text = await client.analyzeContent(model, prompt, []);
  const improvements = extractImprovementsList(text);
  return {
    reflection: text,
    improvements,
    metadata: { model_used: model.model, processing_time_ms: Date.now() - startTime }
  };
}

export interface AnalyzeOptions {
  input: string;
  analysisType?: string;
}

export interface AnalyzeResult {
  analysis: string;
  metadata: { method: string; processing_time_ms: number };
}

/**
 * Pattern-based local analysis — no API. Picks a framework by `analysisType`
 * and walks the input through it.
 */
export function analyzeSimple(opts: AnalyzeOptions): AnalyzeResult {
  const startTime = Date.now();
  const type = opts.analysisType ?? "general";
  const frameworks: Record<string, string[]> = {
    general: ["Observation", "Context", "Implications", "Next steps"],
    logical: ["Premises", "Inference chain", "Potential fallacies", "Conclusion"],
    "root-cause": ["Symptoms", "Proximate cause", "Contributing factors", "Root cause", "Fix"],
    tradeoff: ["Options", "Pros per option", "Cons per option", "Decision criteria", "Recommendation"]
  };
  const framework = frameworks[type] ?? frameworks.general!;
  const analysis =
    `# Analysis (${type})\n\n` +
    framework
      .map((step, i) => `## ${i + 1}. ${step}\n_Apply the "${step}" lens to:_\n> ${opts.input.slice(0, 500)}\n`)
      .join("\n");
  return {
    analysis,
    metadata: { method: `pattern:${type}`, processing_time_ms: Date.now() - startTime }
  };
}

export function patternsInfo(query?: string): { patterns: Array<{ name: string; purpose: string }> } {
  const all = [
    { name: "First principles", purpose: "Break down to fundamental truths, reason up" },
    { name: "Inversion", purpose: "Consider the opposite outcome and work backwards" },
    { name: "Second-order thinking", purpose: "Evaluate downstream consequences of each option" },
    { name: "Occam's razor", purpose: "Prefer the simplest sufficient explanation" },
    { name: "Pre-mortem", purpose: "Imagine failure first, identify what would cause it" },
    { name: "Five whys", purpose: "Ask 'why' recursively to reach root cause" },
    { name: "Rubber duck", purpose: "Explain out loud to expose gaps" },
    { name: "SWOT", purpose: "Strengths / Weaknesses / Opportunities / Threats" },
    { name: "OODA loop", purpose: "Observe / Orient / Decide / Act" },
    { name: "Bayesian update", purpose: "Revise probability of hypothesis as evidence arrives" }
  ];
  if (!query) return { patterns: all };
  const q = query.toLowerCase();
  return {
    patterns: all.filter(
      (p) => p.name.toLowerCase().includes(q) || p.purpose.toLowerCase().includes(q)
    )
  };
}

function extractJson(text: string): { thoughts?: Array<{ step: number; thought: string; confidence: number }>; conclusion?: string } | null {
  const cleaned = text.replace(/```json\s*|\s*```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // try to find first { ... } block
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

function extractImprovementsList(markdown: string): string[] {
  const match = markdown.match(/##\s*Improvements\s*\n([\s\S]*?)(\n##|$)/i);
  if (!match?.[1]) return [];
  return match[1]
    .split("\n")
    .map((l) => l.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);
}
