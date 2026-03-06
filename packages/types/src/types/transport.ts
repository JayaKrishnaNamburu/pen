import type { Unsubscribe } from "./utility.js";
import type { PenStreamPart, PenStreamRequest } from "./stream.js";

export interface PenTransport {
  stream(request: PenStreamRequest): AsyncIterable<PenStreamPart>;
  reconnect?(streamId: string): AsyncIterable<PenStreamPart>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  readonly connected: boolean;
  onConnectionChange(callback: (connected: boolean) => void): Unsubscribe;
}

export interface ServerConfig {
  port?: number;
  host?: string;
  transport?: "stdio" | "sse" | "ws";
}
