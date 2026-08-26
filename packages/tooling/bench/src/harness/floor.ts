import type { BenchContext } from "../bench";

/** Start/end with Pen removed. The default null implementation. */
export function emptyTimerFloor(b: BenchContext): void {
	b.start();
	b.end();
}

/**
 * The 1000-part streaming clock was 100 of these. Time them with Pen
 * removed before attributing the wall-clock to apply.
 */
export function macrotaskYieldFloor(
	yields: number,
): (b: BenchContext) => Promise<void> {
	return async (b) => {
		b.start();
		for (let i = 0; i < yields; i++) {
			await new Promise<void>((resolve) => {
				setTimeout(resolve, 0);
			});
		}
		b.end();
		b.setMetrics({ applyCount: 0, yieldCount: yields });
	};
}

/**
 * The autocomplete provider budget races each provider against this
 * delay. Time it with Pen removed before attributing the wall-clock.
 */
export function delayedTimerFloor(
	delayMs: number,
): (b: BenchContext) => Promise<void> {
	return async (b) => {
		b.start();
		await new Promise<void>((resolve) => {
			setTimeout(resolve, delayMs);
		});
		b.end();
		b.setMetrics({ applyCount: 0, delayMs });
	};
}
