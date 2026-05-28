import type { AISession, GenerationState } from "../types";

export type AIReviewPresentationState =
	| "user-input"
	| "thinking"
	| "ai-writing"
	| "user-reviewing"
	| "resolved";

export type AIReviewPresentationRole =
	| "context"
	| "insert"
	| "delete-hidden"
	| "block-insert"
	| "block-delete"
	| "block-change"
	| "active-change"
	| "generation-zone";

export const AI_REVIEW_ROLE_ATTRIBUTE = "data-pen-ai-review-role";
export const AI_REVIEW_STATE_ATTRIBUTE = "data-pen-ai-review-state";
export const FINAL_TEXT_REVIEW_HIDDEN_ATTRIBUTE =
	"data-pen-final-text-review-hidden";
export const AI_REVIEW_PREVIEW_VIRTUAL_ATTRIBUTE =
	"data-pen-ai-review-preview-virtual";
export const AI_REVIEW_PREVIEW_NEW_ATTRIBUTE = "data-pen-ai-review-preview-new";

export function resolveAIReviewPresentationState({
	activeGeneration,
	activeSession,
	hasSuggestions,
}: {
	activeGeneration?: GenerationState | null;
	activeSession: AISession | null;
	hasSuggestions: boolean;
}): AIReviewPresentationState {
	if (
		!activeSession ||
		activeSession.surface !== "inline-edit" ||
		!activeSession.contextualPrompt?.composer.isOpen
	) {
		return "resolved";
	}

	if (hasSuggestions) {
		return "user-reviewing";
	}

	if (
		activeGeneration?.sessionId === activeSession.id &&
		activeGeneration.status === "streaming"
	) {
		return "ai-writing";
	}

	return "user-input";
}
