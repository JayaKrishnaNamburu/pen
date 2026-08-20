import { describe, expect, it } from "vitest";

// SCALE4 / F.4 deferred soak. Restored after H.6 makes editor.destroy() awaitable
// and this harness samples heap through teardown-and-recreate. Session growth is a
// trend (CH8: do not fail CI on heap). The only hard assertion is post-teardown:
// heap after destroy + recreate stays within a stated multiple of baseline, and
// the maps in packages/core/CACHE-INVENTORY.md are released.
describe.skip("SCALE4 destroy retains nothing", () => {
	it("heap after teardown-and-recreate stays within the stated baseline multiple", () => {
		const baselineHeap = Number.NaN;
		const postTeardownHeap = Number.NaN;
		const teardownHeapMultiple = Number.NaN;

		expect(Number.isFinite(baselineHeap)).toBe(true);
		expect(Number.isFinite(postTeardownHeap)).toBe(true);
		expect(Number.isFinite(teardownHeapMultiple)).toBe(true);
		expect(postTeardownHeap).toBeLessThanOrEqual(
			baselineHeap * teardownHeapMultiple,
		);
	});
});
