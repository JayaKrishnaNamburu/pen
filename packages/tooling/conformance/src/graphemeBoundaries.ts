/**
 * Logical offsets that S5 treats as normal on a plain text block: the
 * grapheme-cluster boundaries under `Intl.Segmenter`. Offsets are UTF-16
 * code units, matching Y.Text / JS string length — not code-point counts.
 */
export function graphemeBoundaryOffsets(text: string): number[] {
	if (typeof Intl === "undefined" || typeof Intl.Segmenter !== "function") {
		throw new Error("graphemeBoundaryOffsets needs Intl.Segmenter");
	}
	const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
	const offsets = [0];
	let offset = 0;
	for (const { segment } of segmenter.segment(text)) {
		offset += segment.length;
		offsets.push(offset);
	}
	return offsets;
}

export type GraphemeWalkCheck = {
	ok: boolean;
	skipped?: boolean;
	reason?: string;
};

/**
 * A walk that never leaves offset 0, or never crosses a multi-code-unit
 * cluster, is unchecked. Code-unit stepping lands inside a cluster and
 * fails.
 */
export function graphemeWalkHolds(input: {
	text: string;
	offsets: readonly number[];
	mustVisit: number;
}): GraphemeWalkCheck {
	if (input.offsets.length === 0) {
		return {
			ok: false,
			skipped: true,
			reason: "no caret offsets recorded — could not check S5",
		};
	}
	const boundaries = new Set(graphemeBoundaryOffsets(input.text));
	if (!boundaries.has(input.mustVisit)) {
		return {
			ok: false,
			skipped: true,
			reason: `mustVisit ${input.mustVisit} is not a grapheme boundary of the fixture`,
		};
	}
	const interior = input.offsets.filter((offset) => !boundaries.has(offset));
	if (interior.length > 0) {
		return {
			ok: false,
			reason: `caret landed inside a grapheme at offset ${interior[0]}`,
		};
	}
	if (!input.offsets.includes(input.mustVisit)) {
		return {
			ok: false,
			reason: `walk never reached grapheme boundary ${input.mustVisit}`,
		};
	}
	return { ok: true };
}
