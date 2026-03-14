import type { Editor, ToolDefinition } from "@pen/types";
import {
	DEFAULT_RETRIEVE_SPANS_MAX_RESULTS,
	MAX_TOOL_RESULT_LIMIT,
	normalizeToolResultLimit,
} from "../constants/toolSchemas";
import { retrieveDocumentSpans } from "../utils/retrieveDocumentSpans";

export function retrieveDocumentSpansTool(editor: Editor): ToolDefinition {
	return {
		name: "retrieve_document_spans",
		description:
			"Retrieve ranked document spans relevant to a natural-language query.",
		inputSchema: {
			type: "object",
			required: ["query"],
			properties: {
				query: { type: "string", minLength: 1 },
				maxResults: {
					type: "number",
					default: DEFAULT_RETRIEVE_SPANS_MAX_RESULTS,
					minimum: 1,
					maximum: MAX_TOOL_RESULT_LIMIT,
				},
				includeSuggestions: { type: "boolean", default: false },
				activeBlockId: { type: "string" },
				targetBlockId: { type: "string" },
			},
		},
		handler: async (input: unknown) => {
			const opts = (input ?? {}) as {
				query: string;
				maxResults?: number;
				includeSuggestions?: boolean;
				activeBlockId?: string;
				targetBlockId?: string;
			};
			const query = opts.query.trim();
			if (query.length === 0) {
				throw new Error("retrieve_document_spans query must be non-empty.");
			}
			return {
				query,
				viewMode: opts.includeSuggestions ? "raw" : "resolved",
				spans: retrieveDocumentSpans(editor, {
					query,
					maxResults: normalizeToolResultLimit(
						opts.maxResults,
						DEFAULT_RETRIEVE_SPANS_MAX_RESULTS,
					),
					viewMode: opts.includeSuggestions ? "raw" : "resolved",
					activeBlockId: opts.activeBlockId ?? null,
					targetBlockId: opts.targetBlockId ?? null,
				}),
			};
		},
	};
}
