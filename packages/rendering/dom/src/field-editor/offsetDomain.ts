import { EMPTY_BLOCK_SENTINEL } from "@input/pen-types";

/**
 * Sentinel seam 2 (I11). The empty-block `\u200B` is storage so browsers
 * have a caret target; it is not a logical character.
 *
 * Produced by normalize / op executors when inline content is empty.
 * Reader, projector, geometry, and backends translate through this
 * module. No other new module may test for the sentinel.
 */

function isEmptyBlockStorage(text: string): boolean {
	return text === EMPTY_BLOCK_SENTINEL;
}

export function logicalLength(text: string): number {
	return isEmptyBlockStorage(text) ? 0 : text.length;
}

function clampToLogical(offset: number, text: string): number {
	const length = logicalLength(text);
	if (offset <= 0) {
		return 0;
	}
	if (offset >= length) {
		return length;
	}
	return offset;
}

export function toDomOffset(logicalOffset: number, text: string): number {
	return clampToLogical(logicalOffset, text);
}

export function toLogicalOffset(domOffset: number, text: string): number {
	return clampToLogical(domOffset, text);
}
