import {
	getLastPlaygroundAIRequest,
	playgroundAIRuntime,
	toNumberOrNull,
	toNumberOrZero,
	toPlaygroundAIPhase,
	updatePlaygroundAIState,
} from "./playgroundAISessionRuntime";
import type { PlaygroundStreamChunk } from "./playgroundAISessionTypes";

export function applyPlaygroundAIChunk(chunk: PlaygroundStreamChunk): void {
	if (chunk.type === "meta") {
		updatePlaygroundAIState({
			sessionId:
				typeof chunk.sessionId === "string"
					? chunk.sessionId
					: playgroundAIRuntime.state.sessionId,
			lastRequest: {
				...getLastPlaygroundAIRequest(),
				requestId:
					typeof chunk.requestId === "string"
						? chunk.requestId
						: getLastPlaygroundAIRequest().requestId,
				sessionId:
					typeof chunk.sessionId === "string"
						? chunk.sessionId
						: getLastPlaygroundAIRequest().sessionId,
				requestMode:
					typeof chunk.requestMode === "string"
						? chunk.requestMode
						: getLastPlaygroundAIRequest().requestMode,
				requestModel:
					typeof chunk.requestModel === "string"
						? chunk.requestModel
						: getLastPlaygroundAIRequest().requestModel,
				contextFormat:
					typeof chunk.contextFormat === "string"
						? chunk.contextFormat
						: getLastPlaygroundAIRequest().contextFormat,
			},
		});
		return;
	}

	if (chunk.type === "phase") {
		updatePlaygroundAIState({ phase: toPlaygroundAIPhase(chunk.phase) });
		return;
	}

	if (chunk.type === "metrics") {
		updatePlaygroundAIState({
			lastRequest: {
				...getLastPlaygroundAIRequest(),
				requestId:
					typeof chunk.requestId === "string"
						? chunk.requestId
						: getLastPlaygroundAIRequest().requestId,
				sessionId:
					typeof chunk.sessionId === "string"
						? chunk.sessionId
						: getLastPlaygroundAIRequest().sessionId,
				requestMode:
					typeof chunk.requestMode === "string"
						? chunk.requestMode
						: getLastPlaygroundAIRequest().requestMode,
				requestModel:
					typeof chunk.requestModel === "string"
						? chunk.requestModel
						: getLastPlaygroundAIRequest().requestModel,
				contextFormat:
					typeof chunk.contextFormat === "string"
						? chunk.contextFormat
						: getLastPlaygroundAIRequest().contextFormat,
				firstToolStartMs: toNumberOrNull(chunk.firstToolStartMs),
				firstToolResultMs: toNumberOrNull(chunk.firstToolResultMs),
				firstTextDeltaServerMs: toNumberOrNull(
					chunk.firstTextDeltaServerMs,
				),
				totalServerMs: toNumberOrNull(chunk.totalServerMs),
				toolCallCount: toNumberOrZero(chunk.toolCallCount),
				toolExecutionMs: toNumberOrNull(chunk.toolExecutionMs),
				contextBytesJson: toNumberOrNull(chunk.contextBytesJson),
				contextEstimatedTokensJson: toNumberOrNull(
					chunk.contextEstimatedTokensJson,
				),
				firstTextDeltaBrowserMs:
					getLastPlaygroundAIRequest().firstTextDeltaBrowserMs,
				totalBrowserMs: getLastPlaygroundAIRequest().totalBrowserMs,
			},
		});
		return;
	}

	if (
		chunk.type === "text-delta" &&
		typeof chunk.delta === "string" &&
		getLastPlaygroundAIRequest().firstTextDeltaBrowserMs == null
	) {
		updatePlaygroundAIState({
			lastRequest: {
				...getLastPlaygroundAIRequest(),
				firstTextDeltaBrowserMs:
					performance.now() -
					playgroundAIRuntime.latestRequestStartedAt,
			},
			phase: "writing",
		});
		return;
	}

	if (
		(chunk.type === "replace-preview" ||
			chunk.type === "replace-final" ||
			chunk.type === "insert-preview" ||
			chunk.type === "insert-final") &&
		typeof chunk.text === "string"
	) {
		if (getLastPlaygroundAIRequest().firstTextDeltaBrowserMs == null) {
			updatePlaygroundAIState({
				lastRequest: {
					...getLastPlaygroundAIRequest(),
					firstTextDeltaBrowserMs:
						performance.now() -
						playgroundAIRuntime.latestRequestStartedAt,
				},
			});
		}
		updatePlaygroundAIState({ phase: "writing" });
		return;
	}

	if (chunk.type === "app-partial" || chunk.type === "app-final") {
		updatePlaygroundAIState({ phase: "writing" });
		return;
	}

	if (chunk.type === "done") {
		return;
	}

	if (chunk.type === "error") {
		updatePlaygroundAIState({
			lastError:
				typeof chunk.error === "string"
					? chunk.error
					: chunk.error instanceof Error
						? chunk.error.message
						: "The playground AI request failed.",
		});
		return;
	}

	if (chunk.type === "conflict") {
		updatePlaygroundAIState({
			lastError:
				typeof chunk.reason === "string"
					? chunk.reason
					: "The requested local AI operation conflicted with document changes.",
		});
	}
}
