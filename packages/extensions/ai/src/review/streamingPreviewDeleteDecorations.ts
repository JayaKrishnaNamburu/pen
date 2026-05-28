import type { BlockDecoration, InlineDecoration } from "@pen/types";
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

export function buildStreamingDeleteAttributes(
	suggestionPresentation: SuggestionPresentation,
): DecorationAttributes {
	if (suggestionPresentation === "final-text") {
		return {
			class: "pen-ai-review-preview-original",
			[AI_REVIEW_ROLE_ATTRIBUTE]: "delete-hidden",
			[FINAL_TEXT_REVIEW_HIDDEN_ATTRIBUTE]: true,
		};
	}

	return {
		class: "pen-ai-review-preview-original pen-suggestion-delete pen-ai-review-delete",
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
			class: "pen-block-suggestion pen-block-suggestion-delete-block",
			"data-suggestion-action": "delete-block",
			[AI_REVIEW_ROLE_ATTRIBUTE]: "block-delete",
		},
	};
}
