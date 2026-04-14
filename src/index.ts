/**
 * Public library entry — programmatic usage of human-cli.
 */
export { HumanMcpClient, resolveHumanMcpEntry } from "./mcp/mcp-client.js";
export type { McpClientOptions, ToolResult } from "./mcp/mcp-client.js";
export { resolveEnv, KNOWN_KEYS } from "./config/resolve-env.js";
export type { ResolveOptions, ResolvedEnv, KnownKey } from "./config/resolve-env.js";
export { renderResult } from "./output/format-result.js";
export type { RenderContext, Envelope } from "./output/format-result.js";
export { version } from "./version.js";
