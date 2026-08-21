export const WINDOWED_FIXTURE_NAME = "windowed-large";

export function isWindowedFixture(name: string): boolean {
	return name === WINDOWED_FIXTURE_NAME;
}

export function visibleWindowedBlockIds(
	blockIds: readonly string[],
	windowStart: number,
	windowSize: number,
): string[] {
	if (windowSize <= 0) {
		return [];
	}
	const start = Math.max(0, windowStart);
	return blockIds.slice(start, start + windowSize);
}

export function clampWindowStart(
	start: number,
	blockCount: number,
	windowSize: number,
): number {
	const maxStart = Math.max(0, blockCount - windowSize);
	return Math.min(Math.max(0, Math.floor(start)), maxStart);
}
