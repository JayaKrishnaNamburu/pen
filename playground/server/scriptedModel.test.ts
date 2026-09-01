import { describe, expect, it, vi } from "vitest";
import type { ToolSchema } from "@input/pen-types";
import { splitProseBursts, streamScripted } from "./scriptedModel";

const EDIT_DOCUMENT_TOOL = {
	name: "edit_document",
	description: "edit",
	inputSchema: { type: "object" },
} as ToolSchema;

describe("scripted model prose bursts", () => {
	it("splits prose on sentence and clause boundaries, not words", () => {
		const bursts = splitProseBursts(
			"First sentence. Second clause — then a stall; last bit.",
		);
		expect(bursts.length).toBeGreaterThan(1);
		expect(bursts.every((burst) => burst.includes(" "))).toBe(true);
		expect(bursts.some((burst) => burst.split(" ").length === 1)).toBe(
			false,
		);
	});

	it("emits clause-sized text-delta events when no tools are offered", async () => {
		vi.useFakeTimers();
		const events: Array<{ type: string; delta?: string }> = [];
		const consume = (async () => {
			for await (const event of streamScripted({
				messages: [{ role: "user", content: "hello" }],
				tools: [],
			})) {
				events.push(event);
			}
		})();
		await vi.runAllTimersAsync();
		await consume;
		vi.useRealTimers();

		const deltas = events.filter((event) => event.type === "text-delta");
		expect(deltas.length).toBeGreaterThan(1);
		expect(
			deltas.every(
				(event) => (event.delta?.trim().split(/\s+/).length ?? 0) > 1,
			),
		).toBe(true);
		expect(events.at(-1)?.type).toBe("done");
	});

	it("still takes the edit_document tool path when that tool is offered", async () => {
		const events: Array<{ type: string; toolName?: string }> = [];
		for await (const event of streamScripted({
			messages: [{ role: "user", content: "edit this" }],
			tools: [EDIT_DOCUMENT_TOOL],
		})) {
			events.push(event);
		}
		expect(events.some((event) => event.toolName === "read_document")).toBe(
			true,
		);
		expect(events.some((event) => event.type === "text-delta")).toBe(false);
		expect(events.at(-1)?.type).toBe("done");
	});
});
