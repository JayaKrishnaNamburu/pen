import type { Decoration, Editor } from "@pen/types";
import {
	FINAL_TEXT_REVIEW_HIDDEN_ATTRIBUTE,
	buildAIReviewPresentationDecorations,
} from "../review/reviewPresentation";

export { FINAL_TEXT_REVIEW_HIDDEN_ATTRIBUTE };

export function buildFinalTextReviewDecorations(editor: Editor): Decoration[] {
	return buildAIReviewPresentationDecorations({
		editor,
		sessions: [],
		activeSessionId: null,
		suggestionPresentation: "final-text",
	});
}
