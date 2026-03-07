import type { ToolServer, Editor } from "@pen/types";
import type { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

export interface MCPServerOptions {
  toolServer?: ToolServer;
  editor?: Editor;
  name?: string;
  version?: string;
  transport?: "stdio";
}

export interface MCPRequestHandlerOptions {
  toolServer?: ToolServer;
  editor?: Editor;
  name?: string;
  version?: string;
  path?: string;
  sessionIdGenerator?: (() => string) | undefined;
}

export interface MCPServerInstance {
  start(): Promise<void>;
  stop(): Promise<void>;
  readonly running: boolean;
}

export type MCPNodeRequest = Parameters<
  StreamableHTTPServerTransport["handleRequest"]
>[0];

export type MCPNodeResponse = Parameters<
  StreamableHTTPServerTransport["handleRequest"]
>[1];

export interface MCPRequestHandler {
  handleSSE(
    req: MCPNodeRequest,
    res: MCPNodeResponse,
    parsedBody?: unknown,
  ): Promise<void>;
  handleStreamableHTTP(
    req: MCPNodeRequest,
    res: MCPNodeResponse,
    parsedBody?: unknown,
  ): Promise<void>;
}
