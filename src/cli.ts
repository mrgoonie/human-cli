/**
 * human-cli — CLI entry point.
 *
 * Dual-purpose:
 *   • Humans:  colored pretty output, spinners, sensible defaults
 *   • Agents:  --json for structured envelopes, non-TTY auto-detection, stable exit codes
 */
import { Command } from "commander";
import { registerGlobalFlags } from "./runtime/global-flags.js";
import { registerEyesCommands } from "./commands/eyes-commands.js";
import { registerHandsCommands } from "./commands/hands-commands.js";
import { registerMouthCommands } from "./commands/mouth-commands.js";
import { registerBrainCommands } from "./commands/brain-commands.js";
import { registerConfigCommands } from "./commands/config-commands.js";
import { registerDoctorCommand } from "./commands/doctor-command.js";
import { registerCallAndToolsCommands } from "./commands/call-command.js";
import { registerMcpCommand } from "./commands/mcp-command.js";
import { version as pkgVersion } from "./version.js";

export function buildProgram(): Command {
  const program = new Command();
  program
    .name("human")
    .description(
      "Human-friendly & agent-friendly CLI for Human MCP — vision, speech, generation, reasoning"
    )
    .version(pkgVersion, "-V, --version");

  registerGlobalFlags(program);

  registerEyesCommands(program);
  registerHandsCommands(program);
  registerMouthCommands(program);
  registerBrainCommands(program);
  registerConfigCommands(program);
  registerDoctorCommand(program);
  registerMcpCommand(program);
  registerCallAndToolsCommands(program);

  program.addHelpText(
    "after",
    `
Examples:
  $ human eyes analyze screenshot.png --focus "layout issues"
  $ human hands gen-image "a red fox in snow" --aspect 16:9 -o ./images
  $ human mouth speak "Hello world" --voice Zephyr -o ./audio
  $ human brain think "design a rate limiter"
  $ cat report.md | human eyes summarize - --length brief
  $ human call eyes_analyze --args '{"source":"img.png","detail":"quick"}' --json
  $ human config init && human config set GOOGLE_GEMINI_API_KEY <key>
  $ human doctor

Agent mode (structured JSON output):
  $ human --json eyes analyze img.png
  $ human tools --json            # list all tools with descriptions
`
  );

  return program;
}

async function main(): Promise<void> {
  const program = buildProgram();
  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (process.stdout.isTTY) {
      process.stderr.write(`\nError: ${message}\n`);
    } else {
      process.stdout.write(
        JSON.stringify({ ok: false, error: message }) + "\n"
      );
    }
    process.exit(2);
  }
}

main();
