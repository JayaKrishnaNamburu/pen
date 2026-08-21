/**
 * Apply a previous/next boundary walk as a logical delete. M6 pins this
 * against the production grapheme walk; a code-point walk must not satisfy
 * the same expected strings.
 */
export type GraphemeWalk = {
	previous(text: string, offset: number): number;
	next(text: string, offset: number): number;
};

export function deletePreviousByWalk(
	text: string,
	offset: number,
	walk: GraphemeWalk,
): string {
	const start = walk.previous(text, offset);
	if (start >= offset) {
		return text;
	}
	return text.slice(0, start) + text.slice(offset);
}

export function deleteNextByWalk(
	text: string,
	offset: number,
	walk: GraphemeWalk,
): string {
	const end = walk.next(text, offset);
	if (end <= offset) {
		return text;
	}
	return text.slice(0, offset) + text.slice(end);
}

function previousCodePointBoundary(text: string, offset: number): number {
	if (offset <= 0) {
		return 0;
	}
	const trail = text.charCodeAt(offset - 1);
	if (trail >= 0xdc00 && trail <= 0xdfff && offset >= 2) {
		const lead = text.charCodeAt(offset - 2);
		if (lead >= 0xd800 && lead <= 0xdbff) {
			return offset - 2;
		}
	}
	return offset - 1;
}

function nextCodePointBoundary(text: string, offset: number): number {
	if (offset >= text.length) {
		return text.length;
	}
	const lead = text.charCodeAt(offset);
	if (lead >= 0xd800 && lead <= 0xdbff && offset + 1 < text.length) {
		const trail = text.charCodeAt(offset + 1);
		if (trail >= 0xdc00 && trail <= 0xdfff) {
			return offset + 2;
		}
	}
	return offset + 1;
}

/** Broken clusterer: advances one Unicode code point, not a grapheme. */
export const CODE_POINT_WALK: GraphemeWalk = {
	previous: previousCodePointBoundary,
	next: nextCodePointBoundary,
};
