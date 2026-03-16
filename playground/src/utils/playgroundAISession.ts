import type { Editor } from "@pen/types";
import {
	PLAYGROUND_AI_ENDPOINT,
	PLAYGROUND_AI_SESSION_ENDPOINT,
	PLAYGROUND_AI_SESSION_SYNC_ENDPOINT,
	PLAYGROUND_AI_SYNC_DEBOUNCE_MS,
} from "../constants/playgroundAI";
import { logAutocompleteDebug } from "./autocompleteDebug";
import { serializeEditorState } from "./editorState";

export type PlaygroundAIPhase =
	| "idle"
	| "creating-session"
	| "syncing"
	| "thinking"
	| "tool-calling"
	| "writing"
	| "complete"
	| "error";

export interface PlaygroundAIRequestMetrics {
	requestId: string | null;
	sessionId: string | null;
	requestMode: string | null;
	requestModel: string | null;
	contextFormat: string | null;
	firstToolStartMs: number | null;
	firstToolResultMs: number | null;
	firstTextDeltaServerMs: number | null;
	firstTextDeltaBrowserMs: number | null;
	totalServerMs: number | null;
	totalBrowserMs: number | null;
	toolCallCount: number;
	toolExecutionMs: number | null;
	contextBytesJson: number | null;
	contextEstimatedTokensJson: number | null;
}

export interface PlaygroundAIClientState {
	sessionId: string | null;
	phase: PlaygroundAIPhase;
	syncStatus: "idle" | "syncing" | "error";
	lastSyncMs: number | null;
	lastSyncAt: number | null;
	hasPendingSync: boolean;
	lastRequest: PlaygroundAIRequestMetrics | null;
	lastError: string | null;
}

export interface PlaygroundStreamChunk {
	type?: unknown;
	delta?: unknown;
	data?: unknown;
	error?: unknown;
	requestId?: unknown;
	sessionId?: unknown;
	requestMode?: unknown;
	requestModel?: unknown;
	contextFormat?: unknown;
	phase?: unknown;
	firstToolStartMs?: unknown;
	firstToolResultMs?: unknown;
	firstTextDeltaServerMs?: unknown;
	totalServerMs?: unknown;
	toolCallCount?: unknown;
	toolExecutionMs?: unknown;
	contextBytesJson?: unknown;
	contextEstimatedTokensJson?: unknown;
}

export type PlaygroundExecutionLane =
	| "bottom-chat"
	| "inline-edit"
	| "autocomplete"
	| "prefetch";

interface PlaygroundAIRequestOptions {
	lane?: PlaygroundExecutionLane;
	requestMode?: string;
}

const PLAYGROUND_AI_ACTIVE_SYNC_CONFLICT =
	"Cannot sync a playground session while an AI request is active.";
const PLAYGROUND_AI_ACTIVE_REQUEST_CONFLICT =
	"This playground session already has an active AI request.";
const PLAYGROUND_AI_ACTIVE_SYNC_RETRY_LIMIT = 8;
const PLAYGROUND_AI_ACTIVE_SYNC_RETRY_MS = 75;
const PLAYGROUND_AI_ACTIVE_REQUEST_RETRY_LIMIT = 2;
const PLAYGROUND_AI_ACTIVE_REQUEST_RETRY_MS = 75;

const INITIAL_STATE: PlaygroundAIClientState = {
	sessionId: null,
	phase: "idle",
	syncStatus: "idle",
	lastSyncMs: null,
	lastSyncAt: null,
	hasPendingSync: false,
	lastRequest: null,
	lastError: null,
};

let state = INITIAL_STATE;
const subscribers = new Set<() => void>();
let pendingSyncTimer: number | null = null;
let pendingSyncPromise: Promise<PlaygroundAISyncResult> | null = null;
let pendingSessionPromise: Promise<string> | null = null;
let activeSharedRequestCount = 0;
let pendingSyncEditor: Editor | null = null;
let pendingSyncReason = "background";
let latestRequestStartedAt = 0;
const editorSyncState = new WeakMap<
	Editor,
	{ revision: number; syncedRevision: number }
>();

export function subscribeToPlaygroundAIState(callback: () => void): () => void {
	subscribers.add(callback);
	return () => {
		subscribers.delete(callback);
	};
}

export function getPlaygroundAIStateSnapshot(): PlaygroundAIClientState {
	return state;
}

export async function ensurePlaygroundAISession(
	signal?: AbortSignal,
): Promise<string> {
	if (state.sessionId) {
		return state.sessionId;
	}
	if (pendingSessionPromise) {
		return pendingSessionPromise;
	}

	pendingSessionPromise = createPlaygroundAISession(signal, {
		persistToState: true,
	}).finally(() => {
		pendingSessionPromise = null;
	});

	return pendingSessionPromise;
}

export function queuePlaygroundAISessionSync(editor: Editor, reason = "background"): void {
	const syncState = getEditorSyncState(editor);
	syncState.revision += 1;
	pendingSyncEditor = editor;
	pendingSyncReason = reason;
	updateState({ hasPendingSync: syncState.revision > syncState.syncedRevision });

	if (activeSharedRequestCount > 0) {
		return;
	}

	if (pendingSyncTimer != null) {
		window.clearTimeout(pendingSyncTimer);
	}

	pendingSyncTimer = window.setTimeout(() => {
		pendingSyncTimer = null;
		if (!pendingSyncEditor) {
			return;
		}
		void flushPlaygroundAISessionSync(pendingSyncEditor, pendingSyncReason);
	}, PLAYGROUND_AI_SYNC_DEBOUNCE_MS);
}

export async function flushPlaygroundAISessionSync(
	editor: Editor,
	reason = "manual",
	signal?: AbortSignal,
): Promise<void> {
	for (let retryCount = 0; ; retryCount += 1) {
		const syncState = getEditorSyncState(editor);
		pendingSyncEditor = editor;
		pendingSyncReason = reason;

		if (pendingSyncTimer != null) {
			window.clearTimeout(pendingSyncTimer);
			pendingSyncTimer = null;
		}

		if (activeSharedRequestCount > 0) {
			updateState({ hasPendingSync: syncState.revision > syncState.syncedRevision });
			return;
		}

		if (syncState.revision <= syncState.syncedRevision) {
			updateState({ hasPendingSync: false });
			return;
		}

		if (pendingSyncPromise) {
			const result = await pendingSyncPromise;
			if (syncState.revision <= syncState.syncedRevision) {
				updateState({ hasPendingSync: false });
				return;
			}
			if (
				result === "deferred" &&
				reason === "request" &&
				retryCount < PLAYGROUND_AI_ACTIVE_SYNC_RETRY_LIMIT
			) {
				await delayPlaygroundAIRequestRetry(
					PLAYGROUND_AI_ACTIVE_SYNC_RETRY_MS,
					signal,
				);
			}
			continue;
		}

		pendingSyncPromise = syncPlaygroundAISession(editor, signal).finally(() => {
			pendingSyncPromise = null;
			if (
				activeSharedRequestCount === 0 &&
				state.hasPendingSync &&
				pendingSyncEditor
			) {
				queuePlaygroundAISessionSync(pendingSyncEditor, pendingSyncReason);
			}
		});

		const result = await pendingSyncPromise;
		if (syncState.revision <= syncState.syncedRevision) {
			updateState({ hasPendingSync: false });
			return;
		}
		if (
			result === "deferred" &&
			reason === "request" &&
			retryCount < PLAYGROUND_AI_ACTIVE_SYNC_RETRY_LIMIT
		) {
			await delayPlaygroundAIRequestRetry(
				PLAYGROUND_AI_ACTIVE_SYNC_RETRY_MS,
				signal,
			);
			continue;
		}
		return;
	}
}

export async function requestPlaygroundAIResponse(
	editor: Editor,
	prompt: string,
	signal?: AbortSignal,
	options?: PlaygroundAIRequestOptions,
): Promise<Response> {
	const behavior = resolvePlaygroundExecutionBehavior(options);
	const sessionId = behavior.usesSharedSession
		? await ensurePlaygroundAISession(signal)
		: await createPlaygroundAISession(signal, { persistToState: false });
	for (
		let retryCount = 0;
		;
		retryCount += 1
	) {
		if (!behavior.usesSharedSession) {
			await syncPlaygroundAISessionWithId(sessionId, editor, signal, {
				updateClientState: false,
			});
		} else {
			await flushPlaygroundAISessionSync(editor, "request", signal);
		}
		logAutocompleteDebug("ai request starting", {
			sessionId,
			promptLength: prompt.length,
			lane: behavior.lane,
			isolatedSession: !behavior.usesSharedSession,
			retryCount,
		});

		if (behavior.usesSharedSession) {
			activeSharedRequestCount += 1;
			latestRequestStartedAt = performance.now();
		}
		if (behavior.updateClientState) {
			updateState({
				phase: "thinking",
				lastError: null,
				lastRequest: {
					requestId: null,
					sessionId,
					requestMode: null,
					requestModel: null,
					contextFormat: null,
					firstToolStartMs: null,
					firstToolResultMs: null,
					firstTextDeltaServerMs: null,
					firstTextDeltaBrowserMs: null,
					totalServerMs: null,
					totalBrowserMs: null,
					toolCallCount: 0,
					toolExecutionMs: null,
					contextBytesJson: null,
					contextEstimatedTokensJson: null,
				},
			});
		}

		try {
			const response = await fetch(PLAYGROUND_AI_ENDPOINT, {
				method: "POST",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({
					sessionId,
					prompt,
					requestMode: options?.requestMode ?? null,
				}),
				signal,
			});
			logAutocompleteDebug("ai request response received", {
				ok: response.ok,
				status: response.status,
				statusText: response.statusText,
				retryCount,
			});

			if (!response.ok) {
				const message = await readErrorMessage(response);
				logAutocompleteDebug("ai request failed before stream", {
					status: response.status,
					message,
					retryCount,
				});
				if (
					behavior.usesSharedSession &&
					response.status === 409 &&
					message === PLAYGROUND_AI_ACTIVE_REQUEST_CONFLICT &&
					retryCount < PLAYGROUND_AI_ACTIVE_REQUEST_RETRY_LIMIT
				) {
					finishActiveRequest("complete", behavior);
					logAutocompleteDebug("ai request retrying after active-request conflict", {
						sessionId,
						retryCount,
					});
					await delayPlaygroundAIRequestRetry(
						PLAYGROUND_AI_ACTIVE_REQUEST_RETRY_MS,
						signal,
					);
					continue;
				}
				if (
					!behavior.usesSharedSession &&
					response.status === 409 &&
					message === PLAYGROUND_AI_ACTIVE_REQUEST_CONFLICT
				) {
					throw new Error(
						`Isolated ${behavior.lane} request unexpectedly had an active AI request.`,
					);
				}
				throw new Error(message);
			}

			return response;
		} catch (error) {
			logAutocompleteDebug("ai request threw", {
				error: error instanceof Error ? error.message : String(error),
				retryCount,
			});
			finishActiveRequest("error", behavior);
			if (behavior.updateClientState) {
				updateState({
					lastError: error instanceof Error ? error.message : String(error),
				});
			}
			throw error;
		}
	}
}

export async function* streamPlaygroundAIResponse(
	editor: Editor,
	prompt: string,
	signal?: AbortSignal,
	options?: PlaygroundAIRequestOptions,
): AsyncIterable<PlaygroundStreamChunk> {
	const behavior = resolvePlaygroundExecutionBehavior(options);
	const response = await requestPlaygroundAIResponse(
		editor,
		prompt,
		signal,
		options,
	);
	let terminalPhase: Extract<PlaygroundAIPhase, "complete" | "error"> | null =
		null;
	let terminalChunk: PlaygroundStreamChunk | null = null;
	logAutocompleteDebug("ai stream opened");

	if (!response.body) {
		const message = await readErrorMessage(response);
		logAutocompleteDebug("ai stream missing response body", {
			message,
		});
		const chunk = {
			type: "error",
			error: message,
		} satisfies PlaygroundStreamChunk;
		if (behavior.updateClientState) {
			applyPlaygroundAIChunk(chunk);
		}
		terminalPhase = "error";
		yield chunk;
		return;
	}

	try {
		for await (const chunk of readPlaygroundAIStream(response.body, signal)) {
			logAutocompleteDebug("ai stream chunk received", {
				type: chunk.type ?? "unknown",
			});
			if (chunk.type === "done") {
				if (behavior.updateClientState) {
					applyPlaygroundAIChunk(chunk);
				}
				terminalPhase = "complete";
				terminalChunk = chunk;
				continue;
			}
			if (chunk.type === "error") {
				if (behavior.updateClientState) {
					applyPlaygroundAIChunk(chunk);
				}
				terminalPhase = "error";
				terminalChunk = chunk;
				continue;
			}
			if (behavior.updateClientState) {
				applyPlaygroundAIChunk(chunk);
			}
			yield chunk;
		}
		if (terminalChunk) {
			yield terminalChunk;
		}
	} finally {
		if (terminalPhase == null) {
			logAutocompleteDebug("ai stream closed without terminal chunk", {
				aborted: signal?.aborted ?? false,
			});
		}
		finishActiveRequest(
			terminalPhase ?? (signal?.aborted ? "complete" : "error"),
			behavior,
		);
	}
}

export function applyPlaygroundAIChunk(
	chunk: PlaygroundStreamChunk,
): void {
	if (chunk.type === "meta") {
		updateState({
			sessionId:
				typeof chunk.sessionId === "string" ? chunk.sessionId : state.sessionId,
			lastRequest: {
				...getLastRequest(),
				requestId:
					typeof chunk.requestId === "string" ? chunk.requestId : getLastRequest().requestId,
				sessionId:
					typeof chunk.sessionId === "string" ? chunk.sessionId : getLastRequest().sessionId,
				requestMode:
					typeof chunk.requestMode === "string"
						? chunk.requestMode
						: getLastRequest().requestMode,
				requestModel:
					typeof chunk.requestModel === "string"
						? chunk.requestModel
						: getLastRequest().requestModel,
				contextFormat:
					typeof chunk.contextFormat === "string"
						? chunk.contextFormat
						: getLastRequest().contextFormat,
			},
		});
		return;
	}

	if (chunk.type === "phase") {
		const phase = toPhase(chunk.phase);
		updateState({ phase });
		return;
	}

	if (chunk.type === "metrics") {
		updateState({
			lastRequest: {
				...getLastRequest(),
				requestId:
					typeof chunk.requestId === "string" ? chunk.requestId : getLastRequest().requestId,
				sessionId:
					typeof chunk.sessionId === "string" ? chunk.sessionId : getLastRequest().sessionId,
				requestMode:
					typeof chunk.requestMode === "string"
						? chunk.requestMode
						: getLastRequest().requestMode,
				requestModel:
					typeof chunk.requestModel === "string"
						? chunk.requestModel
						: getLastRequest().requestModel,
				contextFormat:
					typeof chunk.contextFormat === "string"
						? chunk.contextFormat
						: getLastRequest().contextFormat,
				firstToolStartMs: toNumberOrNull(chunk.firstToolStartMs),
				firstToolResultMs: toNumberOrNull(chunk.firstToolResultMs),
				firstTextDeltaServerMs: toNumberOrNull(chunk.firstTextDeltaServerMs),
				totalServerMs: toNumberOrNull(chunk.totalServerMs),
				toolCallCount: toNumberOrZero(chunk.toolCallCount),
				toolExecutionMs: toNumberOrNull(chunk.toolExecutionMs),
				contextBytesJson: toNumberOrNull(chunk.contextBytesJson),
				contextEstimatedTokensJson: toNumberOrNull(chunk.contextEstimatedTokensJson),
				firstTextDeltaBrowserMs: getLastRequest().firstTextDeltaBrowserMs,
				totalBrowserMs: getLastRequest().totalBrowserMs,
			},
		});
		return;
	}

	if (
		chunk.type === "text-delta" &&
		typeof chunk.delta === "string" &&
		getLastRequest().firstTextDeltaBrowserMs == null
	) {
		updateState({
			lastRequest: {
				...getLastRequest(),
				firstTextDeltaBrowserMs: performance.now() - latestRequestStartedAt,
			},
			phase: "writing",
		});
		return;
	}

	if (chunk.type === "app-partial" || chunk.type === "app-final") {
		updateState({ phase: "writing" });
		return;
	}

	if (chunk.type === "done") {
		return;
	}

	if (chunk.type === "error") {
		updateState({
			lastError:
				typeof chunk.error === "string"
					? chunk.error
					: chunk.error instanceof Error
						? chunk.error.message
						: "The playground AI request failed.",
		});
	}
}

export async function* readPlaygroundAIStream(
	stream: ReadableStream<Uint8Array>,
	signal?: AbortSignal,
): AsyncIterable<PlaygroundStreamChunk> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	let completed = false;
	let cancelPromise: Promise<void> | null = null;

	const cancelReader = () => {
		if (cancelPromise) {
			return cancelPromise;
		}
		cancelPromise = reader.cancel(signal?.reason).catch(() => { });
		return cancelPromise;
	};

	const handleAbort = () => {
		void cancelReader();
	};

	if (signal) {
		if (signal.aborted) {
			await cancelReader();
		} else {
			signal.addEventListener("abort", handleAbort, { once: true });
		}
	}

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				completed = true;
				break;
			}

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";

			for (const line of lines) {
				const trimmedLine = line.trim();
				if (!trimmedLine) {
					continue;
				}

				yield JSON.parse(trimmedLine) as PlaygroundStreamChunk;
			}
		}

		const trailingLine = buffer.trim();
		if (trailingLine) {
			yield JSON.parse(trailingLine) as PlaygroundStreamChunk;
		}
	} finally {
		signal?.removeEventListener("abort", handleAbort);
		if (!completed) {
			await cancelReader();
		}
		reader.releaseLock();
	}
}

export function cancelQueuedPlaygroundAISessionSync(): void {
	if (pendingSyncTimer != null) {
		window.clearTimeout(pendingSyncTimer);
		pendingSyncTimer = null;
	}
}

async function syncPlaygroundAISession(
	editor: Editor,
	signal?: AbortSignal,
): Promise<PlaygroundAISyncResult> {
	const sessionId = await ensurePlaygroundAISession(signal);
	try {
		return await syncPlaygroundAISessionWithId(sessionId, editor, signal, {
			updateClientState: true,
		});
	} catch (error) {
		if (
			error instanceof Error &&
			error.message === "Playground session not found."
		) {
			updateState({
				sessionId: null,
				hasPendingSync: true,
				lastError: null,
			});
			const nextSessionId = await ensurePlaygroundAISession(signal);
			return await syncPlaygroundAISessionWithId(nextSessionId, editor, signal, {
				updateClientState: true,
			});
		}
		throw error;
	}
}

async function createPlaygroundAISession(
	signal?: AbortSignal,
	options?: {
		persistToState?: boolean;
	},
): Promise<string> {
	if (options?.persistToState) {
		updateState({
			phase: "creating-session",
			lastError: null,
		});
	}

	const response = await fetch(PLAYGROUND_AI_SESSION_ENDPOINT, {
		method: "POST",
		headers: {
			"content-type": "application/json",
		},
		signal,
	});

	if (!response.ok) {
		const message = await readErrorMessage(response);
		if (options?.persistToState) {
			updateState({
				phase: "error",
				lastError: message,
			});
		}
		throw new Error(message);
	}

	const payload = (await response.json()) as { sessionId?: unknown };
	if (typeof payload.sessionId !== "string" || !payload.sessionId) {
		const message = "The playground AI session response was missing a session ID.";
		if (options?.persistToState) {
			updateState({
				phase: "error",
				lastError: message,
			});
		}
		throw new Error(message);
	}

	if (options?.persistToState) {
		updateState({
			sessionId: payload.sessionId,
			phase: "idle",
			lastError: null,
		});
	}

	return payload.sessionId;
}

async function syncPlaygroundAISessionWithId(
	sessionId: string,
	editor: Editor,
	signal?: AbortSignal,
	options?: {
		updateClientState?: boolean;
	},
): Promise<PlaygroundAISyncResult> {
	const startedAt = performance.now();
	const syncState = getEditorSyncState(editor);

	if (options?.updateClientState !== false) {
		updateState({
			syncStatus: "syncing",
			phase: state.phase === "idle" ? "syncing" : state.phase,
			lastError: null,
		});
	}

	const response = await fetch(PLAYGROUND_AI_SESSION_SYNC_ENDPOINT, {
		method: "POST",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify({
			sessionId,
			editorState: serializeEditorState(editor),
		}),
		signal,
	});

	if (!response.ok) {
		const message = await readErrorMessage(response);
		if (
			response.status === 409 &&
			message === PLAYGROUND_AI_ACTIVE_SYNC_CONFLICT
		) {
			if (options?.updateClientState !== false) {
				updateState({
					syncStatus: "idle",
					phase: activeSharedRequestCount > 0 ? state.phase : "idle",
					hasPendingSync: true,
					lastError: null,
				});
			}
			return "deferred";
		}
		if (options?.updateClientState !== false) {
			updateState({
				syncStatus: "error",
				phase: "error",
				lastError: message,
			});
		}
		throw new Error(message);
	}

	const payload = (await response.json()) as { sessionId?: unknown };
	syncState.syncedRevision = syncState.revision;

	if (options?.updateClientState !== false) {
		updateState({
			sessionId:
				typeof payload.sessionId === "string" ? payload.sessionId : state.sessionId,
			syncStatus: "idle",
			phase: activeSharedRequestCount > 0 ? state.phase : "idle",
			lastSyncMs: performance.now() - startedAt,
			lastSyncAt: Date.now(),
			hasPendingSync: false,
			lastError: null,
		});
	}
	return "synced";
}

function getEditorSyncState(editor: Editor): {
	revision: number;
	syncedRevision: number;
} {
	const existing = editorSyncState.get(editor);
	if (existing) {
		return existing;
	}
	const initial = {
		revision: 0,
		syncedRevision: -1,
	};
	editorSyncState.set(editor, initial);
	return initial;
}

type PlaygroundAISyncResult = "synced" | "deferred";

function finishActiveRequest(
	nextPhase: Extract<PlaygroundAIPhase, "complete" | "error">,
	behavior?: {
		updateClientState: boolean;
		usesSharedSession: boolean;
	},
) {
	if (behavior?.usesSharedSession) {
		activeSharedRequestCount = Math.max(0, activeSharedRequestCount - 1);
	}
	if (behavior?.updateClientState) {
		updateState({
			phase: activeSharedRequestCount > 0 ? state.phase : "idle",
			lastRequest: {
				...getLastRequest(),
				totalBrowserMs: performance.now() - latestRequestStartedAt,
			},
		});
	}

	if (
		activeSharedRequestCount === 0 &&
		state.hasPendingSync &&
		pendingSyncEditor
	) {
		queuePlaygroundAISessionSync(pendingSyncEditor, pendingSyncReason);
	}

	if (nextPhase === "error" && behavior?.updateClientState) {
		updateState({ phase: "error" });
	}
}

function resolvePlaygroundExecutionBehavior(
	options?: PlaygroundAIRequestOptions,
): {
	lane: PlaygroundExecutionLane;
	updateClientState: boolean;
	usesSharedSession: boolean;
} {
	const lane = options?.lane ?? "bottom-chat";
	return {
		lane,
		updateClientState: lane === "bottom-chat",
		usesSharedSession: lane === "bottom-chat",
	};
}

function getLastRequest(): PlaygroundAIRequestMetrics {
	return (
		state.lastRequest ?? {
			requestId: null,
			sessionId: state.sessionId,
			contextFormat: null,
			requestModel: null,
			firstToolStartMs: null,
			firstToolResultMs: null,
			firstTextDeltaServerMs: null,
			firstTextDeltaBrowserMs: null,
			totalServerMs: null,
			totalBrowserMs: null,
			toolCallCount: 0,
			toolExecutionMs: null,
			requestMode: null,
			contextBytesJson: null,
			contextEstimatedTokensJson: null,
		}
	);
}

function updateState(partial: Partial<PlaygroundAIClientState>): void {
	state = {
		...state,
		...partial,
	};

	for (const callback of subscribers) {
		callback();
	}
}

function toNumberOrNull(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toNumberOrZero(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function toPhase(value: unknown): PlaygroundAIPhase {
	switch (value) {
		case "creating-session":
		case "syncing":
		case "thinking":
		case "tool-calling":
		case "writing":
		case "complete":
		case "error":
		case "idle":
			return value;
		default:
			return "idle";
	}
}

async function delayPlaygroundAIRequestRetry(
	delayMs: number,
	signal?: AbortSignal,
): Promise<void> {
	if (delayMs <= 0) {
		return;
	}
	await new Promise<void>((resolve, reject) => {
		if (signal?.aborted) {
			reject(signal.reason ?? new Error("The playground AI request was aborted."));
			return;
		}
		const timeoutId = globalThis.setTimeout(() => {
			signal?.removeEventListener("abort", handleAbort);
			resolve();
		}, delayMs);
		function handleAbort() {
			globalThis.clearTimeout(timeoutId);
			signal?.removeEventListener("abort", handleAbort);
			reject(signal?.reason ?? new Error("The playground AI request was aborted."));
		}
		signal?.addEventListener("abort", handleAbort, { once: true });
	});
}

async function readErrorMessage(response: Response): Promise<string> {
	try {
		const payload = (await response.json()) as { error?: unknown };
		if (typeof payload.error === "string") {
			return payload.error;
		}
	} catch {
		// Fall back to the HTTP status text when the body is not JSON.
	}

	if (
		response.status === 500 &&
		(response.url.includes(PLAYGROUND_AI_ENDPOINT) ||
			response.url.includes(PLAYGROUND_AI_SESSION_ENDPOINT) ||
			response.url.includes(PLAYGROUND_AI_SESSION_SYNC_ENDPOINT))
	) {
		return "The playground AI backend is unavailable. Make sure `pnpm dev:backend` is running, then try again.";
	}

	return response.statusText || "The playground AI request failed.";
}
