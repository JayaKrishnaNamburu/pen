import type { DocumentOp, Editor, OpOrigin } from "@pen/types";
import type { PersistentSuggestion } from "../types";
import { readAllSuggestions } from "./persistent";
import {
	AI_SESSION_SUGGESTION_ORIGIN,
	interceptApplyForSuggestMode,
} from "./suggestMode";

export type ApplySuggestedAIOperationsOptions = {
	operations: readonly DocumentOp[];
	author?: string;
	authorType?: "user" | "ai";
	model?: string;
	requestId?: string;
	sessionId?: string;
	turnId?: string;
	generationId?: string;
	suggestionIds?: readonly string[];
	createdAt?: number;
	origin?: OpOrigin;
	undoGroupId?: string;
};

export type ApplySuggestedAIOperationsResult = {
	suggestionIds: string[];
	suggestions: PersistentSuggestion[];
};

export function applySuggestedAIOperations(
	editor: Editor,
	options: ApplySuggestedAIOperationsOptions,
): ApplySuggestedAIOperationsResult {
	if (options.operations.length === 0) {
		return { suggestionIds: [], suggestions: [] };
	}

	const beforeSuggestionIds = new Set(
		readAllSuggestions(editor).map((suggestion) => suggestion.id),
	);
	const intercepted = interceptApplyForSuggestMode(
		[...options.operations],
		editor,
		options.author ?? "assistant",
		options.authorType ?? "ai",
		options.model,
		options.sessionId,
		{
			requestId: options.requestId,
			turnId: options.turnId,
			generationId: options.generationId,
			createdAt: options.createdAt,
			suggestionIds: options.suggestionIds,
		},
	);

	editor.apply(intercepted, {
		origin: options.origin ?? AI_SESSION_SUGGESTION_ORIGIN,
		...(options.undoGroupId
			? { undoGroupId: options.undoGroupId }
			: { undoGroup: true }),
	});

	const suggestions = readAllSuggestions(editor).filter(
		(suggestion) => !beforeSuggestionIds.has(suggestion.id),
	);

	return {
		suggestionIds: suggestions.map((suggestion) => suggestion.id),
		suggestions,
	};
}
