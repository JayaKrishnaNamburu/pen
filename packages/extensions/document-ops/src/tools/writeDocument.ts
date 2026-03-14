import type { Editor, Position, ToolDefinition } from "@pen/types";
import type {
	DocumentWriteBlockInput,
	DocumentWriteFormat,
} from "@pen/content-ops";
import { buildDocumentWriteOps } from "@pen/content-ops";
import { POSITION_SCHEMA } from "../constants/toolSchemas";
import { assertToolCanUseBlockType } from "../utils/blockTypePolicy";

export function writeDocumentTool(editor: Editor): ToolDefinition {
  return {
    name: "write_document",
    description:
      "Write or replace content in the document using text, markdown, or blocks.",
    inputSchema: {
      type: "object",
      properties: {
        format: {
          type: "string",
          enum: ["text", "markdown", "blocks"],
        },
        content: { type: "string" },
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
        position: POSITION_SCHEMA,
      },
    },
    handler: async (input: unknown) => {
      const opts = input as {
        format?: DocumentWriteFormat;
        content?: string;
        blocks?: DocumentWriteBlockInput[];
        position?: Position;
      };

      if (!opts.content && (!opts.blocks || opts.blocks.length === 0)) {
        throw new Error(
          'write_document expects either a non-empty "content" string or a non-empty "blocks" array.',
        );
      }

      if ((opts.format === "blocks" || opts.format == null) && opts.blocks) {
        for (const block of opts.blocks) {
          assertToolCanUseBlockType(editor, block.blockType);
        }
      }

      const { ops } = buildDocumentWriteOps(editor, {
        format: opts.format,
        content: opts.content,
        blocks: opts.blocks,
        position: opts.position ?? "last",
        surface: "write-document",
      });
      const insertedIds = ops
        .filter((op) => op.type === "insert-block")
        .map((op) => op.blockId);

      if (ops.length > 0) {
        editor.apply(ops, { origin: "ai" });
      }

      return { blockIds: insertedIds };
    },
  };
}
