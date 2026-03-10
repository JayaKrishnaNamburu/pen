import { describe, expect, it } from "vitest";

import { ToolServerImpl } from "../toolServer";

describe("@pen/document-ops ToolServerImpl", () => {
  it("throws for unknown tools", async () => {
    const server = new ToolServerImpl();

    await expect(
      server.executeTool(
        "missing_tool",
        {},
        {} as never,
      ),
    ).rejects.toThrow('Unknown tool: "missing_tool"');
  });

  it("validates required input fields", async () => {
    const server = new ToolServerImpl();
    server.registerTool({
      name: "echo",
      description: "Echo input",
      inputSchema: {
        type: "object",
        required: ["value"],
        properties: {
          value: { type: "string" },
        },
      },
      handler: async (input) => input,
    });

    await expect(
      server.executeTool("echo", {}, {} as never),
    ).rejects.toThrow('Missing required field: "value"');
  });
});
