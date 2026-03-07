import type { Editor, ToolDefinition, Position } from "@pen/types";

export function writeDocumentTool(editor: Editor): ToolDefinition {
  return {
    name: "write_document",
    description:
      "Write or replace content in the document using blocks.",
    inputSchema: {
      type: "object",
      required: ["blocks"],
      properties: {
        blocks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              blockType: { type: "string" },
              content: { type: "string" },
              props: { type: "object" },
            },
          },
        },
        position: {},
      },
    },
    handler: async (input: unknown) => {
      const opts = input as {
        blocks: Array<{
          blockType: string;
          content?: string;
          props?: Record<string, unknown>;
        }>;
        position?: Position;
      };

      const insertedIds: string[] = [];
      let position = opts.position ?? ("last" as const);

      for (const block of opts.blocks) {
        const blockId = crypto.randomUUID();
        editor.apply(
          [
            {
              type: "insert-block",
              blockId,
              blockType: block.blockType,
              props: block.props ?? {},
              position,
            },
          ],
          { origin: "ai" },
        );

        if (block.content) {
          editor.apply(
            [
              {
                type: "insert-text",
                blockId,
                offset: 0,
                text: block.content,
              },
            ],
            { origin: "ai" },
          );
        }

        insertedIds.push(blockId);
        position = { after: blockId };
      }

      return { blockIds: insertedIds };
    },
  };
}
