import type { CommitEvent, Editor, TextStreamWriter } from "@input/pen-types";
import { describe, expect, it, vi } from "vitest";

import { StreamingTargetImpl } from "../streamingTarget";

function createStreamingHarness() {
	const writer: TextStreamWriter = {
		position: { blockId: "block-1", offset: 0 },
		append: vi.fn(),
		splice: vi.fn(),
		flush: vi.fn(),
		close: vi.fn(),
		abort: vi.fn(),
	};
	const awarenessState: Record<string, unknown> = {};
	const awareness = {
		getLocalState: () => awarenessState,
		setLocalState: vi.fn((next: Record<string, unknown>) => {
			for (const key of Object.keys(awarenessState)) {
				delete awarenessState[key];
			}
			Object.assign(awarenessState, next);
		}),
	};
	const commitListeners: Array<(event: CommitEvent) => void> = [];
	const transact = vi.fn();
	const editor = {
		openTextStream: vi.fn(() => writer),
		on: vi.fn((event: string, listener: (commit: CommitEvent) => void) => {
			if (event === "commit") {
				commitListeners.push(listener);
			}
			return () => {
				const index = commitListeners.indexOf(listener);
				if (index >= 0) {
					commitListeners.splice(index, 1);
				}
			};
		}),
		internals: {
			awareness,
			adapter: { transact },
		},
	} as unknown as Editor;

	return {
		writer,
		transact,
		awareness,
		awarenessState,
		commitListeners,
		editor,
		target: new StreamingTargetImpl(editor, 50),
	};
}

describe("@input/pen-ai/stream StreamingTargetImpl", () => {
	it("ST5: begin/append/end go through TextStreamWriter and never transact", () => {
		const { writer, transact, editor, target } = createStreamingHarness();

		target.beginStreaming("zone-1", "block-1", {
			type: "ai",
			groupId: "gen-1",
		});
		expect(editor.openTextStream).toHaveBeenCalledWith(
			{ blockId: "block-1" },
			{
				origin: { type: "ai", groupId: "gen-1" },
				flushIntervalMs: 50,
			},
		);

		target.appendDelta("hello");
		expect(writer.append).toHaveBeenCalledWith("hello");
		expect(transact).not.toHaveBeenCalled();

		target.endStreaming("complete");
		expect(writer.close).toHaveBeenCalledTimes(1);
		expect(target.generationZone).toBeNull();
		expect(transact).not.toHaveBeenCalled();
	});

	it("ST6: awareness streaming flags hang off source:stream commits", () => {
		const { awareness, awarenessState, commitListeners, target } =
			createStreamingHarness();

		target.beginStreaming("zone-1", "block-1");
		expect(awareness.setLocalState).not.toHaveBeenCalled();

		commitListeners[0]!({
			source: "apply",
		} as CommitEvent);
		expect(awarenessState.streaming).toBeUndefined();

		commitListeners[0]!({
			source: "stream",
		} as CommitEvent);
		// the block and nothing else: COL2 validates this payload on receipt,
		// and a zone id peers cannot use is one more untrusted string to bound.
		expect(awarenessState.streaming).toEqual({ blockId: "block-1" });

		target.endStreaming("complete");
		expect(awarenessState.streaming).toBeUndefined();
	});

	it("COL2: a run publishes its block once, not once per stream commit", () => {
		const { awareness, commitListeners, target } = createStreamingHarness();

		target.beginStreaming("zone-1", "block-1");
		for (let commit = 0; commit < 20; commit += 1) {
			commitListeners[0]!({ source: "stream" } as CommitEvent);
		}

		// 20 flushes a second against a 30/second cap: resending one unchanged
		// block id would push the peer's own caret past the limiter.
		expect(awareness.setLocalState).toHaveBeenCalledTimes(1);
	});
});
