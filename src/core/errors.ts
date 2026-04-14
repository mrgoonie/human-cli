/**
 * Error hierarchy ported from human-mcp. Renamed to HumanCliError to reflect
 * the new home; keeps the same code-based taxonomy for easy translation.
 */
export class HumanCliError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = "HumanCliError";
  }
}

export class ValidationError extends HumanCliError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR", 400);
  }
}

export class ProcessingError extends HumanCliError {
  constructor(message: string) {
    super(message, "PROCESSING_ERROR", 500);
  }
}

export class APIError extends HumanCliError {
  constructor(message: string, statusCode = 500) {
    super(message, "API_ERROR", statusCode);
  }
}

export class MissingDependencyError extends HumanCliError {
  constructor(packageName: string, commandContext: string) {
    super(
      `This command requires "${packageName}". Install it with: npm i ${packageName}\n` +
        `Context: ${commandContext}`,
      "MISSING_DEPENDENCY",
      501
    );
  }
}

export function handleError(error: unknown): HumanCliError {
  if (error instanceof HumanCliError) return error;
  if (error instanceof Error) return new ProcessingError(error.message);
  return new ProcessingError("An unknown error occurred");
}
