// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SelectionState } from "@input/pen-types";
import { getRootGeometry } from "../geometry/rootGeometry";
import { collapsedRect } from "../geometry/types";
import { resolveSelectionRect } from "../utils/selectionPlacement";

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

function textSelection(
	isCollapsed = false,
): Extract<SelectionState, { type: "text" }> {
	return {
		type: "text",
		anchor: { blockId: "p1", offset: 0 },
		focus: { blockId: "p1", offset: isCollapsed ? 0 : 4 },
	};
}

describe("resolveSelectionRect", () => {
	beforeEach(() => {
		installMockRaf();
	});

	afterEach(() => {
		document.body.replaceChildren();
		vi.unstubAllGlobals();
	});

	it("unions rangeRects through measureNow when idle", () => {
		const root = document.createElement("div");
		const range = collapsedRect(10, 20, 16);
		const rangeWithWidth = { ...range, width: 40, right: 50 };
		const host = getRootGeometry(root, {
			observeResize: false,
			observeFonts: false,
			measure: {
				rangeRects: () => [rangeWithWidth],
			},
		});

		const rect = resolveSelectionRect(root, textSelection());

		expect(rect?.left).toBe(10);
		expect(rect?.width).toBe(40);
		expect(host.scheduler.diagnostics.measureNowCount).toBe(1);
	});

	it("reads rangeRects in the scheduler read phase without measureNow", async () => {
		const root = document.createElement("div");
		const rangeWithWidth = {
			...collapsedRect(8, 12, 10),
			width: 24,
			right: 32,
		};
		const host = getRootGeometry(root, {
			observeResize: false,
			observeFonts: false,
			measure: {
				rangeRects: () => [rangeWithWidth],
			},
		});

		const seen: { rect: DOMRect | null } = { rect: null };
		const pending = host.scheduler.read(() => {
			expect(host.scheduler.phase).toBe("read");
			seen.rect = resolveSelectionRect(root, textSelection());
		});
		flushFrame();
		await pending;

		expect(seen.rect?.left).toBe(8);
		expect(host.scheduler.diagnostics.measureNowCount).toBe(0);
	});

	it("returns null for collapsed text selections without measuring", () => {
		const root = document.createElement("div");
		const host = getRootGeometry(root, {
			observeResize: false,
			observeFonts: false,
			measure: {
				rangeRects: () => {
					throw new Error("should not measure collapsed selections");
				},
			},
		});

		const rect = resolveSelectionRect(root, textSelection(true));

		expect(rect).toBeNull();
		expect(host.scheduler.diagnostics.measureNowCount).toBe(0);
	});
});
