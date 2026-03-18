import { DEFAULT_GROUP_GAP_CHARS } from "./constants";
import type {
	AISuggestion,
	AISuggestionGroup,
	AISuggestionsExtensionConfig,
} from "./types";

export function buildSuggestionGroups(
	suggestions: readonly AISuggestion[],
	config: AISuggestionsExtensionConfig = {},
): readonly AISuggestionGroup[] {
	const gapChars = config.groupGapChars ?? DEFAULT_GROUP_GAP_CHARS;
	const validSuggestions = suggestions
		.filter((suggestion) => !suggestion.invalidated)
		.sort((left, right) => {
			if (left.blockId !== right.blockId) {
				return left.blockId.localeCompare(right.blockId);
			}
			if (left.from !== right.from) {
				return left.from - right.from;
			}
			return left.to - right.to;
		});

	const groups: AISuggestionGroup[] = [];
	let currentGroup: AISuggestion[] = [];

	for (const suggestion of validSuggestions) {
		const previousSuggestion = currentGroup[currentGroup.length - 1];
		if (!previousSuggestion) {
			currentGroup = [suggestion];
			continue;
		}

		if (
			previousSuggestion.blockId === suggestion.blockId &&
			suggestion.from <= previousSuggestion.to + gapChars
		) {
			currentGroup.push(suggestion);
			continue;
		}

		groups.push(createSuggestionGroup(currentGroup));
		currentGroup = [suggestion];
	}

	if (currentGroup.length > 0) {
		groups.push(createSuggestionGroup(currentGroup));
	}

	return groups;
}

function createSuggestionGroup(
	suggestions: readonly AISuggestion[],
): AISuggestionGroup {
	const firstSuggestion = suggestions[0]!;
	const lastSuggestion = suggestions[suggestions.length - 1]!;
	const kinds = new Set(suggestions.map((suggestion) => suggestion.kind));
	const groupKind = kinds.size === 1 ? firstSuggestion.kind : "mixed";

	return {
		id: suggestions.map((suggestion) => suggestion.id).join(":"),
		blockId: firstSuggestion.blockId,
		suggestionIds: suggestions.map((suggestion) => suggestion.id),
		kind: groupKind,
		title: groupKind === "mixed" ? "Suggestions" : firstSuggestion.title,
		from: firstSuggestion.from,
		to: lastSuggestion.to,
	};
}
