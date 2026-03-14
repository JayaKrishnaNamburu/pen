import type { Editor, ToolDefinition } from "@pen/types";
import {
	DEFAULT_SEARCH_MAX_RESULTS,
	MAX_TOOL_RESULT_LIMIT,
	normalizeToolResultLimit,
} from "../constants/toolSchemas";
import { listDocumentBlockHandles } from "../utils/documentContext";

export function searchDocumentTool(editor: Editor): ToolDefinition {
	return {
		name: "search_document",
		description: "Search for text in the document.",
		inputSchema: {
			type: "object",
			required: ["query"],
			properties: {
				query: { type: "string", minLength: 1 },
				caseSensitive: { type: "boolean" },
				maxResults: {
					type: "number",
					default: DEFAULT_SEARCH_MAX_RESULTS,
					minimum: 1,
					maximum: MAX_TOOL_RESULT_LIMIT,
				},
			},
		},
		handler: async (input: unknown) => {
			const opts = input as {
				query: string;
				caseSensitive?: boolean;
				maxResults?: number;
			};
			const query = opts.query.trim();
			if (query.length === 0) {
				throw new Error("search_document query must be non-empty.");
			}
			const caseSensitive = opts.caseSensitive ?? false;
			const maxResults = normalizeToolResultLimit(
				opts.maxResults,
				DEFAULT_SEARCH_MAX_RESULTS,
			);
			const results: Array<{
				blockId: string;
				offset: number;
				length: number;
				snippet: string;
			}> = [];

			const searchStr = caseSensitive
				? query
				: query.toLowerCase();

			for (const handle of listDocumentBlockHandles(editor)) {
				const text = handle.textContent({ resolved: true });
				const compareText = caseSensitive
					? text
					: text.toLowerCase();
				let offset = 0;

				while (results.length < maxResults) {
					const idx = compareText.indexOf(searchStr, offset);
					if (idx === -1) break;
					results.push({
						blockId: handle.id,
						offset: idx,
						length: query.length,
						snippet: text.slice(
							Math.max(0, idx - 30),
							Math.min(
								text.length,
								idx + query.length + 30,
							),
						),
					});
					offset = idx + 1;
				}

				if (results.length >= maxResults) break;
			}

			return results;
		},
	};
}
