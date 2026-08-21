// @vitest-environment jsdom

import type { SelectionRecord } from "@input/pen-types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DomScheduler } from "../scheduler";

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

function record(version: number): SelectionRecord {
	return {
		state: null,
		version,
		origin: "programmatic",
		commitId: version,
	};
}

describe("DomScheduler P1 slot", () => {
	beforeEach(() => {
		installMockRaf();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("P1: projectSelection is called with version N after queued writes", () => {
		const projected: number[] = [];
		const order: string[] = [];
		const scheduler = new DomScheduler("root-a", {
			onProjectSelection: (next) => {
				projected.push(next.version);
				order.push(`p1:${next.version}`);
			},
		});

		void scheduler.write(() => {
			order.push("write");
		});
		scheduler.setSelection(record(7));

		expect(projected).toEqual([]);
		flushFrame();

		expect(projected).toEqual([7]);
		expect(order).toEqual(["write", "p1:7"]);
		expect(scheduler.projectedThisFlush).toBe(true);
		expect(scheduler.phase).toBe("idle");
	});

	it("P1: a parked projection keeps the queued record for the next flush", () => {
		const projected: number[] = [];
		let park = true;
		const scheduler = new DomScheduler("root-a", {
			onProjectSelection: (next) => {
				projected.push(next.version);
				if (park) {
					return "parked";
				}
			},
		});

		scheduler.setSelection(record(4));
		flushFrame();
		expect(projected).toEqual([4]);

		park = false;
		void scheduler.write(() => {});
		flushFrame();
		expect(projected).toEqual([4, 4]);
		expect(scheduler.projectedThisFlush).toBe(true);
	});

	it("P1: a flush without setSelection does not run the slot", () => {
		const projected: number[] = [];
		const scheduler = new DomScheduler("root-a", {
			onProjectSelection: (next) => {
				projected.push(next.version);
			},
		});

		void scheduler.write(() => {});
		flushFrame();

		expect(projected).toEqual([]);
		expect(scheduler.projectedThisFlush).toBe(false);
	});
});
