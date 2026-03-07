import { describe, expect, it, vi, beforeEach } from "vitest";
import type {
  ToolServer,
  ToolDefinition,
  ToolContext,
  Editor,
} from "@pen/types";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createEditor } from "@pen/core";
import {
  toolDefinitionToMCPDescriptor,
  listMCPTools,
  executeMCPTool,
} from "../tool-bridge.js";
import { createMCPRequestHandler, createMCPServer } from "../server.js";

// ── Helpers ─────────────────────────────────────────────────

function textOf(result: CallToolResult, index = 0): string {
  const item = result.content[index];
  if (item.type !== "text") throw new Error(`Expected text content, got ${item.type}`);
  return item.text;
}

function createMockToolServer(
  tools: ToolDefinition[] = [],
): ToolServer {
  const toolMap = new Map(tools.map((t) => [t.name, t]));
  return {
    registerTool(def: ToolDefinition) {
      toolMap.set(def.name, def);
    },
    unregisterTool(name: string) {
      toolMap.delete(name);
    },
    listTools() {
      return [...toolMap.values()];
    },
    executeTool(name: string, input: unknown, ctx: ToolContext) {
      const def = toolMap.get(name);
      if (!def) throw new Error(`Unknown tool: "${name}"`);
      return def.handler(input, ctx);
    },
  };
}

function createMockToolContext(): ToolContext {
  return {
    editor: null as unknown as Editor,
    docId: "test",
    emit: vi.fn(),
    insertBlock: vi.fn(() => "block-1"),
    updateBlock: vi.fn(),
    deleteBlock: vi.fn(),
    beginStreaming: vi.fn(),
    appendDelta: vi.fn(),
    endStreaming: vi.fn(),
  };
}

function createMockRequest(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    method: "POST",
    headers: {},
    url: "/mcp",
    ...overrides,
  } as any;
}

function createMockResponse() {
  const response = {
    statusCode: 200,
    body: "",
    writeHead: vi.fn(function writeHead(this: any, statusCode: number) {
      this.statusCode = statusCode;
      return this;
    }),
    end: vi.fn(function end(this: any, body?: string) {
      this.body = body ?? "";
      return this;
    }),
  };

  return response as any;
}

function echoTool(): ToolDefinition {
  return {
    name: "echo",
    description: "Echoes the input back",
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string", description: "The message to echo" },
      },
      required: ["message"],
    },
    handler: async (input) => input,
  };
}

function readDocumentTool(): ToolDefinition {
  return {
    name: "read_document",
    description: "Returns the full document content as text.",
    inputSchema: {
      type: "object",
      properties: {
        format: {
          type: "string",
          enum: ["text", "markdown"],
          description: "Output format",
        },
      },
    },
    handler: async () => "# Hello\n\nWorld",
  };
}

function writeDocumentTool(): ToolDefinition {
  return {
    name: "write_document",
    description: "Writes content to the document.",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string" },
        blockId: { type: "string" },
      },
      required: ["content"],
    },
    handler: async (input, ctx) => {
      const { content } = input as { content: string; blockId?: string };
      ctx.updateBlock("block-1", { content });
      return { success: true };
    },
  };
}

function insertBlockTool(): ToolDefinition {
  return {
    name: "insert_block",
    description: "Inserts a new block into the document.",
    inputSchema: {
      type: "object",
      properties: {
        blockType: { type: "string" },
        content: { type: "string" },
        position: { type: "string" },
      },
      required: ["blockType"],
    },
    handler: async (input, ctx) => {
      const { blockType } = input as { blockType: string };
      const id = ctx.insertBlock(blockType, {}, "last");
      return { blockId: id };
    },
  };
}

function deleteBlockTool(): ToolDefinition {
  return {
    name: "delete_block",
    description: "Deletes a block from the document.",
    inputSchema: {
      type: "object",
      properties: {
        blockId: { type: "string" },
      },
      required: ["blockId"],
    },
    handler: async (input, ctx) => {
      const { blockId } = input as { blockId: string };
      ctx.deleteBlock(blockId);
      return { success: true };
    },
  };
}

function searchDocumentTool(): ToolDefinition {
  return {
    name: "search_document",
    description: "Searches for text in the document.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
      },
      required: ["query"],
    },
    handler: async (input) => {
      const { query } = input as { query: string };
      return {
        matches: [
          { blockId: "block-1", snippet: `...${query}...` },
        ],
      };
    },
  };
}

function errorTool(): ToolDefinition {
  return {
    name: "error_tool",
    description: "Always fails",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      throw new Error("Intentional tool error");
    },
  };
}

function streamingTool(): ToolDefinition {
  return {
    name: "streaming_tool",
    description: "Returns an async iterable",
    inputSchema: { type: "object", properties: {} },
    handler: (_input) => {
      return (async function* () {
        yield { part: 1 };
        yield { part: 2 };
        yield { part: 3 };
      })();
    },
  };
}

function allDefaultTools(): ToolDefinition[] {
  return [
    readDocumentTool(),
    writeDocumentTool(),
    {
      name: "get_context",
      description: "Returns document context.",
      inputSchema: { type: "object", properties: { format: { type: "string" } } },
      handler: async () => ({ summary: "5 blocks" }),
    },
    searchDocumentTool(),
    {
      name: "list_block_types",
      description: "Lists available block types.",
      inputSchema: { type: "object", properties: {} },
      handler: async () => ["paragraph", "heading", "bulletListItem"],
    },
    insertBlockTool(),
    {
      name: "update_block",
      description: "Updates block properties.",
      inputSchema: {
        type: "object",
        properties: { blockId: { type: "string" }, props: { type: "object" } },
        required: ["blockId"],
      },
      handler: async () => ({ success: true }),
    },
    deleteBlockTool(),
    {
      name: "move_block",
      description: "Moves a block to a new position.",
      inputSchema: {
        type: "object",
        properties: { blockId: { type: "string" }, position: { type: "string" } },
        required: ["blockId", "position"],
      },
      handler: async () => ({ success: true }),
    },
  ];
}

// ── tool-bridge tests ───────────────────────────────────────

describe("@pen/mcp tool-bridge", () => {
  // AC 3: Tool descriptors have correct name, description, and inputSchema
  it("maps ToolDefinition to MCP descriptor with correct JSON Schema 7 format", () => {
    const desc = toolDefinitionToMCPDescriptor(echoTool());

    expect(desc.name).toBe("echo");
    expect(desc.description).toBe("Echoes the input back");
    expect(desc.inputSchema).toEqual({
      type: "object",
      properties: {
        message: { type: "string", description: "The message to echo" },
      },
      required: ["message"],
    });
  });

  // AC 2: MCP server lists all @pen/document-ops tools
  it("listMCPTools returns all registered tools", () => {
    const tools = allDefaultTools();
    const server = createMockToolServer(tools);
    const descriptors = listMCPTools(server);

    expect(descriptors).toHaveLength(tools.length);
    const names = descriptors.map((d) => d.name);
    expect(names).toContain("read_document");
    expect(names).toContain("write_document");
    expect(names).toContain("get_context");
    expect(names).toContain("search_document");
    expect(names).toContain("list_block_types");
    expect(names).toContain("insert_block");
    expect(names).toContain("update_block");
    expect(names).toContain("delete_block");
    expect(names).toContain("move_block");
  });

  it("normalizes non-object schemas by wrapping in object", () => {
    const def: ToolDefinition = {
      name: "simple",
      description: "Simple tool",
      inputSchema: { type: "string" } as any,
      handler: async (input) => input,
    };

    const desc = toolDefinitionToMCPDescriptor(def);
    expect(desc.inputSchema.type).toBe("object");
    expect(desc.inputSchema.properties.input).toEqual({ type: "string" });
  });

  // AC 4: tools/call for read_document returns text content block
  it("executeMCPTool returns text content for string results", async () => {
    const server = createMockToolServer([readDocumentTool()]);
    const ctx = createMockToolContext();
    const result = await executeMCPTool(server, "read_document", {}, ctx);

    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toEqual({
      type: "text",
      text: "# Hello\n\nWorld",
    });
    expect(result.isError).toBeFalsy();
  });

  // AC 5: tools/call for write_document mutates the CRDT
  it("executeMCPTool calls tool handler which uses ToolContext", async () => {
    const server = createMockToolServer([writeDocumentTool()]);
    const ctx = createMockToolContext();
    const result = await executeMCPTool(
      server,
      "write_document",
      { content: "Hello world" },
      ctx,
    );

    expect(result.isError).toBeFalsy();
    expect(ctx.updateBlock).toHaveBeenCalledWith("block-1", {
      content: "Hello world",
    });
  });

  // AC 6: tools/call for insert_block creates new block
  it("executeMCPTool for insert_block invokes ctx.insertBlock", async () => {
    const server = createMockToolServer([insertBlockTool()]);
    const ctx = createMockToolContext();
    const result = await executeMCPTool(
      server,
      "insert_block",
      { blockType: "heading" },
      ctx,
    );

    expect(result.isError).toBeFalsy();
    expect(ctx.insertBlock).toHaveBeenCalledWith("heading", {}, "last");
    const parsed = JSON.parse(textOf(result));
    expect(parsed.blockId).toBe("block-1");
  });

  // AC 7: tools/call for delete_block removes block
  it("executeMCPTool for delete_block invokes ctx.deleteBlock", async () => {
    const server = createMockToolServer([deleteBlockTool()]);
    const ctx = createMockToolContext();
    const result = await executeMCPTool(
      server,
      "delete_block",
      { blockId: "block-99" },
      ctx,
    );

    expect(result.isError).toBeFalsy();
    expect(ctx.deleteBlock).toHaveBeenCalledWith("block-99");
  });

  // AC 8: tools/call for search_document returns matching blocks
  it("executeMCPTool for search_document returns results with snippets", async () => {
    const server = createMockToolServer([searchDocumentTool()]);
    const ctx = createMockToolContext();
    const result = await executeMCPTool(
      server,
      "search_document",
      { query: "hello" },
      ctx,
    );

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(textOf(result));
    expect(parsed.matches).toHaveLength(1);
    expect(parsed.matches[0].snippet).toContain("hello");
  });

  // AC 11: Tool execution errors return isError: true, not thrown
  it("executeMCPTool catches errors and returns isError: true", async () => {
    const server = createMockToolServer([errorTool()]);
    const ctx = createMockToolContext();
    const result = await executeMCPTool(server, "error_tool", {}, ctx);

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Intentional tool error");
  });

  // AC 12: AsyncIterable results are buffered
  it("executeMCPTool buffers AsyncIterable results into complete response", async () => {
    const server = createMockToolServer([streamingTool()]);
    const ctx = createMockToolContext();
    const result = await executeMCPTool(server, "streaming_tool", {}, ctx);

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(textOf(result));
    expect(parsed).toEqual([{ part: 1 }, { part: 2 }, { part: 3 }]);
  });

  it("executeMCPTool returns single item unwrapped for single-element AsyncIterable", async () => {
    const singleTool: ToolDefinition = {
      name: "single_stream",
      description: "Returns a single-item async iterable",
      inputSchema: { type: "object", properties: {} },
      handler: (_input) => {
        return (async function* () {
          yield { result: "only-one" };
        })();
      },
    };

    const server = createMockToolServer([singleTool]);
    const ctx = createMockToolContext();
    const result = await executeMCPTool(server, "single_stream", {}, ctx);

    const parsed = JSON.parse(textOf(result));
    expect(parsed).toEqual({ result: "only-one" });
  });

  it("executeMCPTool serializes object results as JSON", async () => {
    const objectTool: ToolDefinition = {
      name: "object_tool",
      description: "Returns an object",
      inputSchema: { type: "object", properties: {} },
      handler: async () => ({ key: "value", nested: { a: 1 } }),
    };

    const server = createMockToolServer([objectTool]);
    const ctx = createMockToolContext();
    const result = await executeMCPTool(server, "object_tool", {}, ctx);

    const parsed = JSON.parse(textOf(result));
    expect(parsed).toEqual({ key: "value", nested: { a: 1 } });
  });
});

// ── createMCPServer tests ───────────────────────────────────

describe("@pen/mcp createMCPServer", () => {
  // AC 1: createMCPServer({ editor }) creates an MCP server instance
  it("creates an instance with start/stop/running", () => {
    const toolServer = createMockToolServer([echoTool()]);
    const instance = createMCPServer({ toolServer });

    expect(instance).toHaveProperty("start");
    expect(instance).toHaveProperty("stop");
    expect(instance.running).toBe(false);
  });

  // AC 14: createMCPServer without toolServer or editor throws
  it("throws when neither toolServer nor editor is provided", () => {
    expect(() => createMCPServer({})).toThrow(
      "MCP server helpers require either a toolServer or an editor with a toolServer",
    );
  });

  // AC 13: stop() cleanly shuts down
  it("stop() is a no-op when not started", async () => {
    const toolServer = createMockToolServer();
    const instance = createMCPServer({ toolServer });
    await instance.stop();
    expect(instance.running).toBe(false);
  });

  it("resolves toolServer from editor internals slot when not provided explicitly", () => {
    const toolServer = createMockToolServer([echoTool()]);
    const mockEditor = {
      internals: {
        getSlot: vi.fn((key: string) => {
          if (key === "document-ops:toolServer") return toolServer;
          return undefined;
        }),
      },
    } as unknown as Editor;

    const instance = createMCPServer({ editor: mockEditor });
    expect(instance).toHaveProperty("start");
    expect(mockEditor.internals.getSlot).toHaveBeenCalledWith(
      "document-ops:toolServer",
    );
  });

  it("uses default name and version when not specified", () => {
    const toolServer = createMockToolServer();
    const instance = createMCPServer({ toolServer });
    expect(instance).toBeDefined();
  });

  it("accepts stdio as the only lifecycle transport", () => {
    const toolServer = createMockToolServer();
    const instance = createMCPServer({
      toolServer,
      transport: "stdio",
    });

    expect(instance.running).toBe(false);
  });

  it("lists real document-op tools from a zero-config editor", () => {
    const editor = createEditor();
    const toolServer = editor.internals.getSlot<ToolServer>(
      "document-ops:toolServer",
    )!;

    const toolNames = listMCPTools(toolServer).map((tool) => tool.name);

    expect(toolNames).toEqual(
      expect.arrayContaining([
        "read_document",
        "write_document",
        "get_context",
        "search_document",
        "list_block_types",
        "insert_block",
        "update_block",
        "delete_block",
        "move_block",
      ]),
    );

    editor.destroy();
  });

  it("executes real document-op tools against the editor document", async () => {
    const editor = createEditor();
    const toolServer = editor.internals.getSlot<ToolServer>(
      "document-ops:toolServer",
    )!;
    const ctx = createMockToolContext();

    const writeResult = await executeMCPTool(
      toolServer,
      "write_document",
      {
        blocks: [{ blockType: "paragraph", content: "Hello from MCP" }],
        position: "last",
      },
      ctx,
    );

    expect(writeResult.isError).toBeFalsy();
    expect(editor.lastBlock()?.textContent()).toBe("Hello from MCP");

    const insertedBlockId = editor.lastBlock()!.id;
    const deleteResult = await executeMCPTool(
      toolServer,
      "delete_block",
      { blockId: insertedBlockId },
      ctx,
    );

    expect(deleteResult.isError).toBeFalsy();
    expect(editor.getBlock(insertedBlockId)).toBeNull();

    const readResult = await executeMCPTool(
      toolServer,
      "read_document",
      { format: "summary" },
      ctx,
    );

    const summary = JSON.parse(textOf(readResult));
    expect(summary.blockCount).toBe(editor.blockCount());

    editor.destroy();
  });
});

describe("@pen/mcp createMCPRequestHandler", () => {
  it("creates SSE and streamable HTTP handlers", () => {
    const toolServer = createMockToolServer([echoTool()]);
    const handler = createMCPRequestHandler({ toolServer });

    expect(handler).toHaveProperty("handleSSE");
    expect(handler).toHaveProperty("handleStreamableHTTP");
  });

  it("throws when neither toolServer nor editor is provided", () => {
    expect(() => createMCPRequestHandler({})).toThrow(
      "MCP server helpers require either a toolServer or an editor with a toolServer",
    );
  });

  it("returns 400 for SSE POST requests without a sessionId", async () => {
    const toolServer = createMockToolServer([echoTool()]);
    const handler = createMCPRequestHandler({ toolServer, path: "/mcp/sse" });
    const request = createMockRequest({
      method: "POST",
      url: "/mcp/sse",
    });
    const response = createMockResponse();

    await handler.handleSSE(request, response);

    expect(response.writeHead).toHaveBeenCalledWith(400);
    expect(response.end).toHaveBeenCalledWith("Missing SSE sessionId");
  });

  it("returns 404 for unknown streamable HTTP sessions", async () => {
    const toolServer = createMockToolServer([echoTool()]);
    const handler = createMCPRequestHandler({
      toolServer,
      sessionIdGenerator: () => "session-1",
    });
    const request = createMockRequest({
      method: "POST",
      headers: { "mcp-session-id": "missing-session" },
    });
    const response = createMockResponse();

    await handler.handleStreamableHTTP(request, response);

    expect(response.writeHead).toHaveBeenCalledWith(404);
    expect(response.end).toHaveBeenCalledWith("Unknown MCP sessionId");
  });
});
