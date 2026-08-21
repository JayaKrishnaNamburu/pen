import type { Editor, PenStreamRequest, ToolRuntime } from "@input/pen-types";

export interface SSEEvent {
	id?: string;
	data: string;
	event?: string;
	retry?: number;
}

export interface SSEClientOptions {
	url: string;
	headers?: Record<string, string>;
	pingTimeout?: number;
	signal?: AbortSignal;
}

export interface SSEServerOptions {
	toolRuntime?: ToolRuntime;
	/**
	 * In-process editor for tool context. The SSE handler never reads an
	 * editor off the request body — that field is not on the wire type
	 * (AIB2), and a live `Editor` cannot survive `JSON.parse`.
	 */
	editor?: Editor;
	onRequest?: (request: PenStreamRequest) => void;
	onError?: (error: unknown) => void;
	pingInterval?: number;
	keepAliveComment?: boolean;
}
