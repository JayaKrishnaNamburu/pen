import type { DocumentOp, Editor, OpOrigin } from "@pen/types";
import type { PersistentSuggestion } from "../types";
import {
	AI_SESSION_SUGGESTION_ORIGIN,
	interceptApplyForSuggestModeWithMetadata,
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

	const intercepted = interceptApplyForSuggestModeWithMetadata(
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

	editor.apply(intercepted.operations, {
		origin: options.origin ?? AI_SESSION_SUGGESTION_ORIGIN,
		...(options.undoGroupId
			? { undoGroupId: options.undoGroupId }
			: { undoGroup: true }),
	});

	return {
		suggestionIds: intercepted.suggestionIds,
		suggestions: intercepted.suggestions,
	};
}
