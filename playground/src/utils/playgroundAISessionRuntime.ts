import type { Editor } from "@pen/types";
import {
	PLAYGROUND_AI_ENDPOINT,
	PLAYGROUND_AI_SESSION_ENDPOINT,
	PLAYGROUND_AI_SESSION_SYNC_ENDPOINT,
} from "../constants/playgroundAI";
import type {
	PlaygroundAIClientState,
	PlaygroundAIPhase,
	PlaygroundAIRequestMetrics,
	PlaygroundAIRequestOptions,
	PlaygroundAISyncResult,
	PlaygroundExecutionLane,
} from "./playgroundAISessionTypes";

export const PLAYGROUND_AI_ACTIVE_SYNC_CONFLICT =
	"Cannot sync a playground session while an AI request is active.";
export const PLAYGROUND_AI_ACTIVE_REQUEST_CONFLICT =
	"This playground session already has an active AI request.";
export const PLAYGROUND_AI_ACTIVE_LOCK_RETRY_WINDOW_MS = 2_000;
export const PLAYGROUND_AI_ACTIVE_SYNC_RETRY_MS = 75;
export const PLAYGROUND_AI_ACTIVE_SYNC_RETRY_LIMIT = Math.ceil(
	PLAYGROUND_AI_ACTIVE_LOCK_RETRY_WINDOW_MS /
		PLAYGROUND_AI_ACTIVE_SYNC_RETRY_MS,
);
export const PLAYGROUND_AI_ACTIVE_REQUEST_RETRY_MS = 75;
export const PLAYGROUND_AI_ACTIVE_REQUEST_RETRY_LIMIT = Math.ceil(
	PLAYGROUND_AI_ACTIVE_LOCK_RETRY_WINDOW_MS /
		PLAYGROUND_AI_ACTIVE_REQUEST_RETRY_MS,
);

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

export const playgroundAIRuntime = {
	state: INITIAL_STATE,
	subscribers: new Set<() => void>(),
	pendingSyncTimer: null as number | null,
	pendingSyncPromise: null as Promise<PlaygroundAISyncResult> | null,
	pendingSessionPromise: null as Promise<string> | null,
	activeSharedRequestCount: 0,
	pendingSyncEditor: null as Editor | null,
	pendingSyncReason: "background",
	latestRequestStartedAt: 0,
	editorSyncState: new WeakMap<
		Editor,
		{ revision: number; syncedRevision: number; syncedGeneration: number }
	>(),
};

export function subscribeToPlaygroundAIState(callback: () => void): () => void {
	playgroundAIRuntime.subscribers.add(callback);
	return () => {
		playgroundAIRuntime.subscribers.delete(callback);
	};
}

export function getPlaygroundAIStateSnapshot(): PlaygroundAIClientState {
	return playgroundAIRuntime.state;
}

export function updatePlaygroundAIState(
	partial: Partial<PlaygroundAIClientState>,
): void {
	playgroundAIRuntime.state = {
		...playgroundAIRuntime.state,
		...partial,
	};

	for (const callback of playgroundAIRuntime.subscribers) {
		callback();
	}
}

export function getLastPlaygroundAIRequest(): PlaygroundAIRequestMetrics {
	const state = playgroundAIRuntime.state;
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

export function getEditorSyncState(editor: Editor): {
	revision: number;
	syncedRevision: number;
	syncedGeneration: number;
} {
	const existing = playgroundAIRuntime.editorSyncState.get(editor);
	if (existing) {
		return existing;
	}
	const initial = {
		revision: 0,
		syncedRevision: -1,
		syncedGeneration: -1,
	};
	playgroundAIRuntime.editorSyncState.set(editor, initial);
	return initial;
}

export function hasUnsyncedEditorState(
	editor: Editor,
	syncState = getEditorSyncState(editor),
): boolean {
	return (
		syncState.revision > syncState.syncedRevision ||
		editor.documentState.generation > syncState.syncedGeneration
	);
}

export function resolvePlaygroundExecutionBehavior(
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

export function toNumberOrNull(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function toNumberOrZero(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function toPlaygroundAIPhase(value: unknown): PlaygroundAIPhase {
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

export async function delayPlaygroundAIRequestRetry(
	delayMs: number,
	signal?: AbortSignal,
): Promise<void> {
	if (delayMs <= 0) {
		return;
	}
	await new Promise<void>((resolve, reject) => {
		if (signal?.aborted) {
			reject(
				signal.reason ??
					new Error("The playground AI request was aborted."),
			);
			return;
		}
		const timeoutId = globalThis.setTimeout(() => {
			signal?.removeEventListener("abort", handleAbort);
			resolve();
		}, delayMs);
		function handleAbort() {
			globalThis.clearTimeout(timeoutId);
			signal?.removeEventListener("abort", handleAbort);
			reject(
				signal?.reason ??
					new Error("The playground AI request was aborted."),
			);
		}
		signal?.addEventListener("abort", handleAbort, { once: true });
	});
}

export async function readPlaygroundAIErrorMessage(
	response: Response,
): Promise<string> {
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
