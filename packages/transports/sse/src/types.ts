import type {
	Editor,
	PenStreamRequest,
	ToolRuntime,
} from "@input/pen-types";

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
	editor?: Editor;
	onRequest?: (request: PenStreamRequest) => void;
	onError?: (error: unknown) => void;
	pingInterval?: number;
	keepAliveComment?: boolean;
}
