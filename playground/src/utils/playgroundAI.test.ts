import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditor } from "@pen/core";
import { createDefaultSchema } from "@pen/schema-default";
import type { ModelRequestedOperation } from "@pen/types";
import { createPlaygroundAIModel } from "./playgroundAI";

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

function createPlaygroundEditor() {
	return createEditor({
		schema: createDefaultSchema(),
		preset: noDefaultExtensionsPreset,
	});
}

function createJsonResponse(payload: unknown): Response {
	return new Response(JSON.stringify(payload), {
		status: 200,
		headers: {
			"content-type": "application/json",
		},
	});
}

describe("createPlaygroundAIModel", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("passes through raw text deltas for inline autocomplete requests", async () => {
		vi.stubGlobal("window", globalThis);
		const editor = createPlaygroundEditor();
		const encoder = new TextEncoder();

		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL) => {
				const url = String(input);
				if (url.endsWith("/api/ai/session")) {
					return createJsonResponse({ sessionId: "session-1" });
				}
				if (url.endsWith("/api/ai/session/sync")) {
					return createJsonResponse({
						sessionId: "session-1",
						lastSyncedAt: Date.now(),
						revision: 1,
						generation: 1,
					});
				}
				if (url.endsWith("/api/ai")) {
					return new Response(
						new ReadableStream({
							start(controller) {
								controller.enqueue(
									encoder.encode(
										'{"type":"meta","sessionId":"session-1","requestId":"request-1"}\n',
									),
								);
								controller.enqueue(
									encoder.encode(
										`${JSON.stringify({
											type: "text-delta",
											delta: "cat",
										})}\n`,
									),
								);
								controller.enqueue(encoder.encode('{"type":"done"}\n'));
								controller.close();
							},
						}),
						{
							status: 200,
							headers: {
								"content-type": "application/x-ndjson",
							},
						},
					);
				}
				throw new Error(`Unexpected fetch URL: ${url}`);
			}),
		);

		const model = createPlaygroundAIModel(() => editor);
		const events = [];
		for await (const event of model.stream({
			messages: [
				{
					role: "user",
					content: ['prefix="The "', "cursor_here=true", 'suffix=""'].join("\n"),
				},
			],
			tools: [],
			signal: undefined,
			requestMode: "inline-autocomplete",
			operation: undefined,
		})) {
			events.push(event);
		}

		expect(events).toEqual([
			expect.objectContaining({
				type: "text-delta",
				delta: "cat",
			}),
			expect.objectContaining({
				type: "done",
			}),
		]);

		editor.destroy();
	});

	it("reconstructs inline selection operations for legacy inline-edit prompts", async () => {
		vi.stubGlobal("window", globalThis);
		const editor = createPlaygroundEditor();
		const blockId = editor.firstBlock()!.id;
		editor.apply(
			[{ type: "insert-text", blockId, offset: 0, text: "Hello world" }],
			{ origin: "system" },
		);

		const encoder = new TextEncoder();
		let postedOperation: ModelRequestedOperation | null = null;

		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				if (url.endsWith("/api/ai/session")) {
					return createJsonResponse({ sessionId: "session-1" });
				}
				if (url.endsWith("/api/ai/session/sync")) {
					return createJsonResponse({
						sessionId: "session-1",
						lastSyncedAt: Date.now(),
						revision: 1,
						generation: 1,
					});
				}
				if (url.endsWith("/api/ai")) {
					postedOperation = JSON.parse(
						String(init?.body ?? "{}"),
					).operation as ModelRequestedOperation | null;
					return new Response(
						new ReadableStream({
							start(controller) {
								controller.enqueue(
									encoder.encode(
										'{"type":"meta","sessionId":"session-1","requestId":"request-1"}\n',
									),
								);
								controller.enqueue(
									encoder.encode(
										`${JSON.stringify({
											type: "replace-preview",
											text: "planet",
											operation: postedOperation,
										})}\n`,
									),
								);
								controller.enqueue(
									encoder.encode(
										`${JSON.stringify({
											type: "replace-final",
											text: "planet",
											operation: postedOperation,
										})}\n`,
									),
								);
								controller.enqueue(encoder.encode('{"type":"done"}\n'));
								controller.close();
							},
						}),
						{
							status: 200,
							headers: {
								"content-type": "application/x-ndjson",
							},
						},
					);
				}
				throw new Error(`Unexpected fetch URL: ${url}`);
			}),
		);

		const model = createPlaygroundAIModel(() => editor);
		const prompt = [
			"Working set source: selection",
			"Document version: 1",
			"View mode: resolved",
			"Document context:",
			JSON.stringify({
				selection: {
					type: "text",
					anchor: { blockId, offset: 6 },
					focus: { blockId, offset: 11 },
					isCollapsed: false,
					isMultiBlock: false,
					blockRange: [blockId],
				},
				selectedText: "world",
			}),
			"",
			"User request:",
			"Make this friendlier",
		].join("\n");

		const events = [];
		for await (const event of model.stream({
			messages: [{ role: "user", content: prompt }],
			tools: [],
			signal: undefined,
			requestMode: "inline-edit",
			operation: undefined,
		})) {
			events.push(event);
		}

		expect(postedOperation).toMatchObject({
			kind: "rewrite-selection",
			applyPolicy: "selection-replace",
			target: {
				kind: "selection",
				blockId,
				sourceText: "world",
			},
		});
		expect(events).toEqual([
			expect.objectContaining({
				type: "text-delta",
				delta: "planet",
			}),
			expect.objectContaining({
				type: "done",
			}),
		]);
	});
});
