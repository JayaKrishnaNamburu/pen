import type { BlameRange, CharacterAttribution } from "../types";

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
