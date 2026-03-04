import type { Extension, ServerConfig } from "@pen/core";

export interface MCPProviderOptions {
  url?: string;
  transport?: ServerConfig["transport"];
}

export function mcpProvider(_options?: MCPProviderOptions): Extension {
  throw new Error("Not implemented");
}

export type { ServerConfig };
