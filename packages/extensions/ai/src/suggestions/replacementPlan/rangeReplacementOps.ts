import type { DocumentOp } from "@pen/types";
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
		type:
			| "delete-block"
			| "delete-text"
			| "insert-block"
			| "insert-text"
			| "replace-text";
	}
>;

export const DEFAULT_INSERTED_BLOCK_TYPE = "paragraph";

export function createDefaultReplacementBlockId(): string {
	const randomId =
		globalThis.crypto?.randomUUID?.() ??
		`${Date.now()}-${Math.random().toString(36).slice(2)}`;
	return `ai-paragraph-${randomId}`;
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
			type: "delete-text",
			blockId: normalizedRange.start.blockId,
			offset: normalizedRange.start.offset,
			length:
				normalizedRange.startBlock.text.length -
				normalizedRange.start.offset,
		});
	}

	if (normalizedRange.end.offset > 0) {
		operations.push({
			type: "delete-text",
			blockId: normalizedRange.end.blockId,
			offset: 0,
			length: normalizedRange.end.offset,
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
		const suffixBlock = insertedParagraphBlocks.at(-1);
		operations.push({
			type: "insert-text",
			blockId: suffixBlock?.blockId ?? normalizedRange.start.blockId,
			offset: suffixBlock
				? suffixBlock.text.length
				: normalizedRange.start.offset + firstReplacementText.length,
			text: endSuffix,
		});
	}

	operations.push({
		type: "delete-block",
		blockId: normalizedRange.end.blockId,
	});

	return operations;
}

export function buildAlignedMultiBlockParagraphReplacementOperations({
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

export function buildInsertedParagraphBlockOperations({
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

export interface InsertedParagraphBlock {
	afterBlockId: string;
	blockId: string;
	blockType: string;
	text: string;
}

export function buildInsertedParagraphBlocks({
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

export function toInsertedParagraphBlockOperations(
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
			type: "insert-text",
			blockId: block.blockId,
			offset: 0,
			text: block.text,
		});
	}

	return operations;
}
