import type { BlameRange, CharacterAttribution } from "../types";

/**
 * Project character attributions onto blame spans for rendering. Ranges
 * are returned in input order and are not merged: adjacent runs by the
 * same author stay separate, because the caller decides whether a gap in
 * timestamps is worth collapsing.
 */
export function buildBlameRanges(
	attributions: readonly CharacterAttribution[],
): readonly BlameRange[] {
	return attributions.map((attribution) => ({
		from: attribution.offset,
		to: attribution.offset + attribution.length,
		author: attribution.author,
		...(attribution.displayHint
			? { displayHint: attribution.displayHint }
			: {}),
		timestamp: attribution.timestamp,
	}));
}
