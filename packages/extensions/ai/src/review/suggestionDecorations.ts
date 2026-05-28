import type {
	BlockDecoration,
	Decoration,
	Editor,
	InlineDecoration,
} from "@pen/types";
import { readBlockSuggestionMeta } from "../suggestions/persistent";
import type { AIExtensionConfig } from "../types";
import {
	AI_REVIEW_ROLE_ATTRIBUTE,
	FINAL_TEXT_REVIEW_HIDDEN_ATTRIBUTE,
	type AIReviewPresentationRole,
} from "./reviewPresentationState";
import { AI_REVIEW_INSERT_STYLE } from "./reviewPresentationStyles";

interface InlineRange {
	from: number;
	to: number;
}

export interface SuggestionInlineRange extends InlineRange {
	action: "insert" | "delete";
	attributes: DecorationAttributes;
}

interface YTextLike {
	toDelta(): Array<{
		insert: string | object;
		attributes?: Record<string, unknown>;
	}>;
}

type SuggestionPresentation = NonNullable<
	AIExtensionConfig["suggestionPresentation"]
>;
type DecorationAttributes = Record<string, string | number | boolean>;

export function collectSuggestionDecorations(
	editor: Editor,
	suggestionPresentation: SuggestionPresentation,
): {
	decorations: Decoration[];
	suggestionRangesByBlock: Map<string, SuggestionInlineRange[]>;
	hasSuggestions: boolean;
} {
	const suggestionDecorations: Decoration[] = [];
	const suggestionRangesByBlock = new Map<string, SuggestionInlineRange[]>();
	let hasSuggestions = false;

	for (const block of editor.documentState.allBlocks()) {
		const blockSuggestion = readBlockSuggestionMeta(block);
		if (blockSuggestion) {
			hasSuggestions = true;
			const role = resolveBlockSuggestionRole(blockSuggestion.action);
			const blockDecoration: BlockDecoration = {
				type: "block",
				blockId: block.id,
				attributes: {
					class: `pen-block-suggestion pen-block-suggestion-${blockSuggestion.action}`,
					"data-suggestion-id": blockSuggestion.id,
					"data-suggestion-action": blockSuggestion.action,
					"data-suggestion-author-type": blockSuggestion.authorType,
					[AI_REVIEW_ROLE_ATTRIBUTE]: role,
				},
			};
			suggestionDecorations.push(blockDecoration);
		}

		const ranges = readSuggestionInlineRanges(
			editor,
			block.id,
			suggestionPresentation,
		);
		if (ranges.length > 0) {
			hasSuggestions = true;
			suggestionRangesByBlock.set(block.id, ranges);
			suggestionDecorations.push(
				...ranges.map((range) =>
					createSuggestionInlineDecoration(block.id, range),
				),
			);
		}
	}

	return {
		decorations: suggestionDecorations,
		suggestionRangesByBlock,
		hasSuggestions,
	};
}

export function readSuggestionInlineRanges(
	editor: Editor,
	blockId: string,
	suggestionPresentation: SuggestionPresentation,
): SuggestionInlineRange[] {
	const ytext = editor.internals.getBlockText(blockId) as YTextLike | null;
	if (!ytext || typeof ytext.toDelta !== "function") {
		return [];
	}

	const ranges: SuggestionInlineRange[] = [];
	let offset = 0;
	for (const delta of ytext.toDelta()) {
		const length =
			typeof delta.insert === "string" ? delta.insert.length : 1;
		const suggestion = delta.attributes?.suggestion as
			| Record<string, unknown>
			| undefined;
		if (suggestion && typeof suggestion.id === "string") {
			const action = suggestion.action === "delete" ? "delete" : "insert";
			ranges.push({
				action,
				from: offset,
				to: offset + length,
				attributes: buildSuggestionAttributes(
					action,
					suggestion,
					suggestionPresentation,
				),
			});
		}
		offset += length;
	}

	return ranges;
}

export function buildSuggestionAttributes(
	action: "insert" | "delete",
	suggestion: Record<string, unknown>,
	suggestionPresentation: SuggestionPresentation,
): DecorationAttributes {
	if (suggestionPresentation === "final-text") {
		return {
			class:
				action === "delete"
					? "pen-suggestion-delete pen-ai-review-delete"
					: "pen-suggestion-insert pen-suggestion-final-text-change pen-ai-review-insert",
			"data-suggestion-id": String(suggestion.id),
			"data-suggestion-action": action,
			"data-suggestion-author": String(suggestion.author ?? ""),
			"data-suggestion-author-type": String(
				suggestion.authorType ?? "user",
			),
			[AI_REVIEW_ROLE_ATTRIBUTE]:
				action === "delete" ? "delete-hidden" : "insert",
			...(action === "delete"
				? { [FINAL_TEXT_REVIEW_HIDDEN_ATTRIBUTE]: true }
				: {
						"data-pen-final-text-review-change": true,
						style: AI_REVIEW_INSERT_STYLE,
					}),
		};
	}

	return {
		class: `pen-suggestion-${action} pen-ai-review-${action}`,
		"data-suggestion-id": String(suggestion.id),
		"data-suggestion-action": action,
		"data-suggestion-author": String(suggestion.author ?? ""),
		"data-suggestion-author-type": String(suggestion.authorType ?? "user"),
		[AI_REVIEW_ROLE_ATTRIBUTE]: action,
	};
}

export function createSuggestionInlineDecoration(
	blockId: string,
	range: SuggestionInlineRange,
): InlineDecoration {
	return {
		type: "inline",
		blockId,
		from: range.from,
		to: range.to,
		attributes: range.attributes,
		omitFromRender:
			range.action === "delete" &&
			range.attributes[FINAL_TEXT_REVIEW_HIDDEN_ATTRIBUTE] === true,
	};
}

export function resolveBlockSuggestionRole(
	action: string,
): AIReviewPresentationRole {
	switch (action) {
		case "insert-block":
			return "block-insert";
		case "delete-block":
			return "block-delete";
		default:
			return "block-change";
	}
}
