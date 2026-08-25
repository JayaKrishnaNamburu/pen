// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { collapsedRect } from "../types";
import { getRootGeometry, measureWithRoot } from "../rootGeometry";

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

describe("root geometry host", () => {
	beforeEach(() => {
		installMockRaf();
	});

	afterEach(() => {
		document.body.replaceChildren();
		vi.unstubAllGlobals();
	});

	it("reuses one scheduler and reader per root", () => {
		const root = document.createElement("div");
		const first = getRootGeometry(root, {
			observeResize: false,
			observeFonts: false,
		});
		const second = getRootGeometry(root);
		expect(second).toBe(first);
		expect(second.scheduler).toBe(first.scheduler);
		expect(second.reader).toBe(first.reader);
	});

	it("SCH2: measureWithRoot uses measureNow when the scheduler is idle", () => {
		const root = document.createElement("div");
		const caret = collapsedRect(10, 20, 16);
		const host = getRootGeometry(root, {
			observeResize: false,
			observeFonts: false,
			measure: { caretRect: () => caret },
		});
		expect(host.scheduler.diagnostics.measureNowCount).toBe(0);
		expect(host.scheduler.phase).toBe("idle");

		const rect = measureWithRoot(root, ({ reader }) =>
			reader.caretRect({ blockId: "p1", offset: 0 }, "downstream"),
		);

		expect(rect).toEqual(caret);
		expect(host.scheduler.diagnostics.measureNowCount).toBe(1);
		expect(host.scheduler.phase).toBe("idle");
	});

	it("reads during an open read phase without incrementing measureNow", async () => {
		const root = document.createElement("div");
		const caret = collapsedRect(4, 8, 12);
		const host = getRootGeometry(root, {
			observeResize: false,
			observeFonts: false,
			measure: { caretRect: () => caret },
		});

		const pending = host.scheduler.read(() => {
			expect(host.scheduler.phase).toBe("read");
			const rect = measureWithRoot(root, ({ reader, scheduler }) => {
				expect(scheduler.phase).toBe("read");
				return reader.caretRect(
					{ blockId: "p1", offset: 1 },
					"downstream",
				);
			});
			expect(rect).toEqual(caret);
		});
		flushFrame();
		await pending;

		expect(host.scheduler.diagnostics.measureNowCount).toBe(0);
		expect(host.scheduler.phase).toBe("idle");
	});
});
