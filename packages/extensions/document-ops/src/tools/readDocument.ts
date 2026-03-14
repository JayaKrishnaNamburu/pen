import type { Editor, ToolDefinition } from "@pen/types";
import {
	exportDocumentRangeAsMarkdown,
	normalizeContextToolOptions,
	resolveDocumentBlocks,
	summarizeBlocks,
} from "../utils/documentContext";

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
					default: "summary",
				},
				range: {
					type: "object",
					properties: {
						startBlockId: { type: "string" },
						endBlockId: { type: "string" },
					},
				},
				includeSuggestions: {
					type: "boolean",
					default: false,
				},
			},
		},
		handler: async (input: unknown) => {
			const options = normalizeContextToolOptions(input);
			const viewMode = options.includeSuggestions ? "raw" : "resolved";
			const blocks = resolveDocumentBlocks(editor, options.range, viewMode);

			if (options.format === "summary") {
				return {
					format: "summary",
					viewMode,
					blockCount: blocks.length,
					types: [...new Set(blocks.map((block) => block.type))],
					preview: summarizeBlocks(blocks).map((block) => ({
						id: block.id,
						type: block.type,
						content: block.preview,
					})),
				};
			}

			if (options.format === "markdown") {
				return exportDocumentRangeAsMarkdown(editor, options.range, viewMode);
			}

			return {
				format: "json",
				viewMode,
				blockCount: blocks.length,
				blocks,
			};
		},
	};
}
