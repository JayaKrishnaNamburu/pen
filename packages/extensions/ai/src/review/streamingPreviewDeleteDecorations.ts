import type { BlockDecoration, InlineDecoration } from "@input/pen-types";
import {
	REVIEW_SURFACE_BLOCK_SUGGESTION_CLASSES,
	REVIEW_SURFACE_CLASSES,
} from "@input/pen-types";
import type { AIExtensionConfig } from "../types";
import {
	AI_REVIEW_ROLE_ATTRIBUTE,
	FINAL_TEXT_REVIEW_HIDDEN_ATTRIBUTE,
} from "./reviewPresentationState";

type SuggestionPresentation = NonNullable<
	AIExtensionConfig["suggestionPresentation"]
>;
type DecorationAttributes = Record<string, string | number | boolean>;

export function createStreamingDeleteDecoration({
	blockId,
	from,
	suggestionPresentation,
	to,
}: {
	blockId: string;
	from: number;
	suggestionPresentation: SuggestionPresentation;
	to: number;
}): InlineDecoration {
	return {
		type: "inline",
		blockId,
		from,
		to,
		attributes: buildStreamingDeleteAttributes(suggestionPresentation),
		omitFromRender: suggestionPresentation === "final-text",
	};
}

function buildStreamingDeleteAttributes(
	suggestionPresentation: SuggestionPresentation,
): DecorationAttributes {
	if (suggestionPresentation === "final-text") {
		return {
			class: REVIEW_SURFACE_CLASSES.previewOriginal,
			[AI_REVIEW_ROLE_ATTRIBUTE]: "delete-hidden",
			[FINAL_TEXT_REVIEW_HIDDEN_ATTRIBUTE]: true,
		};
	}

	return {
		class: [
			REVIEW_SURFACE_CLASSES.previewOriginal,
			REVIEW_SURFACE_CLASSES.suggestionDelete,
			REVIEW_SURFACE_CLASSES.reviewDelete,
		].join(" "),
		[AI_REVIEW_ROLE_ATTRIBUTE]: "delete",
	};
}

export function createStreamingDeleteBlockDecoration(
	blockId: string,
): BlockDecoration {
	return {
		type: "block",
		blockId,
		attributes: {
			class: [
				REVIEW_SURFACE_CLASSES.blockSuggestion,
				REVIEW_SURFACE_BLOCK_SUGGESTION_CLASSES["delete-block"],
			].join(" "),
			"data-suggestion-action": "delete-block",
			[AI_REVIEW_ROLE_ATTRIBUTE]: "block-delete",
		},
	};
}
