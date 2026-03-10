import { describe, expect, it, vi } from "vitest";

import { BatchingBuffer } from "../batch";

describe("@pen/delta-stream BatchingBuffer", () => {
  it("flushes accumulated text", () => {
    const flushed: string[] = [];
    const buffer = new BatchingBuffer((text) => flushed.push(text), 50);

    buffer.append("hel");
    buffer.append("lo");
    buffer.flush();

    expect(flushed).toEqual(["hello"]);
    expect(buffer.pending).toBe(false);
  });

  it("clears timers on destroy", () => {
    vi.useFakeTimers();

    const flushed: string[] = [];
    const buffer = new BatchingBuffer((text) => flushed.push(text), 50);
    buffer.append("hello");
    buffer.destroy();

    vi.advanceTimersByTime(100);

    expect(flushed).toEqual([]);
    vi.useRealTimers();
  });
});
