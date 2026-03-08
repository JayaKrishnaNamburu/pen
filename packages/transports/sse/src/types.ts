import type {
  Editor,
  PenStreamPart,
  PenStreamRequest,
  ToolServer,
} from "@pen/core";

export interface SSEEvent {
  id?: string;
  data: string;
  event?: string;
  retry?: number;
}

export interface SSEClientOptions {
  url: string;
  headers?: Record<string, string>;
  reconnect?: boolean;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
  supportsReplay?: boolean;
  pingTimeout?: number;
  signal?: AbortSignal;
}

export interface SSEServerOptions {
  toolServer?: ToolServer;
  editor?: Editor;
  onRequest?: (request: PenStreamRequest) => void;
  onError?: (error: unknown) => void;
  pingInterval?: number;
  keepAliveComment?: boolean;
}

export interface SSEStreamState {
  streamId: string;
  eventIndex: number;
  parts: PenStreamPart[];
}
