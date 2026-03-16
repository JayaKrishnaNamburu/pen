import type { BlameRange, CharacterAttribution } from "../types";

export function buildBlameRanges(
	attributions: readonly CharacterAttribution[],
): readonly BlameRange[] {
	return attributions.map((attribution) => ({
		from: attribution.offset,
		to: attribution.offset + attribution.length,
		author: {
			id: attribution.userId,
			name: attribution.userName,
			color: attribution.color,
		},
		timestamp: attribution.timestamp,
	}));
}
