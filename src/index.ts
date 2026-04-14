/**
 * Public library entry — programmatic usage of human-cli.
 *
 * In v2.0 the surface is built around native processors, not the MCP
 * subprocess bridge. Use these imports when embedding human-cli in a larger
 * Node application without shelling out to the CLI.
 */
export { resolveEnv, KNOWN_KEYS } from "./config/resolve-env.js";
export type { ResolveOptions, ResolvedEnv, KnownKey } from "./config/resolve-env.js";
export { buildConfig } from "./core/build-config.js";
export { ConfigSchema } from "./core/config-schema.js";
export type { Config } from "./core/config-schema.js";
export { GeminiClient } from "./core/providers/gemini-client.js";
export { loadMedia } from "./core/media-loader.js";
export { logger } from "./core/logger.js";
export { HumanCliError, APIError, ProcessingError, ValidationError, MissingDependencyError, handleError } from "./core/errors.js";
export { TOOL_REGISTRY, findTool, listToolNames } from "./mcp/tool-registry.js";
export type { ToolSpec, ToolCallResult } from "./mcp/tool-registry.js";
export { startMcpServer } from "./mcp/server.js";
export { analyzeImage, compareImages } from "./processors/eyes/analyze-image.js";
export { readDocument, summarizeDocument } from "./processors/eyes/read-document.js";
export { generateImage, editImageWithGemini } from "./processors/hands/gen-image.js";
export { cropImage, resizeImage, rotateImage, maskImage } from "./processors/hands/jimp-ops.js";
export { speak, narrate } from "./processors/mouth/speak.js";
export { explainCode, customizeVoice } from "./processors/mouth/explain-and-customize.js";
export { think, reflect, analyzeSimple, patternsInfo } from "./processors/brain/think.js";
export { generateVideo } from "./processors/hands/gen-video.js";
export {
  generateMinimaxMusic,
  generateElevenLabsSfx,
  generateElevenLabsMusic
} from "./processors/hands/gen-audio.js";
export { removeBackground } from "./processors/hands/remove-background.js";
export {
  captureFullPage,
  captureViewport,
  captureElement
} from "./processors/hands/screenshot.js";
export { MinimaxClient, MinimaxApiError } from "./core/providers/minimax-client.js";
export { ElevenLabsClient, ElevenLabsApiError } from "./core/providers/elevenlabs-client.js";
export { version } from "./version.js";
