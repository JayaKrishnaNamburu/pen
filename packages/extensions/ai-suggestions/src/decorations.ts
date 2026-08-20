import type { InlineDecoration } from "@input/pen-types";
import type { AISuggestion, AISuggestionGroup } from "./types";

export function buildAISuggestionDecorations(
	suggestions: readonly AISuggestion[],
	activeSuggestionId: string | null,
	groups: readonly AISuggestionGroup[] = [],
): InlineDecoration[] {
	const groupIdBySuggestionId = new Map<string, string>();
	for (const group of groups) {
		for (const suggestionId of group.suggestionIds) {
			groupIdBySuggestionId.set(suggestionId, group.id);
		}
	}

	return suggestions
		.filter((suggestion) => !suggestion.invalidated && suggestion.to > suggestion.from)
		.map((suggestion) => {
			const isActive = suggestion.id === activeSuggestionId;
			const attributes: Record<string, string | number | boolean> = {
				class: isActive
					? "pen-ai-suggestion-underline pen-ai-suggestion-active"
					: "pen-ai-suggestion-underline pen-ai-suggestion-animated",
				"data-ai-suggestion-id": suggestion.id,
				"data-ai-suggestion-kind": suggestion.kind,
				"data-ai-suggestion-title": suggestion.title,
			};
			const groupId = groupIdBySuggestionId.get(suggestion.id);
			if (groupId) {
				attributes["data-ai-suggestion-group-id"] = groupId;
			}

			return {
				type: "inline" as const,
				blockId: suggestion.blockId,
				from: suggestion.from,
				to: suggestion.to,
				attributes,
			};
		});
}
