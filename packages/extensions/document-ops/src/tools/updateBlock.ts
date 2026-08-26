import { convertBlockOps } from "@input/pen-core";
import type { DocumentOp, Editor, ToolDefinition } from "@input/pen-types";
import { assertToolCanUseBlockType } from "../utils/blockTypePolicy";
import { assertToolCanMutateBlock } from "../utils/mutationPolicy";
import { applyValidatedOps } from "../utils/payloadValidation";
import { rejectToolCall } from "../utils/toolRejection";

export function updateBlockTool(editor: Editor): ToolDefinition {
	return {
		name: "update_block",
		description:
			"Update an existing block in place: replace its text with `content`, convert it with `blockType` (e.g. paragraph to heading), and/or set `props`. Keeps the block's identity and position.",
		mutating: true,
		inputSchema: {
			type: "object",
			required: ["blockId"],
			properties: {
				blockId: { type: "string" },
				content: {
					type: "string",
					description:
						"New plain text for the block, replacing current text.",
				},
				blockType: {
					type: "string",
					description: "Convert the block to this type.",
				},
				props: { type: "object" },
			},
		},
		handler: async (input: unknown) => {
			const opts = input as {
				blockId: string;
				content?: string;
				blockType?: string;
				props?: Record<string, unknown>;
			};
			assertToolCanMutateBlock(editor, opts.blockId);
			if (
				opts.content == null &&
				opts.blockType == null &&
				opts.props == null
			) {
				rejectToolCall(
					editor,
					'update_block expects at least one of "content", "blockType", or "props".',
					opts,
				);
			}

			const ops: DocumentOp[] = [];
			if (opts.blockType != null) {
				assertToolCanUseBlockType(editor, opts.blockType);
				ops.push(
					...convertBlockOps(editor, {
						blockId: opts.blockId,
						newType: opts.blockType,
						newProps: opts.props,
					}),
				);
			} else if (opts.props != null) {
				ops.push({
					type: "set-props",
					blockId: opts.blockId,
					props: opts.props,
				});
			}
			if (opts.content != null) {
				const block = editor.getBlock(opts.blockId);
				ops.push({
					type: "splice-text",
					blockId: opts.blockId,
					from: 0,
					to: block?.length() ?? 0,
					insert: opts.content,
				});
			}

			applyValidatedOps(editor, ops, { origin: "ai" });
			return { success: true };
		},
	};
}
