import type { Editor } from "@pen/types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StreamingTargetImpl } from "../streamingTarget";

interface MockText {
	readonly length: number;
	insert(offset: number, text: string): void;
	toString(): string;
}

function createMockText(): MockText {
	let value = "";

	return {
		get length() {
			return value.length;
		},
		insert(offset: number, text: string) {
			value = value.slice(0, offset) + text + value.slice(offset);
		},
		toString() {
			return value;
		},
	};
}

function createStreamingHarness(batchInterval: number) {
	const content = createMockText();
	const blockMap = new Map<string, unknown>([["content", content]]);
	const transact = vi.fn(
		(_doc: unknown, callback: () => void, _origin: string) => {
			callback();
		},
	);
	const editor = {
		undoManager: {
			stopCapturing: vi.fn(),
		},
		internals: {
			doc: {
				blocks: new Map([["block-1", blockMap]]),
			},
			adapter: {
				transact,
			},
			crdtDoc: {},
			awareness: null,
		},
	} as unknown as Editor;
	const engine = {
		markDirty: vi.fn(),
		deferBlock: vi.fn(),
		undeferBlock: vi.fn(),
	};

	return {
		content,
		transact,
		engine,
		target: new StreamingTargetImpl(editor, engine, batchInterval),
	};
}

describe("@pen/delta-stream StreamingTargetImpl", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("uses the configured batch interval before flushing", () => {
		vi.useFakeTimers();
		const { content, transact, target } = createStreamingHarness(120);

		target.beginStreaming("zone-1", "block-1");
		target.appendDelta("hello");

		vi.advanceTimersByTime(119);
		expect(transact).not.toHaveBeenCalled();
		expect(content.toString()).toBe("");

		vi.advanceTimersByTime(1);
		expect(transact).toHaveBeenCalledTimes(1);
		expect(content.toString()).toBe("hello");
	});
});
