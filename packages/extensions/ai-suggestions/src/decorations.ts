import type { InlineDecoration } from "@pen/types";
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
				style: isActive
					? [
						"cursor: pointer",
						"--pen-ai-suggestion-line: #1d4ed8",
						"--pen-ai-suggestion-line-hover: #1e40af",
						"background-image: linear-gradient(90deg, var(--pen-ai-suggestion-line), var(--pen-ai-suggestion-line))",
						"background-repeat: no-repeat",
						"background-size: 100% 2px",
						"background-position: 0 100%",
					].join("; ")
					: [
						"cursor: pointer",
						"--pen-ai-suggestion-line: #3b82f6",
						"--pen-ai-suggestion-line-hover: #1d4ed8",
						"background-image: linear-gradient(90deg, var(--pen-ai-suggestion-line), var(--pen-ai-suggestion-line))",
						"background-repeat: no-repeat",
						"background-size: 100% 2px",
						"background-position: 0 100%",
					].join("; "),
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
