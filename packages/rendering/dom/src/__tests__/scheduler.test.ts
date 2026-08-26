// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DomScheduler } from "../scheduler";

let frameQueue: FrameRequestCallback[] = [];
let rafCalls = 0;

function installMockRaf(): void {
	frameQueue = [];
	rafCalls = 0;
	vi.stubGlobal(
		"requestAnimationFrame",
		(callback: FrameRequestCallback): number => {
			rafCalls += 1;
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

describe("DomScheduler", () => {
	beforeEach(() => {
		installMockRaf();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("SCH1 SCH3 I9: enforces strict read→write order in a single flush", async () => {
		const scheduler = new DomScheduler("root-a");
		const order: string[] = [];

		const readDone = scheduler.read(() => {
			order.push(`read:${scheduler.phase}`);
		});
		const writeDone = scheduler.write(() => {
			order.push(`write:${scheduler.phase}`);
		});

		expect(order).toEqual([]);
		flushFrame();
		await Promise.all([readDone, writeDone]);

		expect(order).toEqual(["read:read", "write:write"]);
		expect(scheduler.phase).toBe("idle");
	});

	it("SCH3: routes nested schedules — writes during read run in this flush, reads during write go to the next", async () => {
		const scheduler = new DomScheduler("root-a");
		const order: string[] = [];

		const firstWrite = scheduler.write(() => {
			order.push("write");
			void scheduler.read(() => {
				order.push("read-next");
			});
		});
		const firstRead = scheduler.read(() => {
			order.push("read");
			void scheduler.write(() => {
				order.push("write-this");
			});
		});

		flushFrame();
		await Promise.all([firstRead, firstWrite]);
		expect(order).toEqual(["read", "write", "write-this"]);

		flushFrame();
		expect(order).toEqual(["read", "write", "write-this", "read-next"]);
	});

	it("SCH3: runs one flush per animation frame", async () => {
		const scheduler = new DomScheduler("root-a");
		let flushCount = 0;

		void scheduler.read(() => {
			flushCount += 1;
		});
		void scheduler.read(() => {
			flushCount += 1;
		});
		void scheduler.write(() => {
			flushCount += 1;
		});

		expect(rafCalls).toBe(1);
		flushFrame();
		expect(flushCount).toBe(3);
		expect(rafCalls).toBe(1);
	});

	it("SCH3: schedules zero flushes when idle", () => {
		new DomScheduler("root-a");
		expect(rafCalls).toBe(0);
		expect(frameQueue).toEqual([]);
	});

	it("SCH3: keeps per-root queues isolated", async () => {
		const alpha = new DomScheduler("root-a");
		const beta = new DomScheduler({ rootId: "root-b" });
		const order: string[] = [];

		void alpha.read(() => {
			order.push("a-read");
			void beta.write(() => {
				order.push("b-write");
			});
		});
		void alpha.write(() => {
			order.push("a-write");
		});

		flushFrame();
		expect(order).toEqual(["a-read", "a-write"]);
		expect(alpha.rootId).toBe("root-a");
		expect(beta.rootId).toBe("root-b");

		flushFrame();
		expect(order).toEqual(["a-read", "a-write", "b-write"]);
	});

	it("SCH3: appends reads queued during the read phase to this flush", async () => {
		const scheduler = new DomScheduler("root-a");
		const order: string[] = [];

		const first = scheduler.read(() => {
			order.push("read-1");
			void scheduler.read(() => {
				order.push("read-2");
			});
		});

		flushFrame();
		await first;
		expect(order).toEqual(["read-1", "read-2"]);
		expect(rafCalls).toBe(1);
	});

	it("SCH1 SCH2: increments a diagnostics-visible measureNow counter", () => {
		const scheduler = new DomScheduler("root-a");
		expect(scheduler.diagnostics.measureNowCount).toBe(0);

		expect(scheduler.measureNow(() => "caret")).toBe("caret");
		expect(scheduler.measureNow(() => 2)).toBe(2);

		expect(scheduler.diagnostics.measureNowCount).toBe(2);
		expect(rafCalls).toBe(0);
		expect(scheduler.phase).toBe("idle");
	});

	it("SCH2 SCH3 I9: emits read-after-write when a write-phase read forces a layout-observing next-frame flush", async () => {
		const diagnostics: Array<{ code: string }> = [];
		const scheduler = new DomScheduler("root-a", {
			onDiagnostic: (event) => {
				diagnostics.push(event);
			},
		});

		const writeDone = scheduler.write(() => {
			void scheduler.read(() => "layout");
			void scheduler.read(() => "again");
			expect(scheduler.measureNow(() => "sync")).toBe("sync");
		});

		flushFrame();
		await writeDone;

		expect(diagnostics).toEqual([
			expect.objectContaining({ code: "read-after-write" }),
		]);
		expect(scheduler.diagnostics.measureNowCount).toBe(1);
		expect(rafCalls).toBe(2);

		flushFrame();
		expect(rafCalls).toBe(2);
	});
});
