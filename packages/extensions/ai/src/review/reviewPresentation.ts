import type { Decoration, Editor } from "@input/pen-types";
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
import { resolveAIReviewPresentationState } from "./reviewPresentationState";
import { collectSuggestionDecorations } from "./suggestionDecorations";
import { buildStreamingReviewPreviewDecorations } from "./streamingPreviewDecorations";

export {
	buildStreamingReviewPreviewDecorations,
	resolveAIReviewPresentationState,
};

export function buildAIReviewPresentationDecorations({
	activeGeneration,
	activeSessionId,
	editor,
	sessions,
	suggestionPresentation,
	streamingReviewPreviews,
}: {
	activeGeneration?: GenerationState | null;
	activeSessionId: string | null | undefined;
	editor: Editor;
	sessions: readonly AISession[];
	suggestionPresentation: NonNullable<
		AIExtensionConfig["suggestionPresentation"]
	>;
	streamingReviewPreviews?: readonly AIStreamingReviewPreview[];
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
	// A preview belongs to a turn, and a turn does not always have a session:
	// chat prompts run a generation with no session row at all. Asking for one
	// here meant the surface most edits arrive through built its preview and
	// then dropped it, so the edit only ever appeared as the finished replace.
	// The controller stamps the preview with `sessionId ?? id`; read it back
	// the same way rather than through a row that may not exist.
	const streamingPreviewOwnerId =
		activeGeneration != null
			? (activeGeneration.sessionId ?? activeGeneration.id)
			: (activeSession?.id ?? null);
	// Every operation of the streaming call is on screen at once: one has
	// finished arriving while the next is still coming, and neither is written
	// until the call closes (EC15).
	const activePreviews =
		streamingPreviewOwnerId == null
			? []
			: (streamingReviewPreviews ?? []).filter(
					(preview) => preview.sessionId === streamingPreviewOwnerId,
				);
	const hasActiveStreamingReviewPreview = activePreviews.length > 0;
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
	const previewDecorations = activePreviews.flatMap((preview) =>
		buildStreamingReviewPreviewDecorations({
			editor,
			preview,
			suggestionPresentation,
		}),
	);

	return [
		...suggestionDecorations,
		...contextDecorations,
		...previewDecorations,
	];
}
