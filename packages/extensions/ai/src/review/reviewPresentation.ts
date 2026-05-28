import type { Decoration, Editor } from "@pen/types";
import type {
	AIExtensionConfig,
	AISession,
	AIStreamingReviewPreview,
	GenerationState,
} from "../types";
import {
	buildContextDecorations,
	shouldShowSelectionContext,
} from "./contextDecorations";
import {
	resolveAIReviewPresentationState,
	AI_REVIEW_PREVIEW_NEW_ATTRIBUTE,
	AI_REVIEW_PREVIEW_VIRTUAL_ATTRIBUTE,
	AI_REVIEW_ROLE_ATTRIBUTE,
	AI_REVIEW_STATE_ATTRIBUTE,
	FINAL_TEXT_REVIEW_HIDDEN_ATTRIBUTE,
} from "./reviewPresentationState";
import { collectSuggestionDecorations } from "./suggestionDecorations";
import { buildStreamingReviewPreviewDecorations } from "./streamingPreviewDecorations";

export {
	AI_REVIEW_PREVIEW_NEW_ATTRIBUTE,
	AI_REVIEW_PREVIEW_VIRTUAL_ATTRIBUTE,
	AI_REVIEW_ROLE_ATTRIBUTE,
	AI_REVIEW_STATE_ATTRIBUTE,
	FINAL_TEXT_REVIEW_HIDDEN_ATTRIBUTE,
	resolveAIReviewPresentationState,
} from "./reviewPresentationState";
export type {
	AIReviewPresentationRole,
	AIReviewPresentationState,
} from "./reviewPresentationState";
export { buildStreamingReviewPreviewDecorations } from "./streamingPreviewDecorations";

export function buildAIReviewPresentationDecorations({
	activeGeneration,
	activeSessionId,
	editor,
	sessions,
	suggestionPresentation,
	streamingReviewPreview,
}: {
	activeGeneration?: GenerationState | null;
	activeSessionId: string | null | undefined;
	editor: Editor;
	sessions: readonly AISession[];
	suggestionPresentation: NonNullable<
		AIExtensionConfig["suggestionPresentation"]
	>;
	streamingReviewPreview?: AIStreamingReviewPreview | null;
}): Decoration[] {
	const activeSession =
		sessions.find((session) => session.id === activeSessionId) ?? null;
	const {
		decorations: suggestionDecorations,
		suggestionRangesByBlock,
		hasSuggestions,
	} = collectSuggestionDecorations(editor, suggestionPresentation);

	const reviewState = resolveAIReviewPresentationState({
		activeGeneration,
		activeSession,
		hasSuggestions,
	});
	const hasActiveStreamingReviewPreview =
		activeSession != null &&
		streamingReviewPreview?.sessionId === activeSession.id;
	const contextDecorations = shouldShowSelectionContext({
		hasActiveStreamingReviewPreview,
		hasSuggestions,
		suggestionPresentation,
	})
		? buildContextDecorations({
				activeSession,
				editor,
				reviewState,
				suggestionRangesByBlock,
			})
		: [];
	const previewDecorations = hasActiveStreamingReviewPreview
		? buildStreamingReviewPreviewDecorations({
				editor,
				preview: streamingReviewPreview,
				suggestionPresentation,
			})
		: [];

	return [
		...suggestionDecorations,
		...contextDecorations,
		...previewDecorations,
	];
}
