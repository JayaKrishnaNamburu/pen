import type { Editor } from "@pen/types";
import { PLAYGROUND_AI_ENDPOINT } from "../constants/playgroundAI";
import { logAutocompleteDebug } from "./autocompleteDebug";
import { applyPlaygroundAIChunk } from "./playgroundAIChunks";
import { readPlaygroundAIStream } from "./playgroundAIStream";
import {
	alignOperationWithEditorSyncState,
	createPlaygroundAISession,
	ensurePlaygroundAISession,
	flushPlaygroundAISessionSync,
	queuePlaygroundAISessionSync,
	syncPlaygroundAISessionWithId,
} from "./playgroundAISync";
import {
	delayPlaygroundAIRequestRetry,
	getEditorSyncState,
	getLastPlaygroundAIRequest,
	PLAYGROUND_AI_ACTIVE_REQUEST_CONFLICT,
	PLAYGROUND_AI_ACTIVE_REQUEST_RETRY_LIMIT,
	PLAYGROUND_AI_ACTIVE_REQUEST_RETRY_MS,
	playgroundAIRuntime,
	readPlaygroundAIErrorMessage,
	resolvePlaygroundExecutionBehavior,
	updatePlaygroundAIState,
} from "./playgroundAISessionRuntime";
import type {
	PlaygroundAIPhase,
	PlaygroundAIRequestOptions,
	PlaygroundStreamChunk,
} from "./playgroundAISessionTypes";

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
	for (let retryCount = 0; ; retryCount += 1) {
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
			playgroundAIRuntime.activeSharedRequestCount += 1;
			playgroundAIRuntime.latestRequestStartedAt = performance.now();
		}
		if (behavior.updateClientState) {
			updatePlaygroundAIState({
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
			const requestOperation = alignOperationWithEditorSyncState(
				editor,
				options?.operation ?? null,
			);
			const response = await fetch(PLAYGROUND_AI_ENDPOINT, {
				method: "POST",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({
					sessionId,
					prompt,
					requestMode: options?.requestMode ?? null,
					operation: requestOperation,
					expectedSyncRevision:
						getEditorSyncState(editor).syncedRevision,
					expectedSyncedGeneration:
						getEditorSyncState(editor).syncedGeneration,
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
				const message = await readPlaygroundAIErrorMessage(response);
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
					logAutocompleteDebug(
						"ai request retrying after active-request conflict",
						{ sessionId, retryCount },
					);
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
				updatePlaygroundAIState({
					lastError:
						error instanceof Error ? error.message : String(error),
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
		const message = await readPlaygroundAIErrorMessage(response);
		logAutocompleteDebug("ai stream missing response body", { message });
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
		for await (const chunk of readPlaygroundAIStream(
			response.body,
			signal,
		)) {
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

function finishActiveRequest(
	nextPhase: Extract<PlaygroundAIPhase, "complete" | "error">,
	behavior?: { updateClientState: boolean; usesSharedSession: boolean },
): void {
	if (behavior?.usesSharedSession) {
		playgroundAIRuntime.activeSharedRequestCount = Math.max(
			0,
			playgroundAIRuntime.activeSharedRequestCount - 1,
		);
	}
	if (behavior?.updateClientState) {
		updatePlaygroundAIState({
			phase:
				playgroundAIRuntime.activeSharedRequestCount > 0
					? playgroundAIRuntime.state.phase
					: "idle",
			lastRequest: {
				...getLastPlaygroundAIRequest(),
				totalBrowserMs:
					performance.now() -
					playgroundAIRuntime.latestRequestStartedAt,
			},
		});
	}

	if (
		playgroundAIRuntime.activeSharedRequestCount === 0 &&
		playgroundAIRuntime.state.hasPendingSync &&
		playgroundAIRuntime.pendingSyncEditor
	) {
		queuePlaygroundAISessionSync(
			playgroundAIRuntime.pendingSyncEditor,
			playgroundAIRuntime.pendingSyncReason,
		);
	}

	if (nextPhase === "error" && behavior?.updateClientState) {
		updatePlaygroundAIState({ phase: "error" });
	}
}
