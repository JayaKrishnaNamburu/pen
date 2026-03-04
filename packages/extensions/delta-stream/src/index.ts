import type { Extension, GenerationZone, DocumentRange } from "@pen/core";

// ── Streaming Target ────────────────────────────────────────

export interface StreamingTarget {
  readonly generationZone: GenerationZone | null;
  beginStreaming(zoneId: string, blockId: string): void;
  appendDelta(delta: string): void;
  endStreaming(status: "complete" | "cancelled" | "error"): void;
}

// ── Delta Stream Options ────────────────────────────────────

export interface DeltaStreamOptions {
  batchInterval?: number;
}

export function deltaStream(_options?: DeltaStreamOptions): Extension {
  throw new Error("Not implemented");
}
