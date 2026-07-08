import type { Decoration, Editor } from "@input/pen-types";
import { buildAIReviewPresentationDecorations } from "../review/reviewPresentation";

export function buildTrackChangesDecorations(editor: Editor): Decoration[] {
	return buildAIReviewPresentationDecorations({
		editor,
		sessions: [],
		activeSessionId: null,
		suggestionPresentation: "track-changes",
	});
}
