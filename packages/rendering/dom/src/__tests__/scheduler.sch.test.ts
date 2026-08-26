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

describe("DomScheduler SCH extras", () => {
	beforeEach(() => {
		installMockRaf();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("SCH1: flush runs queued reads FIFO then writes FIFO with matching phase", async () => {
		const scheduler = new DomScheduler("root-a");
		const order: string[] = [];

		const reads = [
			scheduler.read(() => {
				order.push(`read-1:${scheduler.phase}`);
			}),
			scheduler.read(() => {
				order.push(`read-2:${scheduler.phase}`);
			}),
		];
		const writes = [
			scheduler.write(() => {
				order.push(`write-1:${scheduler.phase}`);
			}),
			scheduler.write(() => {
				order.push(`write-2:${scheduler.phase}`);
			}),
		];

		expect(scheduler.phase).toBe("idle");
		expect(order).toEqual([]);

		flushFrame();
		await Promise.all([...reads, ...writes]);

		expect(order).toEqual([
			"read-1:read",
			"read-2:read",
			"write-1:write",
			"write-2:write",
		]);
		expect(scheduler.phase).toBe("idle");
	});

	it("SCH2: measureNow increments the diagnostics-visible counter once per call", async () => {
		const scheduler = new DomScheduler("root-a");
		expect(scheduler.diagnostics.measureNowCount).toBe(0);

		expect(scheduler.measureNow(() => "caret")).toBe("caret");
		expect(scheduler.diagnostics.measureNowCount).toBe(1);

		const duringFlush = scheduler.read(() => {
			expect(scheduler.measureNow(() => scheduler.phase)).toBe("read");
		});
		const afterRead = scheduler.write(() => {
			expect(scheduler.measureNow(() => scheduler.phase)).toBe("write");
		});

		flushFrame();
		await Promise.all([duringFlush, afterRead]);

		expect(() => {
			scheduler.measureNow(() => {
				throw new Error("sync measure failed");
			});
		}).toThrow("sync measure failed");

		expect(scheduler.diagnostics.measureNowCount).toBe(4);
		expect(scheduler.phase).toBe("idle");
	});

	it("SCH1 SCH2: measureNow is the sync measure path and does not change phase or schedule a flush", () => {
		const scheduler = new DomScheduler("root-a");

		const measured = scheduler.measureNow(() => {
			expect(scheduler.phase).toBe("idle");
			return 42;
		});

		expect(measured).toBe(42);
		expect(scheduler.diagnostics.measureNowCount).toBe(1);
		expect(scheduler.phase).toBe("idle");
		expect(rafCalls).toBe(0);
		expect(frameQueue).toEqual([]);
	});

	it("SCH3: per-root schedulers keep queues, phases, and measureNow counts isolated", async () => {
		const alpha = new DomScheduler("root-a");
		const beta = new DomScheduler({ rootId: "root-b" });
		const order: string[] = [];

		expect(alpha.rootId).toBe("root-a");
		expect(beta.rootId).toBe("root-b");

		expect(alpha.measureNow(() => "a")).toBe("a");
		expect(alpha.diagnostics.measureNowCount).toBe(1);
		expect(beta.diagnostics.measureNowCount).toBe(0);

		const alphaDone = alpha.write(() => {
			order.push("a-write");
			expect(alpha.phase).toBe("write");
			expect(beta.phase).toBe("idle");
			void beta.read(() => {
				order.push(`b-read:${beta.phase}`);
			});
		});

		expect(rafCalls).toBe(1);
		flushFrame();
		await alphaDone;

		expect(order).toEqual(["a-write"]);
		expect(alpha.phase).toBe("idle");
		expect(beta.phase).toBe("idle");
		expect(beta.diagnostics.measureNowCount).toBe(0);

		flushFrame();
		expect(order).toEqual(["a-write", "b-read:read"]);
		expect(alpha.diagnostics.measureNowCount).toBe(1);
		expect(beta.diagnostics.measureNowCount).toBe(0);
	});
});
