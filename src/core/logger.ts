/**
 * Structured logger — writes to stderr so stdout stays clean for JSON envelopes.
 * Level controlled by LOG_LEVEL env var (debug/info/warn/error).
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

class Logger {
  private level: LogLevel;

  constructor() {
    this.level = (process.env.LOG_LEVEL as LogLevel) || "info";
  }

  setLevel(level: LogLevel) {
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ["debug", "info", "warn", "error"];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }

  private format(level: LogLevel, message: string, args: unknown[]): string {
    const ts = new Date().toISOString();
    const head = `[${ts}] [${level.toUpperCase()}] ${message}`;
    return args.length > 0 ? `${head} ${safeStringify(args)}` : head;
  }

  debug(message: string, ...args: unknown[]) {
    if (this.shouldLog("debug")) console.error(this.format("debug", message, args));
  }

  info(message: string, ...args: unknown[]) {
    if (this.shouldLog("info")) console.error(this.format("info", message, args));
  }

  warn(message: string, ...args: unknown[]) {
    if (this.shouldLog("warn")) console.error(this.format("warn", message, args));
  }

  error(message: string, ...args: unknown[]) {
    if (this.shouldLog("error")) console.error(this.format("error", message, args));
  }
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export const logger = new Logger();
