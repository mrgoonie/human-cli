/**
 * "brain" command group — reasoning & reflection.
 */
import type { Command } from "commander";
import { runTool } from "../runtime/run-tool.js";
import { extractGlobalFlags } from "../runtime/global-flags.js";
import { readFileSync, existsSync } from "node:fs";

export function registerBrainCommands(program: Command): void {
  const brain = program.command("brain").description("Reasoning, reflection, and pattern analysis");

  brain
    .command("think <problem>")
    .description("Step-by-step sequential thinking")
    .option("--max-thoughts <n>", "Maximum thoughts", Number, 10)
    .action(async (problem: string, opts, cmd) => {
      await runTool({
        tool: "mcp__reasoning__sequentialthinking",
        args: { problem: materializeText(problem), thought_limit: opts.maxThoughts },
        globals: extractGlobalFlags(cmd)
      });
    });

  brain
    .command("analyze <input>")
    .description("Pattern-based lightweight reasoning")
    .option("--type <t>", "Analysis type (e.g. logical, root-cause, tradeoff)")
    .action(async (input: string, opts, cmd) => {
      await runTool({
        tool: "brain_analyze_simple",
        args: { input: materializeText(input), analysis_type: opts.type },
        globals: extractGlobalFlags(cmd)
      });
    });

  brain
    .command("reflect <analysis>")
    .description("AI-powered reflection to improve an analysis")
    .option(
      "--focus <areas>",
      "Comma list: assumptions, logic_gaps, alternative_approaches, evidence_quality, bias_detection, completeness",
      "assumptions,logic_gaps"
    )
    .option("--goal <text>", "Primary improvement goal")
    .option("--detail <lvl>", "concise | detailed", "detailed")
    .action(async (analysis: string, opts, cmd) => {
      await runTool({
        tool: "brain_reflect_enhanced",
        args: {
          originalAnalysis: materializeText(analysis),
          focusAreas: String(opts.focus)
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          improvementGoal: opts.goal,
          detailLevel: opts.detail
        },
        globals: extractGlobalFlags(cmd)
      });
    });

  brain
    .command("patterns")
    .description("List available reasoning patterns / frameworks")
    .option("-q, --query <text>", "Filter by keyword")
    .action(async (opts, cmd) => {
      await runTool({
        tool: "brain_patterns_info",
        args: { query: opts.query },
        globals: extractGlobalFlags(cmd)
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
