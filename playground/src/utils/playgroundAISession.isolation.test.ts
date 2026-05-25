import { afterEach, describe, expect, it, vi } from "vitest";
import type { ModelRequestedOperation } from "@pen/types";
import type { PlaygroundStreamChunk } from "./playgroundAISession";
import { streamPlaygroundAIResponse } from "./playgroundAISession";
import {
	createJsonResponse,
	createPlaygroundEditor,
	createTextResponse,
} from "./playgroundAISession.testUtils";

describe("streamPlaygroundAIResponse isolated lanes", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("uses an isolated session for inline-edit lanes while bottom-chat is still active", async () => {
		vi.stubGlobal("window", globalThis);
		vi.resetModules();
		const sessionModule = await import("./playgroundAISession");
		const freshStreamPlaygroundAIResponse =
			sessionModule.streamPlaygroundAIResponse;
		const editor = createPlaygroundEditor();
		const encoder = new TextEncoder();
		let createdSessionCount = 0;
		let releaseSharedBody: (() => void) | null = null;
		const activeSessions = new Set<string>();
		const aiRequestSessionIds: string[] = [];

		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				if (url.endsWith("/api/ai/session")) {
					createdSessionCount += 1;
					return createJsonResponse({
						sessionId: `session-${createdSessionCount}`,
					});
				}
				if (url.endsWith("/api/ai/session/sync")) {
					const body = JSON.parse(String(init?.body ?? "{}")) as {
						sessionId?: string;
					};
					if (body.sessionId && activeSessions.has(body.sessionId)) {
						return createTextResponse(
							409,
							"Cannot sync a playground session while an AI request is active.",
						);
					}
					return createJsonResponse({
						sessionId: body.sessionId ?? null,
						lastSyncedAt: Date.now(),
					});
				}
				if (url.endsWith("/api/ai")) {
					const body = JSON.parse(String(init?.body ?? "{}")) as {
						sessionId?: string;
					};
					const sessionId = body.sessionId ?? "missing-session";
					aiRequestSessionIds.push(sessionId);
					if (activeSessions.has(sessionId)) {
						return createTextResponse(
							409,
							"This playground session already has an active AI request.",
						);
					}
					activeSessions.add(sessionId);
					if (sessionId === "session-1") {
						const bodyStream = new ReadableStream({
							start(controller) {
								controller.enqueue(
									encoder.encode(
										'{"type":"meta","sessionId":"session-1","requestId":"request-shared"}\n',
									),
								);
								releaseSharedBody = () => {
									activeSessions.delete("session-1");
									controller.close();
								};
							},
							cancel() {
								activeSessions.delete("session-1");
							},
						});
						return new Response(bodyStream, {
							status: 200,
							headers: {
								"content-type": "application/x-ndjson",
							},
						});
					}
					return new Response(
						new ReadableStream({
							start(controller) {
								controller.enqueue(
									encoder.encode(
										`{"type":"meta","sessionId":"${sessionId}","requestId":"request-isolated"}\n`,
									),
								);
								controller.enqueue(
									encoder.encode('{"type":"done"}\n'),
								);
								activeSessions.delete(sessionId);
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

		const sharedAbortController = new AbortController();
		const sharedStream = freshStreamPlaygroundAIResponse(
			editor,
			"Keep chatting",
			sharedAbortController.signal,
		)[Symbol.asyncIterator]();
		await expect(sharedStream.next()).resolves.toMatchObject({
			done: false,
			value: expect.objectContaining({
				type: "meta",
				sessionId: "session-1",
			}),
		});

		const inlineChunks: PlaygroundStreamChunk[] = [];
		for await (const chunk of freshStreamPlaygroundAIResponse(
			editor,
			"Rewrite the selection",
			undefined,
			{
				lane: "inline-edit",
				requestMode: "inline-edit",
			},
		)) {
			inlineChunks.push(chunk);
		}

		expect(createdSessionCount).toBe(2);
		expect(aiRequestSessionIds).toEqual(["session-1", "session-2"]);
		expect(inlineChunks).toEqual([
			expect.objectContaining({
				type: "meta",
				sessionId: "session-2",
			}),
			expect.objectContaining({
				type: "done",
			}),
		]);

		const releaseShared = releaseSharedBody as unknown;
		if (typeof releaseShared === "function") {
			(releaseShared as () => void)();
		}
		sharedAbortController.abort();
		await expect(sharedStream.next()).resolves.toMatchObject({
			done: true,
		});
		editor.destroy();
	});

	it("uses an isolated session for inline-autocomplete lanes while bottom-chat is still active", async () => {
		vi.stubGlobal("window", globalThis);
		vi.resetModules();
		const sessionModule = await import("./playgroundAISession");
		const freshStreamPlaygroundAIResponse =
			sessionModule.streamPlaygroundAIResponse;
		const editor = createPlaygroundEditor();
		const encoder = new TextEncoder();
		let createdSessionCount = 0;
		let releaseSharedBody: (() => void) | null = null;
		const activeSessions = new Set<string>();
		const aiRequestSessionIds: string[] = [];

		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				if (url.endsWith("/api/ai/session")) {
					createdSessionCount += 1;
					return createJsonResponse({
						sessionId: `session-${createdSessionCount}`,
					});
				}
				if (url.endsWith("/api/ai/session/sync")) {
					const body = JSON.parse(String(init?.body ?? "{}")) as {
						sessionId?: string;
					};
					if (body.sessionId && activeSessions.has(body.sessionId)) {
						return createTextResponse(
							409,
							"Cannot sync a playground session while an AI request is active.",
						);
					}
					return createJsonResponse({
						sessionId: body.sessionId ?? null,
						lastSyncedAt: Date.now(),
					});
				}
				if (url.endsWith("/api/ai")) {
					const body = JSON.parse(String(init?.body ?? "{}")) as {
						sessionId?: string;
					};
					const sessionId = body.sessionId ?? "missing-session";
					aiRequestSessionIds.push(sessionId);
					if (activeSessions.has(sessionId)) {
						return createTextResponse(
							409,
							"This playground session already has an active AI request.",
						);
					}
					activeSessions.add(sessionId);
					if (sessionId === "session-1") {
						const bodyStream = new ReadableStream({
							start(controller) {
								controller.enqueue(
									encoder.encode(
										'{"type":"meta","sessionId":"session-1","requestId":"request-shared"}\n',
									),
								);
								releaseSharedBody = () => {
									activeSessions.delete("session-1");
									controller.close();
								};
							},
							cancel() {
								activeSessions.delete("session-1");
							},
						});
						return new Response(bodyStream, {
							status: 200,
							headers: {
								"content-type": "application/x-ndjson",
							},
						});
					}
					return new Response(
						new ReadableStream({
							start(controller) {
								controller.enqueue(
									encoder.encode(
										`{"type":"meta","sessionId":"${sessionId}","requestId":"request-isolated"}\n`,
									),
								);
								controller.enqueue(
									encoder.encode('{"type":"done"}\n'),
								);
								activeSessions.delete(sessionId);
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

		const sharedAbortController = new AbortController();
		const sharedStream = freshStreamPlaygroundAIResponse(
			editor,
			"Keep chatting",
			sharedAbortController.signal,
		)[Symbol.asyncIterator]();
		await expect(sharedStream.next()).resolves.toMatchObject({
			done: false,
			value: expect.objectContaining({
				type: "meta",
				sessionId: "session-1",
			}),
		});

		const autocompleteChunks: PlaygroundStreamChunk[] = [];
		for await (const chunk of freshStreamPlaygroundAIResponse(
			editor,
			'prefix="Hello"\ncursor_here=true\nsuffix=""',
			undefined,
			{
				lane: "autocomplete",
				requestMode: "inline-autocomplete",
			},
		)) {
			autocompleteChunks.push(chunk);
		}

		expect(createdSessionCount).toBe(2);
		expect(aiRequestSessionIds).toEqual(["session-1", "session-2"]);
		expect(autocompleteChunks).toEqual([
			expect.objectContaining({
				type: "meta",
				sessionId: "session-2",
			}),
			expect.objectContaining({
				type: "done",
			}),
		]);

		const releaseShared = releaseSharedBody as unknown;
		if (typeof releaseShared === "function") {
			(releaseShared as () => void)();
		}
		sharedAbortController.abort();
		await expect(sharedStream.next()).resolves.toMatchObject({
			done: true,
		});
		editor.destroy();
	});

	it("cancels an abandoned stream so the shared session unlocks", async () => {
		vi.stubGlobal("window", globalThis);
		const editor = createPlaygroundEditor();
		const encoder = new TextEncoder();
		let serverActive = false;
		let aiRequestCount = 0;

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
					aiRequestCount += 1;
					if (serverActive) {
						return createTextResponse(
							409,
							"This playground session already has an active AI request.",
						);
					}
					serverActive = true;
					return new Response(
						new ReadableStream({
							start(controller) {
								controller.enqueue(
									encoder.encode(
										`{"type":"meta","sessionId":"session-1","requestId":"request-${aiRequestCount}"}\n`,
									),
								);
								if (aiRequestCount > 1) {
									controller.enqueue(
										encoder.encode('{"type":"done"}\n'),
									);
									controller.close();
								}
							},
							cancel() {
								serverActive = false;
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

		const abortController = new AbortController();
		const abandonedStream = streamPlaygroundAIResponse(
			editor,
			"Start then abandon",
			abortController.signal,
		)[Symbol.asyncIterator]();
		await expect(abandonedStream.next()).resolves.toMatchObject({
			done: false,
			value: expect.objectContaining({
				type: "meta",
				sessionId: "session-1",
			}),
		});

		abortController.abort();
		await expect(abandonedStream.next()).resolves.toMatchObject({
			done: true,
		});
		expect(serverActive).toBe(false);

		const followUpStream = streamPlaygroundAIResponse(
			editor,
			"Retry after abort",
		)[Symbol.asyncIterator]();
		await expect(followUpStream.next()).resolves.toMatchObject({
			done: false,
			value: expect.objectContaining({
				type: "meta",
				sessionId: "session-1",
			}),
		});
		expect(aiRequestCount).toBe(2);

		editor.destroy();
	});
});
