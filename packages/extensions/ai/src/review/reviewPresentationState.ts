import type { AISession, GenerationState } from "../types";

export type AIReviewPresentationState =
	| "user-input"
	| "ai-writing"
	| "user-reviewing"
	| "resolved";

export type AIReviewPresentationRole =
	| "context"
	| "insert"
	| "delete"
	| "delete-hidden"
	| "block-insert"
	| "block-delete"
	| "block-change";

export const AI_REVIEW_ROLE_ATTRIBUTE = "data-pen-ai-review-role";
export const AI_REVIEW_STATE_ATTRIBUTE = "data-pen-ai-review-state";
export const FINAL_TEXT_REVIEW_HIDDEN_ATTRIBUTE =
	"data-pen-final-text-review-hidden";
export const AI_REVIEW_PREVIEW_VIRTUAL_ATTRIBUTE =
	"data-pen-ai-review-preview-virtual";

/** Fields the posture resolver actually reads. */
export type AIReviewPostureSession = {
	id: string;
	surface: AISession["surface"];
	contextualPrompt?: { composer: { isOpen: boolean } };
};

export function resolveAIReviewPresentationState({
	activeGeneration,
	activeSession,
	hasSuggestions,
}: {
	activeGeneration?: {
		status: GenerationState["status"];
		sessionId?: string;
	} | null;
	activeSession: AIReviewPostureSession | null;
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
