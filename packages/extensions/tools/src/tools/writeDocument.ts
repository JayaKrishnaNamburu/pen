import type {
	DocumentOp,
	Editor,
	Position,
	ToolDefinition,
} from "@input/pen-types";
import type {
	DocumentWriteBlockInput,
	DocumentWriteFormat,
} from "@input/pen-ingest";
import { buildDocumentWriteOps } from "@input/pen-ingest";
import { POSITION_SCHEMA } from "../constants/toolSchemas";
import { assertToolCanUseBlockType } from "../utils/blockTypePolicy";
import { applyValidatedOps } from "../utils/payloadValidation";
import { rejectToolCall } from "../utils/toolRejection";

export function writeDocumentTool(editor: Editor): ToolDefinition {
	return {
		name: "write_document",
		description:
			"Insert content written as text, markdown, or blocks. Pass replaceBlockIds to swap existing blocks for the new content in place; without it the content is only inserted at the given position.",
		mutating: true,
		destructive: true,
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
				replaceBlockIds: {
					type: "array",
					items: { type: "string" },
					description:
						"Existing block ids the new content replaces. New content lands where the first replaced block was.",
				},
			},
		},
		handler: async (input: unknown) => {
			const opts = input as {
				format?: DocumentWriteFormat;
				content?: string;
				blocks?: DocumentWriteBlockInput[];
				position?: Position;
				replaceBlockIds?: string[];
			};

			if (!opts.content && (!opts.blocks || opts.blocks.length === 0)) {
				rejectToolCall(
					editor,
					'write_document expects either a non-empty "content" string or a non-empty "blocks" array.',
					opts,
				);
			}

			if (
				(opts.format === "blocks" || opts.format == null) &&
				opts.blocks
			) {
				for (const block of opts.blocks) {
					assertToolCanUseBlockType(editor, block.blockType);
				}
			}

			const replaceBlockIds = [...new Set(opts.replaceBlockIds ?? [])];
			for (const blockId of replaceBlockIds) {
				if (!editor.getBlock(blockId)) {
					rejectToolCall(
						editor,
						`write_document cannot replace unknown block "${blockId}".`,
						opts,
					);
				}
			}

			const { ops } = buildDocumentWriteOps(editor, {
				format: opts.format,
				content: opts.content,
				blocks: opts.blocks,
				position:
					opts.position ??
					(replaceBlockIds.length > 0
						? { before: replaceBlockIds[0] }
						: "last"),
				surface: "write-document",
			});
			const insertedIds = ops
				.filter((op) => op.type === "insert-block")
				.map((op) => op.blockId);
			const allOps = [
				...ops,
				...replaceBlockIds.map(
					(blockId) =>
						({
							type: "delete-block",
							blockId,
						}) satisfies DocumentOp,
				),
			];

			applyValidatedOps(editor, allOps, { origin: "ai" });

			return { blockIds: insertedIds, replacedBlockIds: replaceBlockIds };
		},
	};
}
