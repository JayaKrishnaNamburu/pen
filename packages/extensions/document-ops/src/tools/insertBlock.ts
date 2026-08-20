import {
  generateId,
  type DocumentOp,
  type Editor,
  type Position,
  type ToolDefinition,
} from "@input/pen-types";
import { POSITION_SCHEMA } from "../constants/toolSchemas";
import { assertToolCanUseBlockType } from "../utils/blockTypePolicy";
import { applyValidatedOps } from "../utils/payloadValidation";

export function insertBlockTool(editor: Editor): ToolDefinition {
  return {
    name: "insert_block",
    description: "Insert a new block at the specified position.",
    inputSchema: {
      type: "object",
      required: ["position", "blockType"],
      properties: {
        position: POSITION_SCHEMA,
        blockType: { type: "string" },
        props: { type: "object" },
        content: { type: "string" },
      },
    },
    handler: async (input: unknown) => {
      const opts = input as {
        position: Position;
        blockType: string;
        props?: Record<string, unknown>;
        content?: string;
      };
      assertToolCanUseBlockType(editor, opts.blockType);
      const blockId = generateId();
      const ops: DocumentOp[] = [
        {
          type: "insert-block",
          blockId,
          blockType: opts.blockType,
          props: opts.props ?? {},
          position: opts.position,
        },
      ];

      if (opts.content) {
        ops.push({
          type: "insert-text",
          blockId,
          offset: 0,
          text: opts.content,
        });
      }

      applyValidatedOps(editor, ops, { origin: "ai" });

      return { blockId };
    },
  };
}
