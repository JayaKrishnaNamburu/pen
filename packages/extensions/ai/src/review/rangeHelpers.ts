export interface InlineRange {
	from: number;
	to: number;
}

export function subtractRanges(
	range: InlineRange,
	excludedRanges: InlineRange[],
): InlineRange[] {
	let ranges = [range];
	for (const excludedRange of excludedRanges) {
		ranges = ranges.flatMap((candidate) =>
			subtractRange(candidate, excludedRange),
		);
	}
	return ranges;
}

export function subtractRange(
	range: InlineRange,
	excludedRange: InlineRange,
): InlineRange[] {
	if (excludedRange.to <= range.from || excludedRange.from >= range.to) {
		return [range];
	}

	return [
		{ from: range.from, to: Math.max(range.from, excludedRange.from) },
		{ from: Math.min(range.to, excludedRange.to), to: range.to },
	].filter((candidate) => candidate.to > candidate.from);
}
