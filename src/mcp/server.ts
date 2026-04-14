/**
 * MCP stdio server — exposes our native tool registry so that Claude Desktop
 * and other MCP clients can invoke the same processors the CLI uses.
 *
 * `@modelcontextprotocol/sdk` is an optionalDependency — we lazy-load it only
 * when `human mcp start` is invoked. This keeps the base install lean.
 */
import { buildConfig } from "../core/build-config.js";
import { logger } from "../core/logger.js";
import { MissingDependencyError } from "../core/errors.js";
import { TOOL_REGISTRY } from "./tool-registry.js";
import type { EnvRecord } from "../config/env-sources.js";

export async function startMcpServer(env: EnvRecord): Promise<void> {
  let McpServer: unknown;
  let StdioServerTransport: unknown;
  // Dynamic import names prevent TS from resolving the optional dep at typecheck time.
  const mcpServerPath = "@modelcontextprotocol/sdk/server/mcp.js";
  const stdioTransportPath = "@modelcontextprotocol/sdk/server/stdio.js";
  try {
    ({ McpServer } = (await import(mcpServerPath)) as { McpServer: unknown });
    ({ StdioServerTransport } = (await import(stdioTransportPath)) as {
      StdioServerTransport: unknown;
    });
  } catch {
    throw new MissingDependencyError(
      "@modelcontextprotocol/sdk",
      "'human mcp start' requires the MCP SDK. Install it with: npm i @modelcontextprotocol/sdk"
    );
  }

  const { z } = await import("zod");

  const config = buildConfig(env);
  const version = (await import("../version.js")).version;

  const server = new (McpServer as new (info: { name: string; version: string }) => {
    registerTool: (
      name: string,
      spec: { title?: string; description?: string; inputSchema?: Record<string, unknown> },
      handler: (args: Record<string, unknown>) => Promise<{
        content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
        isError?: boolean;
      }>
    ) => void;
    connect: (transport: unknown) => Promise<void>;
  })({ name: "human-cli", version });

  // Register every tool from the native registry
  for (const spec of TOOL_REGISTRY) {
    const inputSchema: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(spec.inputSchema)) {
      let schema: unknown;
      if (field.type === "string") schema = z.string();
      else if (field.type === "number") schema = z.number();
      else if (field.type === "boolean") schema = z.boolean();
      else if (field.type === "array") schema = z.array(z.string());
      else schema = z.unknown();
      if (field.description) schema = (schema as { describe: (d: string) => unknown }).describe(field.description);
      if (!field.required) schema = (schema as { optional: () => unknown }).optional();
      inputSchema[key] = schema;
    }

    server.registerTool(
      spec.name,
      {
        title: spec.name,
        description: spec.description,
        inputSchema
      },
      async (args) => {
        try {
          const result = await spec.run(config, args);
          const content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> = [];
          if (result.text) content.push({ type: "text", text: result.text });
          for (const m of result.media) {
            content.push({
              type: m.kind === "image" ? "image" : m.kind === "audio" ? "audio" : "resource",
              data: m.base64,
              mimeType: m.mimeType
            });
          }
          if (content.length === 0) content.push({ type: "text", text: "(no output)" });
          return { content };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
        }
      }
    );
  }

  const transport = new (StdioServerTransport as new () => unknown)();
  await server.connect(transport);
  logger.info(`human-cli MCP server started (${TOOL_REGISTRY.length} tools, stdio)`);
}
