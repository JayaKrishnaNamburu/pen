import { afterEach, describe, expect, it, vi } from "vitest";
import type { ModelRequestedOperation } from "@pen/types";
import type { PlaygroundStreamChunk } from "./playgroundAISession";
import { streamPlaygroundAIResponse } from "./playgroundAISession";
import {
	createJsonResponse,
	createPlaygroundEditor,
	createTextResponse,
} from "./playgroundAISession.testUtils";

describe("streamPlaygroundAIResponse operation sync", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("waits for a request-triggered sync conflict to clear before posting ai", async () => {
		vi.stubGlobal("window", globalThis);
		vi.resetModules();
		const sessionModule = await import("./playgroundAISession");
		const freshStreamPlaygroundAIResponse =
			sessionModule.streamPlaygroundAIResponse;
		const freshQueuePlaygroundAISessionSync =
			sessionModule.queuePlaygroundAISessionSync;
		const editor = createPlaygroundEditor();
		const encoder = new TextEncoder();
		let syncAttemptCount = 0;
		let aiRequestCount = 0;
		freshQueuePlaygroundAISessionSync(editor, "test");

		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL) => {
				const url = String(input);
				if (url.endsWith("/api/ai/session")) {
					return createJsonResponse({ sessionId: "session-1" });
				}
				if (url.endsWith("/api/ai/session/sync")) {
					syncAttemptCount += 1;
					if (syncAttemptCount < 3) {
						return createTextResponse(
							409,
							"Cannot sync a playground session while an AI request is active.",
						);
					}
					return createJsonResponse({
						sessionId: "session-1",
						lastSyncedAt: Date.now(),
					});
				}
				if (url.endsWith("/api/ai")) {
					aiRequestCount += 1;
					return new Response(
						new ReadableStream({
							start(controller) {
								controller.enqueue(
									encoder.encode(
										'{"type":"meta","sessionId":"session-1","requestId":"request-1"}\n',
									),
								);
								controller.enqueue(
									encoder.encode('{"type":"done"}\n'),
								);
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

		const chunks: PlaygroundStreamChunk[] = [];
		for await (const chunk of freshStreamPlaygroundAIResponse(
			editor,
			"Retry after sync catches up",
		)) {
			chunks.push(chunk);
		}

		expect(syncAttemptCount).toBe(3);
		expect(aiRequestCount).toBe(1);
		expect(chunks).toEqual([
			expect.objectContaining({
				type: "meta",
				sessionId: "session-1",
			}),
			expect.objectContaining({
				type: "done",
			}),
		]);

		editor.destroy();
	});

	it("posts requested operations and yields typed local operation frames", async () => {
		vi.stubGlobal("window", globalThis);
		const editor = createPlaygroundEditor();
		const encoder = new TextEncoder();
		const operation: ModelRequestedOperation = {
			kind: "rewrite-block",
			applyPolicy: "block-replace",
			promptIntent: "rewrite",
			target: {
				kind: "block",
				blockId: "block-1",
				blockType: "paragraph",
				sourceText: "Hello world",
			},
			provenance: {
				documentVersion: 1,
				blockRevision: 3,
			},
		};
		let postedOperation: unknown = null;

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
					});
				}
				if (url.endsWith("/api/ai")) {
					postedOperation = JSON.parse(
						String(init?.body ?? "{}"),
					).operation;
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
										`${JSON.stringify({ type: "replace-preview", text: "Hello planet", operation })}\n`,
									),
								);
								controller.enqueue(
									encoder.encode(
										`${JSON.stringify({ type: "replace-final", text: "Hello planet", operation })}\n`,
									),
								);
								controller.enqueue(
									encoder.encode('{"type":"done"}\n'),
								);
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

		const chunks: PlaygroundStreamChunk[] = [];
		for await (const chunk of streamPlaygroundAIResponse(
			editor,
			"Rewrite this",
			undefined,
			{ operation },
		)) {
			chunks.push(chunk);
		}

		expect(postedOperation).toEqual(operation);
		expect(chunks).toEqual([
			expect.objectContaining({
				type: "meta",
				sessionId: "session-1",
			}),
			expect.objectContaining({
				type: "replace-preview",
				text: "Hello planet",
				operation,
			}),
			expect.objectContaining({
				type: "replace-final",
				text: "Hello planet",
				operation,
			}),
			expect.objectContaining({
				type: "done",
			}),
		]);

		editor.destroy();
	});

	it("preserves document operation synced generation when no synced session generation is known", async () => {
		vi.stubGlobal("window", globalThis);
		const editor = createPlaygroundEditor();
		const encoder = new TextEncoder();
		const operation: ModelRequestedOperation = {
			kind: "document-transform",
			applyPolicy: "document-review",
			promptIntent: "rewrite",
			target: {
				kind: "document",
				activeBlockId: null,
				blockIds: ["block-1"],
				placement: "replace-blocks",
				transform: "rewrite",
			},
			provenance: {
				documentVersion: 3,
				syncedGeneration: 1,
			},
		};
		let postedOperation: unknown = null;

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
					});
				}
				if (url.endsWith("/api/ai")) {
					postedOperation = JSON.parse(
						String(init?.body ?? "{}"),
					).operation;
					return new Response(
						new ReadableStream({
							start(controller) {
								controller.enqueue(
									encoder.encode(
										'{"type":"meta","sessionId":"session-1","requestId":"request-1"}\n',
									),
								);
								controller.enqueue(
									encoder.encode('{"type":"done"}\n'),
								);
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

		for await (const _chunk of streamPlaygroundAIResponse(
			editor,
			"Rewrite the whole story",
			undefined,
			{ operation },
		)) {
			// drain
		}

		expect(postedOperation).toEqual({
			...operation,
		});

		editor.destroy();
	});

	it("aligns hidden selection proposals to the synced session generation", async () => {
		vi.stubGlobal("window", globalThis);
		vi.resetModules();
		const sessionModule = await import("./playgroundAISession");
		const freshStreamPlaygroundAIResponse =
			sessionModule.streamPlaygroundAIResponse;
		const editor = createPlaygroundEditor();
		const encoder = new TextEncoder();
		const operation: ModelRequestedOperation = {
			kind: "rewrite-selection",
			applyPolicy: "selection-replace",
			promptIntent: "rewrite",
			target: {
				kind: "scoped-range",
				blockId: "block-1",
				blockIds: ["block-1"],
				anchor: { blockId: "block-1", offset: 0 },
				focus: { blockId: "block-1", offset: 0 },
				sourceText: "",
				contentFormat: "markdown",
				scope: "document",
			},
			provenance: {
				documentVersion: 3,
				syncedGeneration: 1,
			},
		};
		let postedOperation: unknown = null;

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
						generation: 7,
					});
				}
				if (url.endsWith("/api/ai")) {
					postedOperation = JSON.parse(
						String(init?.body ?? "{}"),
					).operation;
					return new Response(
						new ReadableStream({
							start(controller) {
								controller.enqueue(
									encoder.encode(
										'{"type":"meta","sessionId":"session-1","requestId":"request-1"}\n',
									),
								);
								controller.enqueue(
									encoder.encode('{"type":"done"}\n'),
								);
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

		for await (const _chunk of freshStreamPlaygroundAIResponse(
			editor,
			"Rewrite the whole story",
			undefined,
			{ operation },
		)) {
			// drain
		}

		expect(postedOperation).toMatchObject({
			kind: "rewrite-selection",
			provenance: {
				syncedGeneration: 7,
			},
		});

		editor.destroy();
	});
});
