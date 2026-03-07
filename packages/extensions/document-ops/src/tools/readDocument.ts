import type { Editor, ToolDefinition } from "@pen/types";

export function readDocumentTool(editor: Editor): ToolDefinition {
  return {
    name: "read_document",
    description: "Read document content in the specified format.",
    inputSchema: {
      type: "object",
      properties: {
        format: {
          type: "string",
          enum: ["json", "markdown", "summary"],
          default: "markdown",
        },
        range: {
          type: "object",
          properties: {
            startBlockId: { type: "string" },
            endBlockId: { type: "string" },
          },
        },
      },
    },
    handler: async (input: unknown) => {
      const opts = (input ?? {}) as Record<string, unknown>;
      const format = (opts.format as string) ?? "markdown";
      const blocks: Array<{
        id: string;
        type: string;
        props: Record<string, unknown>;
        content: string;
      }> = [];

      for (const handle of editor.blocks()) {
        blocks.push({
          id: handle.id,
          type: handle.type,
          props: handle.props,
          content: handle.textContent(),
        });
      }

      if (format === "summary") {
        return {
          blockCount: editor.blockCount(),
          types: [...new Set(blocks.map((b) => b.type))],
          preview: blocks.slice(0, 5).map((b) => ({
            type: b.type,
            content: b.content.slice(0, 100),
          })),
        };
      }

      return blocks;
    },
  };
}
