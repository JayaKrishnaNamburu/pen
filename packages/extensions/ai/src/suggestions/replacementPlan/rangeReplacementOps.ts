import { generateId, type DocumentOp } from "@input/pen-types";
import {
	resolveSelectedRangeTextFragments,
	splitReplacementParagraphs,
	type NormalizedReplacementRange,
} from "./replacementRange";
import { hasLineBreak } from "./sharedTextDiff";
import { compileReplacementSuggestionOps } from "./textDiffEngine";

export type ReplacementReviewOperation = Extract<
	DocumentOp,
	{
		type: "delete-block" | "insert-block" | "splice-text";
	}
>;

export const DEFAULT_INSERTED_BLOCK_TYPE = "paragraph";

export function createDefaultReplacementBlockId(): string {
	return `ai-paragraph-${generateId()}`;
}

export function buildSingleBlockReplacementOperations({
	blockId,
	blockType,
	createBlockId,
	maxDiffCells,
	offset,
	originalText,
	replacementText,
}: {
	blockId: string;
	blockType: string;
	createBlockId: () => string;
	maxDiffCells?: number;
	offset: number;
	originalText: string;
	replacementText: string;
}): ReplacementReviewOperation[] {
	const replacementParagraphs = splitReplacementParagraphs(replacementText);
	const shouldSplitIntoParagraphBlocks =
		replacementParagraphs !== undefined && !hasLineBreak(originalText);
	const firstParagraphText = shouldSplitIntoParagraphBlocks
		? (replacementParagraphs?.[0] ?? "")
		: replacementText;
	const operations: ReplacementReviewOperation[] = [
		...compileReplacementSuggestionOps({
			blockId,
			maxDiffCells,
			offset,
			originalText,
			replacementText: firstParagraphText,
		}),
	];

	if (
		!shouldSplitIntoParagraphBlocks ||
		!replacementParagraphs ||
		replacementParagraphs.length <= 1
	) {
		return operations;
	}

	return [
		...operations,
		...buildInsertedParagraphBlockOperations({
			afterBlockId: blockId,
			blockType,
			createBlockId,
			paragraphs: replacementParagraphs.slice(1),
		}),
	];
}

export function buildMultiBlockReplacementOperations({
	blockType,
	createBlockId,
	maxDiffCells,
	normalizedRange,
	replacementText,
}: {
	blockType: string;
	createBlockId: () => string;
	maxDiffCells?: number;
	normalizedRange: NormalizedReplacementRange;
	replacementText: string;
}): ReplacementReviewOperation[] {
	const replacementParagraphs = splitReplacementParagraphs(replacementText);
	const firstReplacementText = replacementParagraphs
		? (replacementParagraphs[0] ?? "")
		: replacementText;
	const alignedParagraphOperations = replacementParagraphs
		? buildAlignedMultiBlockParagraphReplacementOperations({
				maxDiffCells,
				normalizedRange,
				replacementParagraphs,
			})
		: null;
	if (alignedParagraphOperations) {
		return alignedParagraphOperations;
	}
	const operations: ReplacementReviewOperation[] = [];

	if (normalizedRange.start.offset < normalizedRange.startBlock.text.length) {
		operations.push({
			type: "splice-text",
			blockId: normalizedRange.start.blockId,
			from: normalizedRange.start.offset,
			to: normalizedRange.startBlock.text.length,
			insert: "",
		});
	}

	if (normalizedRange.end.offset > 0) {
		operations.push({
			type: "splice-text",
			blockId: normalizedRange.end.blockId,
			from: 0,
			to: 0 + normalizedRange.end.offset,
			insert: "",
		});
	}

	for (const block of normalizedRange.middleBlocks) {
		operations.push({ type: "delete-block", blockId: block.id });
	}

	if (firstReplacementText.length > 0) {
		operations.push(
			...compileReplacementSuggestionOps({
				blockId: normalizedRange.start.blockId,
				maxDiffCells,
				offset: normalizedRange.start.offset,
				originalText: "",
				replacementText: firstReplacementText,
			}),
		);
	}

	const insertedParagraphBlocks = replacementParagraphs
		? buildInsertedParagraphBlocks({
				afterBlockId: normalizedRange.start.blockId,
				blockType,
				createBlockId,
				paragraphs: replacementParagraphs.slice(1),
			})
		: [];
	operations.push(
		...insertedParagraphBlocks.flatMap(toInsertedParagraphBlockOperations),
	);

	const endSuffix = normalizedRange.endBlock.text.slice(
		normalizedRange.end.offset,
	);
	if (endSuffix.length > 0) {
		const suffixBlock =
			insertedParagraphBlocks[insertedParagraphBlocks.length - 1];
		operations.push({
			type: "splice-text",
			blockId: suffixBlock?.blockId ?? normalizedRange.start.blockId,
			from: suffixBlock
				? suffixBlock.text.length
				: normalizedRange.start.offset + firstReplacementText.length,
			to: suffixBlock
				? suffixBlock.text.length
				: normalizedRange.start.offset + firstReplacementText.length,
			insert: endSuffix,
		});
	}

	operations.push({
		type: "delete-block",
		blockId: normalizedRange.end.blockId,
	});

	return operations;
}

function buildAlignedMultiBlockParagraphReplacementOperations({
	maxDiffCells,
	normalizedRange,
	replacementParagraphs,
}: {
	maxDiffCells?: number;
	normalizedRange: NormalizedReplacementRange;
	replacementParagraphs: readonly string[];
}): ReplacementReviewOperation[] | null {
	const fragments = resolveSelectedRangeTextFragments(normalizedRange);
	if (
		fragments.length !== replacementParagraphs.length ||
		fragments.some((fragment) => fragment.text.length === 0)
	) {
		return null;
	}

	return fragments.flatMap((fragment, index) =>
		compileReplacementSuggestionOps({
			blockId: fragment.blockId,
			maxDiffCells,
			offset: fragment.offset,
			originalText: fragment.text,
			replacementText: replacementParagraphs[index] ?? "",
		}),
	);
}

function buildInsertedParagraphBlockOperations({
	afterBlockId,
	blockType,
	createBlockId,
	paragraphs,
}: {
	afterBlockId: string;
	blockType: string;
	createBlockId: () => string;
	paragraphs: readonly string[];
}): ReplacementReviewOperation[] {
	return buildInsertedParagraphBlocks({
		afterBlockId,
		blockType,
		createBlockId,
		paragraphs,
	}).flatMap(toInsertedParagraphBlockOperations);
}

interface InsertedParagraphBlock {
	afterBlockId: string;
	blockId: string;
	blockType: string;
	text: string;
}

function buildInsertedParagraphBlocks({
	afterBlockId,
	blockType,
	createBlockId,
	paragraphs,
}: {
	afterBlockId: string;
	blockType: string;
	createBlockId: () => string;
	paragraphs: readonly string[];
}): InsertedParagraphBlock[] {
	const blocks: InsertedParagraphBlock[] = [];
	let previousBlockId = afterBlockId;

	for (const text of paragraphs) {
		const blockId = createBlockId();
		blocks.push({
			afterBlockId: previousBlockId,
			blockId,
			blockType,
			text,
		});
		previousBlockId = blockId;
	}

	return blocks;
}

function toInsertedParagraphBlockOperations(
	block: InsertedParagraphBlock,
): ReplacementReviewOperation[] {
	const operations: ReplacementReviewOperation[] = [
		{
			type: "insert-block",
			blockId: block.blockId,
			blockType: block.blockType,
			props: {},
			position: { after: block.afterBlockId },
		},
	];

	if (block.text.length > 0) {
		operations.push({
			type: "splice-text",
			blockId: block.blockId,
			from: 0,
			to: 0,
			insert: block.text,
		});
	}

	return operations;
}
