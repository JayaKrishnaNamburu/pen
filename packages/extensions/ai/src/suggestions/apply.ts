import type { DocumentOp, Editor } from "@input/pen-types";
import type { AISuggestion } from "./types";

export function buildApplySuggestionOps(
	editor: Editor,
	suggestion: AISuggestion,
): DocumentOp[] {
	const block = editor.getBlock(suggestion.blockId);
	if (!block) {
		return [];
	}

	const currentText = block
		.textContent({ resolved: true })
		.slice(suggestion.from, suggestion.to);
	if (currentText !== suggestion.originalText) {
		return [];
	}

	return [
		{
			type: "splice-text",
			blockId: suggestion.blockId,
			from: suggestion.from,
			to: suggestion.from + suggestion.to - suggestion.from,
			insert: suggestion.replacementText,
		},
	];
}
