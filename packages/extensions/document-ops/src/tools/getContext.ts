import type { Editor, ToolDefinition } from "@pen/types";
import {
	buildCursorContext,
	exportDocumentRangeAsMarkdown,
	normalizeContextToolOptions,
	resolveDocumentBlocks,
	summarizeBlocks,
} from "../utils/documentContext";

export function getContextTool(editor: Editor): ToolDefinition {
	return {
		name: "get_context",
		description:
			"Get document context in summary, json, or markdown form with optional selection details.",
		inputSchema: {
			type: "object",
			properties: {
				format: {
					type: "string",
					enum: ["summary", "json", "markdown"],
					default: "summary",
				},
				includeSelection: {
					type: "boolean",
					default: false,
				},
				includeSuggestions: {
					type: "boolean",
					default: false,
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
			const options = normalizeContextToolOptions(input);
			const viewMode = options.includeSuggestions ? "raw" : "resolved";
			const blocks = resolveDocumentBlocks(editor, options.range, viewMode);
			const cursorContext = buildCursorContext(editor, viewMode);
			const selectionPayload = options.includeSelection
				? {
					selection: cursorContext.selection,
					selectedText: cursorContext.selectedText,
					activeBlockId: cursorContext.activeBlockId,
					activeBlockType: cursorContext.activeBlockType,
					surroundingBlocks: cursorContext.surroundingBlocks,
					structuredTarget: cursorContext.structuredTarget,
				}
				: {};

			if (options.format === "markdown") {
				return {
					format: "markdown",
					viewMode,
					blockCount: blocks.length,
					markdown: exportDocumentRangeAsMarkdown(editor, options.range, viewMode),
					...selectionPayload,
				};
			}

			if (options.format === "json") {
				return {
					format: "json",
					viewMode,
					blockCount: blocks.length,
					blocks,
					...selectionPayload,
				};
			}

			return {
				format: "summary",
				viewMode,
				blockCount: blocks.length,
				types: [...new Set(blocks.map((block) => block.type))],
				blocks: summarizeBlocks(blocks),
				...selectionPayload,
			};
		},
	};
}
