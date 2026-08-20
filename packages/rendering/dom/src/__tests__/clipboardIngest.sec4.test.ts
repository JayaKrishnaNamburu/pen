import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import type { Editor } from "@input/pen-types";
import {
	CLIPBOARD_INGEST_MAX_NESTING_DEPTH,
	CLIPBOARD_INGEST_MAX_NODE_COUNT,
	admitClipboardBlocks,
} from "../utils/clipboardIngest";
import type { PenBlock } from "../utils/clipboardPayload";

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

function createBareEditor(): Editor {
	return createEditor({
		preset: noDefaultExtensionsPreset,
	});
}

function nestToggles(depth: number): PenBlock {
	if (depth <= 1) {
		return { type: "paragraph", content: "leaf" };
	}
	return {
		type: "toggle",
		content: `d${depth}`,
		children: [nestToggles(depth - 1)],
	};
}

describe("SEC4 clipboard JSON ingest bounds", () => {
	it("SEC4: drops blocks past depth 32", () => {
		const editor = createBareEditor();
		const result = admitClipboardBlocks(
			[nestToggles(CLIPBOARD_INGEST_MAX_NESTING_DEPTH + 1)],
			editor,
		);

		expect(result.droppedByReason).toEqual([
			{
				reason: "depth-exceeded",
				count: 1,
				bound: "CLIPBOARD_INGEST_MAX_NESTING_DEPTH",
			},
		]);

		let depth = 0;
		let current: PenBlock | undefined = result.blocks[0];
		while (current) {
			depth += 1;
			current = current.children?.[0];
		}
		expect(depth).toBe(CLIPBOARD_INGEST_MAX_NESTING_DEPTH);

		editor.destroy();
	});

	it("SEC4: drops blocks past the 10k node cap", () => {
		const editor = createBareEditor();
		const blocks: PenBlock[] = Array.from(
			{ length: CLIPBOARD_INGEST_MAX_NODE_COUNT + 5 },
			() => ({ type: "paragraph", content: "n" }),
		);

		const result = admitClipboardBlocks(blocks, editor);

		expect(result.blocks).toHaveLength(CLIPBOARD_INGEST_MAX_NODE_COUNT);
		expect(result.droppedByReason).toEqual([
			{
				reason: "count-exceeded",
				count: 5,
				bound: "CLIPBOARD_INGEST_MAX_NODE_COUNT",
			},
		]);

		editor.destroy();
	});
});
