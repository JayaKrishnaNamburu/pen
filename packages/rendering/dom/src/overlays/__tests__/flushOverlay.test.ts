// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DomScheduler } from "../../scheduler";
import {
	OVERLAY_ITEM_ATTR,
	createOverlayLayer,
	flushOverlay,
	type OverlayFlushCommit,
	type OverlayGeometryReader,
	type OverlayRect,
	type OverlaySelectionRecord,
} from "..";

const commits: readonly OverlayFlushCommit[] = [{ commitId: 7 }];
const caretRect: OverlayRect = { x: 12, y: 24, width: 2, height: 16 };

function createFakeReader(
	overrides: Partial<OverlayGeometryReader> = {},
): OverlayGeometryReader {
	return {
		generation: 3,
		caretRect: () => caretRect,
		rangeRects: () => [],
		blockRect: () => null,
		...overrides,
	};
}

function collapsedTextRecord(): OverlaySelectionRecord {
	return {
		state: {
			type: "text",
			anchor: { blockId: "p1", offset: 4 },
			focus: { blockId: "p1", offset: 4 },
			affinity: "downstream",
		},
	};
}

let frameQueue: FrameRequestCallback[] = [];

function installMockRaf(): void {
	frameQueue = [];
	vi.stubGlobal(
		"requestAnimationFrame",
		(callback: FrameRequestCallback): number => {
			frameQueue.push(callback);
			return frameQueue.length;
		},
	);
}

function flushFrame(): void {
	const batch = frameQueue.splice(0);
	for (const callback of batch) {
		callback(0);
	}
}

describe("flushOverlay OV1", () => {
	beforeEach(() => {
		installMockRaf();
	});

	afterEach(() => {
		document.body.replaceChildren();
		vi.unstubAllGlobals();
	});

	it("OV1: reads the plan in the read phase and paints in the write phase", async () => {
		const root = document.createElement("div");
		document.body.append(root);
		const layer = createOverlayLayer({ root });
		root.append(layer.element);
		const scheduler = new DomScheduler("root-a");
		const phases: string[] = [];
		const reader = createFakeReader({
			caretRect: () => {
				phases.push(`caretRect:${scheduler.phase}`);
				return caretRect;
			},
		});

		const done = flushOverlay(
			scheduler,
			layer,
			commits,
			collapsedTextRecord(),
			reader,
		);
		expect(layer.element.childElementCount).toBe(0);
		flushFrame();
		const plan = await done;

		expect(phases).toEqual(["caretRect:read"]);
		expect(plan.items).toEqual([
			{ id: "caret:focus", kind: "caret", ...caretRect },
		]);
		const item = layer.element.firstElementChild as HTMLElement;
		expect(item.getAttribute(OVERLAY_ITEM_ATTR)).toBe("caret");
		expect(item.style.transform).toBe("translate3d(12px, 24px, 0)");
	});

	it("OV1: a write-phase geometry read is visible so the phase assertion can fail", async () => {
		const root = document.createElement("div");
		document.body.append(root);
		const layer = createOverlayLayer({ root });
		const scheduler = new DomScheduler("root-a");
		const phases: string[] = [];
		const reader = createFakeReader({
			caretRect: () => {
				phases.push(`caretRect:${scheduler.phase}`);
				return caretRect;
			},
		});

		const done = flushOverlay(
			scheduler,
			layer,
			commits,
			collapsedTextRecord(),
			reader,
		);
		const badRead = scheduler.write(() => {
			reader.caretRect({ blockId: "p1", offset: 0 }, "downstream");
		});
		flushFrame();
		await Promise.all([done, badRead]);

		expect(phases).toEqual(["caretRect:read", "caretRect:write"]);
		expect(
			phases.filter((phase) => phase === "caretRect:write"),
		).toHaveLength(1);
	});
});
