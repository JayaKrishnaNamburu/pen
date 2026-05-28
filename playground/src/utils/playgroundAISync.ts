import type { Editor, ModelRequestedOperation } from "@pen/types";
import { isScopedSelectionTarget } from "@pen/types";
import {
	PLAYGROUND_AI_SESSION_ENDPOINT,
	PLAYGROUND_AI_SESSION_SYNC_ENDPOINT,
	PLAYGROUND_AI_SYNC_DEBOUNCE_MS,
} from "../constants/playgroundAI";
import { serializeEditorState } from "./editorState";
import {
	delayPlaygroundAIRequestRetry,
	getEditorSyncState,
	hasUnsyncedEditorState,
	PLAYGROUND_AI_ACTIVE_SYNC_CONFLICT,
	PLAYGROUND_AI_ACTIVE_SYNC_RETRY_LIMIT,
	PLAYGROUND_AI_ACTIVE_SYNC_RETRY_MS,
	playgroundAIRuntime,
	readPlaygroundAIErrorMessage,
	updatePlaygroundAIState,
} from "./playgroundAISessionRuntime";
import type { PlaygroundAISyncResult } from "./playgroundAISessionTypes";

export async function ensurePlaygroundAISession(
	signal?: AbortSignal,
): Promise<string> {
	if (playgroundAIRuntime.state.sessionId) {
		return playgroundAIRuntime.state.sessionId;
	}
	if (playgroundAIRuntime.pendingSessionPromise) {
		return playgroundAIRuntime.pendingSessionPromise;
	}

	playgroundAIRuntime.pendingSessionPromise = createPlaygroundAISession(
		signal,
		{
			persistToState: true,
		},
	).finally(() => {
		playgroundAIRuntime.pendingSessionPromise = null;
	});

	return playgroundAIRuntime.pendingSessionPromise;
}

export function queuePlaygroundAISessionSync(
	editor: Editor,
	reason = "background",
): void {
	const syncState = getEditorSyncState(editor);
	syncState.revision += 1;
	playgroundAIRuntime.pendingSyncEditor = editor;
	playgroundAIRuntime.pendingSyncReason = reason;
	updatePlaygroundAIState({
		hasPendingSync: hasUnsyncedEditorState(editor, syncState),
	});

	if (playgroundAIRuntime.activeSharedRequestCount > 0) {
		return;
	}

	if (playgroundAIRuntime.pendingSyncTimer != null) {
		window.clearTimeout(playgroundAIRuntime.pendingSyncTimer);
	}

	playgroundAIRuntime.pendingSyncTimer = window.setTimeout(() => {
		playgroundAIRuntime.pendingSyncTimer = null;
		if (!playgroundAIRuntime.pendingSyncEditor) {
			return;
		}
		void flushPlaygroundAISessionSync(
			playgroundAIRuntime.pendingSyncEditor,
			playgroundAIRuntime.pendingSyncReason,
		);
	}, PLAYGROUND_AI_SYNC_DEBOUNCE_MS);
}

export async function flushPlaygroundAISessionSync(
	editor: Editor,
	reason = "manual",
	signal?: AbortSignal,
): Promise<void> {
	for (let retryCount = 0; ; retryCount += 1) {
		const syncState = getEditorSyncState(editor);
		playgroundAIRuntime.pendingSyncEditor = editor;
		playgroundAIRuntime.pendingSyncReason = reason;

		if (playgroundAIRuntime.pendingSyncTimer != null) {
			window.clearTimeout(playgroundAIRuntime.pendingSyncTimer);
			playgroundAIRuntime.pendingSyncTimer = null;
		}

		if (playgroundAIRuntime.activeSharedRequestCount > 0) {
			updatePlaygroundAIState({
				hasPendingSync: hasUnsyncedEditorState(editor, syncState),
			});
			return;
		}

		if (!hasUnsyncedEditorState(editor, syncState)) {
			updatePlaygroundAIState({ hasPendingSync: false });
			return;
		}

		if (playgroundAIRuntime.pendingSyncPromise) {
			const result = await playgroundAIRuntime.pendingSyncPromise;
			if (!hasUnsyncedEditorState(editor, syncState)) {
				updatePlaygroundAIState({ hasPendingSync: false });
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

		playgroundAIRuntime.pendingSyncPromise = syncPlaygroundAISession(
			editor,
			signal,
		).finally(() => {
			playgroundAIRuntime.pendingSyncPromise = null;
		});
		const result = await playgroundAIRuntime.pendingSyncPromise;
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

export function cancelQueuedPlaygroundAISessionSync(): void {
	if (playgroundAIRuntime.pendingSyncTimer != null) {
		window.clearTimeout(playgroundAIRuntime.pendingSyncTimer);
		playgroundAIRuntime.pendingSyncTimer = null;
	}
}

export async function createPlaygroundAISession(
	signal?: AbortSignal,
	options?: {
		persistToState?: boolean;
	},
): Promise<string> {
	if (options?.persistToState) {
		updatePlaygroundAIState({
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
		const message = await readPlaygroundAIErrorMessage(response);
		if (options?.persistToState) {
			updatePlaygroundAIState({
				phase: "error",
				lastError: message,
			});
		}
		throw new Error(message);
	}

	const payload = (await response.json()) as { sessionId?: unknown };
	if (typeof payload.sessionId !== "string" || !payload.sessionId) {
		const message =
			"The playground AI session response was missing a session ID.";
		if (options?.persistToState) {
			updatePlaygroundAIState({
				phase: "error",
				lastError: message,
			});
		}
		throw new Error(message);
	}

	if (options?.persistToState) {
		updatePlaygroundAIState({
			sessionId: payload.sessionId,
			phase: "idle",
			lastError: null,
		});
	}

	return payload.sessionId;
}

export async function syncPlaygroundAISessionWithId(
	sessionId: string,
	editor: Editor,
	signal?: AbortSignal,
	options?: { updateClientState?: boolean },
): Promise<PlaygroundAISyncResult> {
	const startedAt = performance.now();
	const syncState = getEditorSyncState(editor);

	if (options?.updateClientState !== false) {
		updatePlaygroundAIState({
			syncStatus: "syncing",
			phase:
				playgroundAIRuntime.state.phase === "idle"
					? "syncing"
					: playgroundAIRuntime.state.phase,
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
			revision: syncState.revision,
			generation: editor.documentState.generation,
		}),
		signal,
	});

	if (!response.ok) {
		const message = await readPlaygroundAIErrorMessage(response);
		if (
			response.status === 409 &&
			message === PLAYGROUND_AI_ACTIVE_SYNC_CONFLICT
		) {
			if (options?.updateClientState !== false) {
				updatePlaygroundAIState({
					syncStatus: "idle",
					phase:
						playgroundAIRuntime.activeSharedRequestCount > 0
							? playgroundAIRuntime.state.phase
							: "idle",
					hasPendingSync: true,
					lastError: null,
				});
			}
			return "deferred";
		}
		if (options?.updateClientState !== false) {
			updatePlaygroundAIState({
				syncStatus: "error",
				phase: "error",
				lastError: message,
			});
		}
		throw new Error(message);
	}

	const payload = (await response.json()) as {
		sessionId?: unknown;
		revision?: unknown;
		generation?: unknown;
	};
	syncState.syncedRevision =
		typeof payload.revision === "number" &&
		Number.isInteger(payload.revision) &&
		payload.revision >= 0
			? payload.revision
			: syncState.revision;
	syncState.syncedGeneration =
		typeof payload.generation === "number" &&
		Number.isInteger(payload.generation) &&
		payload.generation >= 0
			? payload.generation
			: editor.documentState.generation;

	if (options?.updateClientState !== false) {
		updatePlaygroundAIState({
			sessionId:
				typeof payload.sessionId === "string"
					? payload.sessionId
					: playgroundAIRuntime.state.sessionId,
			syncStatus: "idle",
			phase:
				playgroundAIRuntime.activeSharedRequestCount > 0
					? playgroundAIRuntime.state.phase
					: "idle",
			lastSyncMs: performance.now() - startedAt,
			lastSyncAt: Date.now(),
			hasPendingSync: false,
			lastError: null,
		});
	}
	return "synced";
}

export function alignOperationWithEditorSyncState(
	editor: Editor,
	operation: ModelRequestedOperation | null,
): ModelRequestedOperation | null {
	if (!operation) {
		return operation;
	}
	const shouldAlignSyncedGeneration =
		operation.target.kind === "document" ||
		operation.target.kind === "scoped-range" ||
		(operation.target.kind === "selection" &&
			isScopedSelectionTarget(operation.target));
	if (!shouldAlignSyncedGeneration) {
		return operation;
	}
	const syncedGeneration = getEditorSyncState(editor).syncedGeneration;
	if (syncedGeneration < 0) {
		return operation;
	}
	return {
		...operation,
		provenance: {
			...(operation.provenance ?? {}),
			syncedGeneration,
		},
	};
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
			updatePlaygroundAIState({
				sessionId: null,
				hasPendingSync: true,
				lastError: null,
			});
			const nextSessionId = await ensurePlaygroundAISession(signal);
			return await syncPlaygroundAISessionWithId(
				nextSessionId,
				editor,
				signal,
				{
					updateClientState: true,
				},
			);
		}
		throw error;
	}
}
