import type { Editor } from "@pen/types";
import type { AIStreamingReviewPreview } from "../../types";
import {
	normalizeReplacementRange,
	readBlockRangeOriginalText,
	resolveSelectedRangeTextFragments,
	splitReplacementParagraphs,
	type NormalizedReplacementRange,
	type ReplacementRangeBlock,
} from "./replacementRange";
import {
	countSharedPrefixLength,
	countSharedSuffixLength,
	findStreamingPreviewResyncAnchor,
} from "./sharedTextDiff";

export interface TextRangeStreamingPreviewPlan {
	kind: "text-range";
	blockId: string;
	deleteFrom: number;
	deleteTo: number;
	insertedTextStart: number;
	insertOffset: number;
	text: string;
}

export interface BlockRangeStreamingPreviewPlan {
	kind: "block-range";
	normalizedRange: {
		start: { blockId: string; offset: number };
		end: { blockId: string; offset: number };
		middleBlockIds: string[];
	};
	deleteFromChar: number;
	deleteToChar: number;
	insertedTextStart: number;
	insertText: string;
}

export interface AlignedBlockRangeStreamingPreviewPlan {
	kind: "aligned-block-range";
	plans: TextRangeStreamingPreviewPlan[];
}

export type StreamingPreviewPlanResult =
	| TextRangeStreamingPreviewPlan
	| BlockRangeStreamingPreviewPlan
	| AlignedBlockRangeStreamingPreviewPlan;

export function buildStreamingPreviewPlan(
	editor: Editor,
	preview: AIStreamingReviewPreview,
): StreamingPreviewPlanResult | null {
	if (preview.target.kind === "text-range") {
		return buildTextRangeStreamingPreviewPlan(editor, preview);
	}

	if (preview.target.kind === "block-range") {
		return buildBlockRangeStreamingPreviewPlan(editor, preview);
	}

	return null;
}

function buildTextRangeStreamingPreviewPlan(
	editor: Editor,
	preview: AIStreamingReviewPreview,
): TextRangeStreamingPreviewPlan | null {
	if (preview.target.kind !== "text-range") {
		return null;
	}

	const block = editor.getBlock(preview.target.blockId);
	if (!block) {
		return null;
	}

	const from = Math.min(preview.target.from, preview.target.to);
	const to = Math.max(preview.target.from, preview.target.to);
	const originalText = block.textContent().slice(from, to);
	return buildStreamingTextPreviewPlan({
		blockId: preview.target.blockId,
		from,
		insertedTextStartOffset: 0,
		originalText,
		previousTextLength: preview.previousTextLength,
		replacementText: preview.text,
		to,
	});
}

function buildBlockRangeStreamingPreviewPlan(
	editor: Editor,
	preview: AIStreamingReviewPreview,
): StreamingPreviewPlanResult | null {
	if (preview.target.kind !== "block-range") {
		return null;
	}

	const normalizedRange = normalizeStreamingBlockRange(editor, preview.target);
	if (!normalizedRange) {
		return null;
	}

	const normalizedReplacementRange = toNormalizedReplacementRange(
		editor,
		normalizedRange,
	);
	const originalText = readBlockRangeOriginalText(normalizedReplacementRange);
	if (originalText.length === 0 && preview.text.length === 0) {
		return null;
	}

	const alignedPlan = buildAlignedBlockRangeStreamingPreviewPlan(
		editor,
		normalizedRange,
		preview.text,
	);
	if (alignedPlan) {
		return alignedPlan;
	}

	const partialPlan = buildPartialBlockRangeStreamingPreviewPlan({
		normalizedRange,
		originalText,
		previousTextLength: preview.previousTextLength,
		replacementText: preview.text,
	});
	if (partialPlan) {
		return partialPlan;
	}

	const sharedPrefixLength = countSharedPrefixLength(originalText, preview.text);
	const originalTail = originalText.slice(sharedPrefixLength);
	const previewTail = preview.text.slice(sharedPrefixLength);
	const sharedSuffixLength = countSharedSuffixLength(originalTail, previewTail);
	const deleteFromChar = sharedPrefixLength;
	const deleteToChar = originalText.length - sharedSuffixLength;
	const insertText = preview.text.slice(
		sharedPrefixLength,
		preview.text.length - sharedSuffixLength,
	);

	if (
		deleteFromChar === deleteToChar &&
		insertText.length === 0 &&
		sharedPrefixLength === 0 &&
		sharedSuffixLength === 0
	) {
		return null;
	}

	return {
		kind: "block-range",
		normalizedRange,
		deleteFromChar,
		deleteToChar,
		insertedTextStart: sharedPrefixLength,
		insertText,
	};
}

function buildPartialBlockRangeStreamingPreviewPlan({
	normalizedRange,
	originalText,
	previousTextLength,
	replacementText,
}: {
	normalizedRange: BlockRangeStreamingPreviewPlan["normalizedRange"];
	originalText: string;
	previousTextLength: number;
	replacementText: string;
}): BlockRangeStreamingPreviewPlan | null {
	if (replacementText.length >= originalText.length) {
		return null;
	}

	const sharedPrefixLength = countSharedPrefixLength(originalText, replacementText);
	if (sharedPrefixLength === 0) {
		return null;
	}
	if (sharedPrefixLength >= replacementText.length) {
		return previousTextLength < replacementText.length
			? {
					kind: "block-range",
					normalizedRange,
					deleteFromChar: sharedPrefixLength,
					deleteToChar: sharedPrefixLength,
					insertedTextStart: sharedPrefixLength,
					insertText: "",
				}
			: null;
	}

	const originalTail = originalText.slice(sharedPrefixLength);
	const replacementTail = replacementText.slice(sharedPrefixLength);
	const anchor = findStreamingPreviewResyncAnchor(originalTail, replacementTail);

	return {
		kind: "block-range",
		normalizedRange,
		deleteFromChar: sharedPrefixLength,
		deleteToChar: sharedPrefixLength + (anchor?.originalOffset ?? 0),
		insertedTextStart: sharedPrefixLength,
		insertText: replacementTail.slice(
			0,
			anchor?.replacementOffset ?? replacementTail.length,
		),
	};
}

function buildAlignedBlockRangeStreamingPreviewPlan(
	editor: Editor,
	normalizedRange: BlockRangeStreamingPreviewPlan["normalizedRange"],
	replacementText: string,
): AlignedBlockRangeStreamingPreviewPlan | null {
	const normalizedReplacementRange = toNormalizedReplacementRange(
		editor,
		normalizedRange,
	);
	const fragments = resolveSelectedRangeTextFragments(normalizedReplacementRange);
	const replacementParagraphs = splitReplacementParagraphs(replacementText);
	if (
		!replacementParagraphs ||
		fragments.length !== replacementParagraphs.length ||
		fragments.some((fragment) => fragment.text.length === 0)
	) {
		return null;
	}

	let paragraphStartOffset = 0;
	const plans: TextRangeStreamingPreviewPlan[] = [];
	for (let index = 0; index < fragments.length; index += 1) {
		const fragment = fragments[index]!;
		const paragraph = replacementParagraphs[index] ?? "";
		const plan = buildStreamingTextPreviewPlan({
			blockId: fragment.blockId,
			from: fragment.offset,
			insertedTextStartOffset: paragraphStartOffset,
			originalText: fragment.text,
			previousTextLength: Number.POSITIVE_INFINITY,
			replacementText: paragraph,
			to: fragment.offset + fragment.text.length,
		});
		if (plan.deleteTo > plan.deleteFrom || plan.text.length > 0) {
			plans.push(plan);
		}
		paragraphStartOffset += paragraph.length + 1;
	}

	return plans.length > 0 ? { kind: "aligned-block-range", plans } : null;
}

function buildStreamingTextPreviewPlan({
	blockId,
	from,
	insertedTextStartOffset,
	originalText,
	previousTextLength,
	replacementText,
	to,
}: {
	blockId: string;
	from: number;
	insertedTextStartOffset: number;
	originalText: string;
	previousTextLength: number;
	replacementText: string;
	to: number;
}): TextRangeStreamingPreviewPlan {
	const partialPlan = buildPartialStreamingTextPreviewPlan({
		blockId,
		from,
		insertedTextStartOffset,
		originalText,
		previousTextLength,
		replacementText,
	});
	if (partialPlan) {
		return partialPlan;
	}

	const sharedPrefixLength = countSharedPrefixLength(originalText, replacementText);
	const originalTail = originalText.slice(sharedPrefixLength);
	const previewTail = replacementText.slice(sharedPrefixLength);
	const sharedSuffixLength = countSharedSuffixLength(originalTail, previewTail);
	const insertedTextEnd = replacementText.length - sharedSuffixLength;

	return {
		kind: "text-range",
		blockId,
		deleteFrom: from + sharedPrefixLength,
		deleteTo: to - sharedSuffixLength,
		insertedTextStart: insertedTextStartOffset + sharedPrefixLength,
		insertOffset: from + sharedPrefixLength,
		text: replacementText.slice(sharedPrefixLength, insertedTextEnd),
	};
}

function buildPartialStreamingTextPreviewPlan({
	blockId,
	from,
	insertedTextStartOffset,
	originalText,
	previousTextLength,
	replacementText,
}: {
	blockId: string;
	from: number;
	insertedTextStartOffset: number;
	originalText: string;
	previousTextLength: number;
	replacementText: string;
}): TextRangeStreamingPreviewPlan | null {
	if (replacementText.length >= originalText.length) {
		return null;
	}

	const sharedPrefixLength = countSharedPrefixLength(originalText, replacementText);
	if (sharedPrefixLength === 0) {
		return null;
	}
	if (sharedPrefixLength >= replacementText.length) {
		return previousTextLength < replacementText.length
			? {
					kind: "text-range",
					blockId,
					deleteFrom: from + sharedPrefixLength,
					deleteTo: from + sharedPrefixLength,
					insertedTextStart: insertedTextStartOffset + sharedPrefixLength,
					insertOffset: from + sharedPrefixLength,
					text: "",
				}
			: null;
	}

	const originalTail = originalText.slice(sharedPrefixLength);
	const replacementTail = replacementText.slice(sharedPrefixLength);
	const anchor = findStreamingPreviewResyncAnchor(originalTail, replacementTail);

	return {
		kind: "text-range",
		blockId,
		deleteFrom: from + sharedPrefixLength,
		deleteTo: from + sharedPrefixLength + (anchor?.originalOffset ?? 0),
		insertedTextStart: insertedTextStartOffset + sharedPrefixLength,
		insertOffset: from + sharedPrefixLength,
		text: replacementTail.slice(
			0,
			anchor?.replacementOffset ?? replacementTail.length,
		),
	};
}

export function normalizeStreamingBlockRange(
	editor: Editor,
	target: Extract<AIStreamingReviewPreview["target"], { kind: "block-range" }>,
): BlockRangeStreamingPreviewPlan["normalizedRange"] | null {
	const blockIds = target.blockIds.filter((blockId) => editor.getBlock(blockId));
	const startIndex = blockIds.indexOf(target.start.blockId);
	const endIndex = blockIds.indexOf(target.end.blockId);
	if (startIndex < 0 || endIndex < 0) {
		return null;
	}

	const isForward =
		startIndex < endIndex ||
		(startIndex === endIndex && target.start.offset <= target.end.offset);
	const fromIndex = Math.min(startIndex, endIndex);
	const toIndex = Math.max(startIndex, endIndex);
	return {
		start: isForward ? target.start : target.end,
		end: isForward ? target.end : target.start,
		middleBlockIds: blockIds.slice(fromIndex + 1, toIndex),
	};
}

function toNormalizedReplacementRange(
	editor: Editor,
	normalizedRange: BlockRangeStreamingPreviewPlan["normalizedRange"],
): NormalizedReplacementRange {
	const blocks: ReplacementRangeBlock[] = [
		{
			id: normalizedRange.start.blockId,
			text: editor.getBlock(normalizedRange.start.blockId)?.textContent() ?? "",
		},
		...normalizedRange.middleBlockIds.map((blockId) => ({
			id: blockId,
			text: editor.getBlock(blockId)?.textContent() ?? "",
		})),
	];
	if (normalizedRange.end.blockId !== normalizedRange.start.blockId) {
		blocks.push({
			id: normalizedRange.end.blockId,
			text: editor.getBlock(normalizedRange.end.blockId)?.textContent() ?? "",
		});
	}

	return normalizeReplacementRange(
		{
			start: normalizedRange.start,
			end: normalizedRange.end,
		},
		blocks,
	);
}
