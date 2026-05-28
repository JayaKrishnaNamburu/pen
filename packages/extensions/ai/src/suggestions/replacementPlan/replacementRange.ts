import { splitPlainTextBlocks } from "@pen/content-ops";
import { hasLineBreak } from "./sharedTextDiff";

export interface ReplacementRangeBlock {
	id: string;
	text: string;
}

export interface ReplacementRangePoint {
	blockId: string;
	offset: number;
}

export interface ReplacementRange {
	start: ReplacementRangePoint;
	end: ReplacementRangePoint;
}

export interface NormalizedReplacementRange {
	start: ReplacementRangePoint;
	end: ReplacementRangePoint;
	startBlock: ReplacementRangeBlock;
	endBlock: ReplacementRangeBlock;
	middleBlocks: ReplacementRangeBlock[];
}

export interface RangeTextFragment {
	blockId: string;
	offset: number;
	text: string;
}

export function normalizeReplacementRange(
	range: ReplacementRange,
	blocks: readonly ReplacementRangeBlock[],
): NormalizedReplacementRange {
	const startIndex = blocks.findIndex((block) => block.id === range.start.blockId);
	const endIndex = blocks.findIndex((block) => block.id === range.end.blockId);
	if (startIndex < 0 || endIndex < 0) {
		throw new Error("Replacement range block was not found in the document.");
	}

	const isForward =
		startIndex < endIndex ||
		(startIndex === endIndex && range.start.offset <= range.end.offset);
	const fromIndex = Math.min(startIndex, endIndex);
	const toIndex = Math.max(startIndex, endIndex);
	const start = isForward ? range.start : range.end;
	const end = isForward ? range.end : range.start;
	const startBlock = blocks[fromIndex]!;
	const endBlock = blocks[toIndex]!;
	const middleBlocks = blocks.slice(fromIndex + 1, toIndex);

	return {
		start,
		end,
		startBlock,
		endBlock,
		middleBlocks,
	};
}

export function resolveSelectedRangeTextFragments(
	normalizedRange: NormalizedReplacementRange,
): RangeTextFragment[] {
	return [
		{
			blockId: normalizedRange.start.blockId,
			offset: normalizedRange.start.offset,
			text: normalizedRange.startBlock.text.slice(normalizedRange.start.offset),
		},
		...normalizedRange.middleBlocks.map((block) => ({
			blockId: block.id,
			offset: 0,
			text: block.text,
		})),
		{
			blockId: normalizedRange.end.blockId,
			offset: 0,
			text: normalizedRange.endBlock.text.slice(0, normalizedRange.end.offset),
		},
	];
}

export function splitReplacementParagraphs(text: string): string[] | undefined {
	if (!hasLineBreak(text)) {
		return undefined;
	}

	return splitPlainTextBlocks(text);
}

export function readBlockRangeOriginalText(
	normalizedRange: NormalizedReplacementRange,
): string {
	if (
		normalizedRange.start.blockId === normalizedRange.end.blockId &&
		normalizedRange.middleBlocks.length === 0
	) {
		const from = Math.min(
			normalizedRange.start.offset,
			normalizedRange.end.offset,
		);
		const to = Math.max(
			normalizedRange.start.offset,
			normalizedRange.end.offset,
		);
		return normalizedRange.startBlock.text.slice(from, to);
	}

	const segments = [
		normalizedRange.startBlock.text.slice(normalizedRange.start.offset),
		...normalizedRange.middleBlocks.map((block) => block.text),
		normalizedRange.endBlock.text.slice(0, normalizedRange.end.offset),
	];

	return segments.join("\n");
}
