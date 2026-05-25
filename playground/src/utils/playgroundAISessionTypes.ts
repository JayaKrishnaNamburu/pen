import type { ModelRequestedOperation } from "@pen/types";

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
	text?: unknown;
	reason?: unknown;
	operation?: unknown;
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

export interface PlaygroundAIRequestOptions {
	lane?: PlaygroundExecutionLane;
	requestMode?: string;
	operation?: ModelRequestedOperation | null;
}

export type PlaygroundAISyncResult = "synced" | "deferred";
