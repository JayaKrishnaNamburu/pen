import { afterEach, describe, expect, it, vi } from "vitest";
import type { ModelRequestedOperation } from "@pen/types";
import type { PlaygroundStreamChunk } from "./playgroundAISession";
import { streamPlaygroundAIResponse } from "./playgroundAISession";
import {
	createJsonResponse,
	createPlaygroundEditor,
	createTextResponse,
} from "./playgroundAISession.testUtils";

describe("streamPlaygroundAIResponse", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("waits for the response body to close before yielding a terminal chunk", async () => {
		vi.stubGlobal("window", globalThis);
		const editor = createPlaygroundEditor();
		const encoder = new TextEncoder();
		let releaseBody: (() => void) | null = null;
		let serverActive = false;

		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL) => {
				const url = String(input);
				if (url.endsWith("/api/ai/session")) {
					return createJsonResponse({ sessionId: "session-1" });
				}
				if (url.endsWith("/api/ai/session/sync")) {
					if (serverActive) {
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
					if (serverActive) {
						return createTextResponse(
							409,
							"This playground session already has an active AI request.",
						);
					}
					serverActive = true;
					const body = new ReadableStream({
						start(controller) {
							controller.enqueue(
								encoder.encode(
									'{"type":"meta","sessionId":"session-1","requestId":"request-1"}\n',
								),
							);
							controller.enqueue(
								encoder.encode('{"type":"done"}\n'),
							);
							releaseBody = () => {
								serverActive = false;
								controller.close();
							};
						},
						cancel() {
							serverActive = false;
						},
					});
					return new Response(body, {
						status: 200,
						headers: {
							"content-type": "application/x-ndjson",
						},
					});
				}
				throw new Error(`Unexpected fetch URL: ${url}`);
			}),
		);

		const stream = streamPlaygroundAIResponse(
			editor,
			"Rewrite the selection",
		)[Symbol.asyncIterator]();
		const firstChunk = await stream.next();
		expect(firstChunk.done).toBe(false);
		expect(firstChunk.value).toMatchObject({
			type: "meta",
			sessionId: "session-1",
		});

		let terminalResolved = false;
		const terminalChunkPromise = stream.next().then((result) => {
			terminalResolved = true;
			return result;
		});
		await Promise.resolve();
		expect(terminalResolved).toBe(false);

		const release: (() => void) | null = releaseBody;
		if (release) {
			(release as () => void)();
		}
		const terminalChunk = await terminalChunkPromise;
		expect(terminalChunk.done).toBe(false);
		expect(terminalChunk.value).toMatchObject({ type: "done" });

		const followUpStream = streamPlaygroundAIResponse(
			editor,
			"Rewrite again",
		)[Symbol.asyncIterator]();
		releaseBody = null;
		await expect(followUpStream.next()).resolves.toMatchObject({
			value: {
				type: "meta",
				sessionId: "session-1",
			},
		});

		editor.destroy();
	});

	it("keeps retrying shared-session requests until the active request clears", async () => {
		vi.stubGlobal("window", globalThis);
		const editor = createPlaygroundEditor();
		const encoder = new TextEncoder();
		let aiRequestCount = 0;

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
					});
				}
				if (url.endsWith("/api/ai")) {
					aiRequestCount += 1;
					if (aiRequestCount <= 4) {
						return createTextResponse(
							409,
							"This playground session already has an active AI request.",
						);
					}
					return new Response(
						new ReadableStream({
							start(controller) {
								controller.enqueue(
									encoder.encode(
										'{"type":"meta","sessionId":"session-1","requestId":"request-2"}\n',
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
			"Retry the selection rewrite",
		)) {
			chunks.push(chunk);
		}

		expect(aiRequestCount).toBe(5);
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
});
