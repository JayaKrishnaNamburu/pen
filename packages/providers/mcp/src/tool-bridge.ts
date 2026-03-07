import type { ToolDefinition, ToolServer, ToolContext } from "@pen/types";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

interface MCPToolDescriptor {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export function toolDefinitionToMCPDescriptor(
  def: ToolDefinition,
): MCPToolDescriptor {
  return {
    name: def.name,
    description: def.description,
    inputSchema: normalizeInputSchema(def.inputSchema),
  };
}

export function listMCPTools(toolServer: ToolServer): MCPToolDescriptor[] {
  return toolServer.listTools().map(toolDefinitionToMCPDescriptor);
}

export async function executeMCPTool(
  toolServer: ToolServer,
  name: string,
  input: unknown,
  context: ToolContext,
): Promise<CallToolResult> {
  try {
    const result = toolServer.executeTool(name, input, context);

    if (isAsyncIterable(result)) {
      const parts: unknown[] = [];
      for await (const part of result) {
        parts.push(part);
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(parts.length === 1 ? parts[0] : parts),
          },
        ],
      };
    }

    const resolved = await result;
    return {
      content: [
        {
          type: "text",
          text:
            typeof resolved === "string"
              ? resolved
              : JSON.stringify(resolved),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

function normalizeInputSchema(
  schema: unknown,
): {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
} {
  if (
    typeof schema === "object" &&
    schema !== null &&
    (schema as { type?: string }).type === "object"
  ) {
    return schema as {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  }

  return {
    type: "object",
    properties: {
      input: schema as Record<string, unknown>,
    },
  };
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    value != null &&
    typeof value === "object" &&
    Symbol.asyncIterator in (value as object)
  );
}
