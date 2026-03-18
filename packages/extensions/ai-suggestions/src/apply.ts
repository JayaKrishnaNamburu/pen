import type { DocumentOp, Editor } from "@pen/types";
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
			type: "replace-text",
			blockId: suggestion.blockId,
			offset: suggestion.from,
			length: suggestion.to - suggestion.from,
			text: suggestion.replacementText,
		},
	];
}
