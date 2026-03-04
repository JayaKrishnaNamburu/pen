import type { PenStreamRequest, PenStreamPart, Transport } from "@pen/core";

export interface SSETransportOptions {
  url: string;
  headers?: Record<string, string>;
}

export type { Transport };

export function sseTransport(_options: SSETransportOptions): Transport {
  throw new Error("Not implemented");
}
