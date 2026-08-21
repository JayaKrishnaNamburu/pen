import type {
	OverlayFlushCommit,
	OverlayFlushScheduler,
	OverlayGeometryReader,
	OverlayLayer,
	OverlaySelectionRecord,
	PaintPlan,
} from "./types";

/**
 * OV1 flush: read the paint plan in the scheduler read phase, paint it
 * in the write phase. Hosts (and the conformance 8-caret fixture) call
 * this instead of measuring or painting from events.
 */
export async function flushOverlay(
	scheduler: OverlayFlushScheduler,
	layer: OverlayLayer,
	commits: readonly OverlayFlushCommit[],
	selection: OverlaySelectionRecord,
	reader: OverlayGeometryReader,
): Promise<PaintPlan> {
	let plan: PaintPlan | null = null;
	const readDone = scheduler.read(() => {
		plan = layer.readPaintPlan(commits, selection, reader);
	});
	const writeDone = scheduler.write(() => {
		if (plan) {
			layer.applyPaintPlan(plan);
		}
	});
	await Promise.all([readDone, writeDone]);
	if (!plan) {
		throw new Error("flushOverlay: read phase produced no plan");
	}
	return plan;
}
