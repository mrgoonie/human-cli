/**
 * "brain" command group — native reasoning & reflection.
 */
import type { Command } from "commander";
import { readFileSync, existsSync } from "node:fs";
import { runProcessor } from "../runtime/run-processor.js";
import { extractGlobalFlags } from "../runtime/global-flags.js";
import {
  think,
  reflect,
  analyzeSimple,
  patternsInfo
} from "../processors/brain/think.js";

export function registerBrainCommands(program: Command): void {
  const brain = program.command("brain").description("Reasoning, reflection, and pattern analysis");

  brain
    .command("think <problem>")
    .description("Step-by-step sequential thinking (Gemini)")
    .option("--max-thoughts <n>", "Maximum thoughts", Number, 10)
    .action(async (problem: string, opts, cmd) => {
      await runProcessor({
        tool: "brain.think",
        globals: extractGlobalFlags(cmd),
        run: (config) => think(config, { problem: materializeText(problem), maxThoughts: opts.maxThoughts }),
        toOutput: (r) => ({
          text:
            r.thoughts
              .map((t) => `### ${t.step}. ${t.thought}\n_confidence: ${(t.confidence * 100).toFixed(0)}%_`)
              .join("\n\n") + `\n\n---\n\n## Conclusion\n\n${r.conclusion}`
        })
      });
    });

  brain
    .command("analyze <input>")
    .description("Pattern-based local analysis (no API call)")
    .option("--type <t>", "general | logical | root-cause | tradeoff", "general")
    .action(async (input: string, opts, cmd) => {
      await runProcessor({
        tool: "brain.analyze",
        globals: extractGlobalFlags(cmd),
        run: async () => analyzeSimple({ input: materializeText(input), analysisType: opts.type }),
        toOutput: (r) => ({ text: r.analysis })
      });
    });

  brain
    .command("reflect <analysis>")
    .description("AI reflection to improve a prior analysis (Gemini)")
    .option(
      "--focus <areas>",
      "Comma list: assumptions, logic_gaps, alternative_approaches, evidence_quality, bias_detection, completeness",
      "assumptions,logic_gaps"
    )
    .option("--goal <text>", "Primary improvement goal")
    .option("--detail <lvl>", "concise | detailed", "detailed")
    .action(async (analysis: string, opts, cmd) => {
      await runProcessor({
        tool: "brain.reflect",
        globals: extractGlobalFlags(cmd),
        run: (config) =>
          reflect(config, {
            analysis: materializeText(analysis),
            focusAreas: String(opts.focus)
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean) as ("assumptions" | "logic_gaps")[],
            improvementGoal: opts.goal,
            detailLevel: opts.detail
          }),
        toOutput: (r) => ({ text: r.reflection })
      });
    });

  brain
    .command("patterns")
    .description("List reasoning patterns / frameworks (local)")
    .option("-q, --query <text>", "Filter by keyword")
    .action(async (opts, cmd) => {
      await runProcessor({
        tool: "brain.patterns",
        globals: extractGlobalFlags(cmd),
        run: async () => patternsInfo(opts.query),
        toOutput: (r) => ({
          text:
            "# Reasoning Patterns\n\n" +
            r.patterns.map((p) => `- **${p.name}** — ${p.purpose}`).join("\n")
        })
      });
    });
}

function materializeText(input: string): string {
  if (input === "-") {
    try {
      return readFileSync(0, "utf8");
    } catch {
      return "";
    }
  }
  if (input.startsWith("@")) {
    const path = input.slice(1);
    if (existsSync(path)) return readFileSync(path, "utf8");
  }
  return input;
}
