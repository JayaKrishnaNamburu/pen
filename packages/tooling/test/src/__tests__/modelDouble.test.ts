import { afterEach, describe, expect, it, vi } from "vitest";
import type { AIRequestContext, ModelStreamEvent } from "@input/pen-types";
import {
	abortHalfwayGenerationParts,
	createModelDouble,
	failingToolCallParts,
} from "../modelDouble";

afterEach(() => {
	vi.useRealTimers();
});

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
	const items: T[] = [];
	for await (const item of iterable) {
		items.push(item);
	}
	return items;
}

function sampleContext(
	overrides: Partial<AIRequestContext> = {},
): AIRequestContext {
	return {
		feature: "generation",
		messages: [{ role: "user", content: "Continue" }],
		documentExcerpts: [
			{
				blockId: "block-1",
				kind: "target",
				text: "SECRET excerpt",
			},
		],
		tools: [],
		...overrides,
	};
}

describe("AIB6 model double", () => {
	it("AIB6: records AIRequestContext from request() and stream()", async () => {
		const double = createModelDouble({
			responses: [{ text: "ok" }],
		});
		const context = sampleContext({ feature: "autocomplete" });

		await collect(double.request(context));
		await collect(
			double.stream({
				messages: [{ role: "user", content: "from stream" }],
				tools: [{ name: "echo", description: "", inputSchema: {} }],
			}),
		);

		expect(double.requests).toHaveLength(2);
		expect(double.requests[0]).toEqual(context);
		expect(double.requests[1]).toEqual({
			feature: "generation",
			messages: [{ role: "user", content: "from stream" }],
			documentExcerpts: [],
			tools: [{ name: "echo", description: "", inputSchema: {} }],
		});
	});

	it("AIB6: a redacting filter changes what is recorded; a refusing filter yields nothing", async () => {
		const redacting = createModelDouble({
			responses: [{ text: "ok" }],
			filter: (context) => ({
				...context,
				documentExcerpts: context.documentExcerpts.map((excerpt) => ({
					...excerpt,
					text: excerpt.text.replace("SECRET", "[redacted]"),
				})),
			}),
		});
		await collect(redacting.request(sampleContext()));
		expect(redacting.requests[0]?.documentExcerpts[0]?.text).toBe(
			"[redacted] excerpt",
		);

		const fetchSpy = vi.spyOn(globalThis, "fetch");
		const refusing = createModelDouble({
			responses: [{ text: "should-not-run" }],
			filter: () => null,
		});
		const events = await collect(refusing.request(sampleContext()));
		expect(events).toEqual([]);
		expect(refusing.requests).toEqual([]);
		expect(fetchSpy).not.toHaveBeenCalled();
		fetchSpy.mockRestore();
	});

	it("AIB6: scripts text, error, and sequential responses without a network", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch");
		const double = createModelDouble({
			responses: [
				{ text: ["Hel", "lo"] },
				{ error: "model failed" },
			],
		});

		expect(await collect(double.stream({ messages: [], tools: [] }))).toEqual([
			{ type: "text-delta", delta: "Hel" },
			{ type: "text-delta", delta: "lo" },
			{ type: "done" },
		]);
		expect(await collect(double.stream({ messages: [], tools: [] }))).toEqual([
			{ type: "error", error: "model failed" },
		]);
		expect(fetchSpy).not.toHaveBeenCalled();
		fetchSpy.mockRestore();
	});

	it("AIB6: injects a hundred mutating tool calls for budget tests", async () => {
		const toolCalls = Array.from({ length: 100 }, (_, index) => ({
			toolCallId: `call-${index}`,
			toolName: "delete_block",
			input: { blockId: "block-1" },
		}));
		const double = createModelDouble({ toolCalls });
		const events = await collect(double.stream({ messages: [], tools: [] }));
		const calls = events.filter((event) => event.type === "tool-call");

		expect(calls).toHaveLength(100);
		expect(calls[0]).toMatchObject({
			toolCallId: "call-0",
			toolName: "delete_block",
		});
		expect(calls[99]).toMatchObject({ toolCallId: "call-99" });
		expect(events.at(-1)).toEqual({ type: "done" });
	});

	it("AIB6: yields injectable stream parts including malformed ones", async () => {
		const double = createModelDouble({
			parts: [
				{ type: "gen-start", zoneId: "zone-1", blockId: "block-1" },
				{ type: "block-update" },
				{ type: "not-a-part", extra: true },
			],
		});

		expect(await collect(double.streamParts())).toEqual([
			{ type: "gen-start", zoneId: "zone-1", blockId: "block-1" },
			{ type: "block-update" },
			{ type: "not-a-part", extra: true },
		]);
	});

	it("AIB6: ships abort-halfway and failing-tool-call example sequences", async () => {
		const aborting = createModelDouble({
			parts: abortHalfwayGenerationParts(),
		});
		expect(await collect(aborting.streamParts())).toEqual([
			{ type: "gen-start", zoneId: "zone-1", blockId: "block-1" },
			{ type: "gen-delta", zoneId: "zone-1", delta: "Hello" },
			{ type: "abort", reason: "cancelled" },
		]);

		const failing = createModelDouble({
			parts: failingToolCallParts(),
		});
		expect(await collect(failing.streamParts())).toEqual([
			{
				type: "tool-input-available",
				toolCallId: "tool-1",
				toolName: "delete_block",
				input: { blockId: "block-1" },
			},
			{
				type: "tool-error",
				toolCallId: "tool-1",
				error: "tool failed",
			},
			{ type: "done" },
		]);
	});

	it("AIB6: abortAfter and AbortSignal stop a stream mid-sequence", async () => {
		const capped = createModelDouble({
			responses: [{ text: ["a", "b", "c"] }],
			abortAfter: 2,
		});
		expect(await collect(capped.stream({ messages: [], tools: [] }))).toEqual([
			{ type: "text-delta", delta: "a" },
			{ type: "text-delta", delta: "b" },
		]);

		const controller = new AbortController();
		const double = createModelDouble({
			responses: [{ text: ["one", "two", "three"] }],
		});
		const seen: ModelStreamEvent[] = [];
		const running = (async () => {
			for await (const event of double.stream({
				messages: [],
				tools: [],
				signal: controller.signal,
			})) {
				seen.push(event);
				if (event.type === "text-delta" && event.delta === "one") {
					controller.abort();
				}
			}
		})();
		await running;
		expect(seen).toEqual([{ type: "text-delta", delta: "one" }]);
	});

	it("AIB6: delayMs waits a fixed interval before each yield", async () => {
		vi.useFakeTimers();
		const double = createModelDouble({
			delayMs: 25,
			responses: [{ text: ["one", "two"] }],
		});
		const seen: string[] = [];
		const done = (async () => {
			for await (const event of double.stream({ messages: [], tools: [] })) {
				if (event.type === "text-delta") {
					seen.push(event.delta);
				}
			}
		})();

		expect(seen).toEqual([]);
		await vi.advanceTimersByTimeAsync(25);
		expect(seen).toEqual(["one"]);
		await vi.advanceTimersByTimeAsync(25);
		expect(seen).toEqual(["one", "two"]);
		await vi.advanceTimersByTimeAsync(25);
		await done;
		expect(seen).toEqual(["one", "two"]);
	});
});
