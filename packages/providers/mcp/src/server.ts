import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type {
  MCPServerOptions,
  MCPServerInstance,
  MCPRequestHandler,
  MCPRequestHandlerOptions,
} from "./types";
import { listMCPTools, executeMCPTool } from "./tool-bridge";
import { createStdioTransport } from "./transport-stdio";
import { createSSEHandler } from "./transport-sse";
import { createStreamableHTTPHandler } from "./transport-http";
import type {
  ToolServer,
  ToolContext,
  Editor,
  StreamingTarget,
} from "@pen/types";

export function createMCPServer(options: MCPServerOptions): MCPServerInstance {
  const resolved = resolveMCPOptions(options);

  let running = false;
  let server: Server | null = null;

  const instance: MCPServerInstance = {
    async start(): Promise<void> {
      if (running) return;

      server = createProtocolServer(resolved);
      const transport = createStdioTransport();
      await server.connect(transport);

      running = true;
    },

    async stop(): Promise<void> {
      if (!running || !server) return;
      await server.close();
      server = null;
      running = false;
    },

    get running(): boolean {
      return running;
    },
  };

  return instance;
}

export function createMCPRequestHandler(
  options: MCPRequestHandlerOptions,
): MCPRequestHandler {
  const resolved = resolveMCPOptions(options);

  return {
    handleSSE: createSSEHandler(
      () => createProtocolServer(resolved),
      resolved.path ?? "/mcp/sse",
    ),
    handleStreamableHTTP: createStreamableHTTPHandler(
      () => createProtocolServer(resolved),
      resolved.sessionIdGenerator,
    ),
  };
}

function createProtocolServer(options: ResolvedMCPOptions): Server {
  const server = new Server(
    { name: options.name, version: options.version },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = listMCPTools(options.toolServer);
    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name: toolName, arguments: toolInput } = request.params;
    const context: ToolContext = createToolContext(
      options.editor,
      options.toolServer,
    );
    return executeMCPTool(options.toolServer, toolName, toolInput, context);
  });

  return server;
}

interface ResolvedMCPOptions {
  toolServer: ToolServer;
  editor?: Editor;
  name: string;
  version: string;
  path?: string;
  sessionIdGenerator?: (() => string) | undefined;
}

function resolveMCPOptions(
  options: MCPServerOptions | MCPRequestHandlerOptions,
): ResolvedMCPOptions {
  const toolServer =
    options.toolServer ??
    options.editor?.internals.getSlot<ToolServer>("document-ops:toolServer") ??
    throwMissingToolServer();

  return {
    toolServer,
    editor: options.editor,
    name: options.name ?? "pen-mcp",
    version: options.version ?? "0.1.0",
    path: "path" in options ? options.path : undefined,
    sessionIdGenerator:
      "sessionIdGenerator" in options ? options.sessionIdGenerator : undefined,
  };
}

function createToolContext(
  editor: Editor | undefined,
  _toolServer: ToolServer,
): ToolContext {
  return {
    editor: editor ?? (null as unknown as Editor),
    docId: editor ? "default" : "",
    emit() {
      /* No-op for MCP — results are returned, not streamed */
    },
    insertBlock(
      blockType: string,
      props: Record<string, unknown>,
      position,
    ) {
      if (!editor) throw new Error("No editor available");
      const blockId = crypto.randomUUID();
      editor.apply(
        [{ type: "insert-block", blockId, blockType, props, position }],
        { origin: "ai" },
      );
      return blockId;
    },
    updateBlock(blockId: string, props: Record<string, unknown>) {
      if (!editor) throw new Error("No editor available");
      editor.apply([{ type: "update-block", blockId, props }], {
        origin: "ai",
      });
    },
    deleteBlock(blockId: string) {
      if (!editor) throw new Error("No editor available");
      editor.apply([{ type: "delete-block", blockId }], { origin: "ai" });
    },
    beginStreaming(zoneId: string, blockId: string) {
      if (!editor) throw new Error("No editor available");
      editor.undoManager.stopCapturing();
      const streaming = editor.internals.getSlot<StreamingTarget>(
        "delta-stream:target",
      );
      streaming?.beginStreaming(zoneId, blockId);
    },
    appendDelta(delta: string) {
      const streaming = editor?.internals.getSlot<StreamingTarget>(
        "delta-stream:target",
      );
      streaming?.appendDelta(delta);
    },
    endStreaming(status: "complete" | "cancelled" | "error") {
      const streaming = editor?.internals.getSlot<StreamingTarget>(
        "delta-stream:target",
      );
      streaming?.endStreaming(status);
      editor?.undoManager.stopCapturing();
    },
  } as ToolContext;
}

function throwMissingToolServer(): never {
  throw new Error(
    "MCP server helpers require either a toolServer or an editor with a toolServer. " +
      "Pass { toolServer } or { editor } in options.",
  );
}
