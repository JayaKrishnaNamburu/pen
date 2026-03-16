import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditor } from "@pen/core";
import { createDefaultSchema } from "@pen/schema-default";
import type { PlaygroundStreamChunk } from "./playgroundAISession";
import { streamPlaygroundAIResponse } from "./playgroundAISession";

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

function createTextResponse(status: number, message: string): Response {
	return new Response(JSON.stringify({ error: message }), {
		status,
		statusText: status === 409 ? "Conflict" : "Error",
		headers: {
			"content-type": "application/json",
		},
	});
}

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
							controller.enqueue(encoder.encode('{"type":"done"}\n'));
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

	it("retries transient active-request conflicts for shared sessions", async () => {
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
					if (aiRequestCount === 1) {
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

		const chunks: PlaygroundStreamChunk[] = [];
		for await (const chunk of streamPlaygroundAIResponse(
			editor,
			"Retry the selection rewrite",
		)) {
			chunks.push(chunk);
		}

		expect(aiRequestCount).toBe(2);
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
								controller.enqueue(encoder.encode('{"type":"done"}\n'));
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
		await expect(sharedStream.next()).resolves.toMatchObject({ done: true });
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
								controller.enqueue(encoder.encode('{"type":"done"}\n'));
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
		await expect(sharedStream.next()).resolves.toMatchObject({ done: true });
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
									controller.enqueue(encoder.encode('{"type":"done"}\n'));
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
		await expect(abandonedStream.next()).resolves.toMatchObject({ done: true });
		expect(serverActive).toBe(false);

		const followUpStream = streamPlaygroundAIResponse(
			editor,
			"Retry after abort",
		)[Symbol.asyncIterator]();
		await expect(
			followUpStream.next(),
		).resolves.toMatchObject({
			done: false,
			value: expect.objectContaining({
				type: "meta",
				sessionId: "session-1",
			}),
		});
		expect(aiRequestCount).toBe(2);

		editor.destroy();
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
});
