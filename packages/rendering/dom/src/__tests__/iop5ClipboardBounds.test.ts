import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import type { Editor } from "@input/pen-types";
import { defaultSchema } from "@input/pen-schema-default";
import {
	CLIPBOARD_INGEST_MAX_IMAGE_COUNT,
	CLIPBOARD_INGEST_MAX_NESTING_DEPTH,
	CLIPBOARD_INGEST_MAX_NODE_COUNT,
	CLIPBOARD_INGEST_MAX_TEXT_SIZE,
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
		schema: defaultSchema,
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

function countNodes(blocks: readonly PenBlock[]): number {
	let count = 0;
	for (const block of blocks) {
		count += 1;
		if (block.children) {
			count += countNodes(block.children);
		}
	}
	return count;
}

function maxDepth(blocks: readonly PenBlock[], depth = 1): number {
	let deepest = depth;
	for (const block of blocks) {
		if (block.children && block.children.length > 0) {
			deepest = Math.max(deepest, maxDepth(block.children, depth + 1));
		}
	}
	return deepest;
}

function countImages(blocks: readonly PenBlock[]): number {
	let count = 0;
	for (const block of blocks) {
		if (block.type === "image") {
			count += 1;
		}
		if (block.children) {
			count += countImages(block.children);
		}
	}
	return count;
}

function totalTextLength(blocks: readonly PenBlock[]): number {
	let length = 0;
	for (const block of blocks) {
		if (typeof block.content === "string") {
			length += block.content.length;
		}
		if (block.children) {
			length += totalTextLength(block.children);
		}
	}
	return length;
}

function buildHostileClipboardPayload(): PenBlock[] {
	const depthOverflow = 6;
	const imageOverflow = 12;
	const textOverflow = "OVERFLOW";
	const nodeOverflow = 40;

	return [
		nestToggles(CLIPBOARD_INGEST_MAX_NESTING_DEPTH + depthOverflow),
		...Array.from(
			{ length: CLIPBOARD_INGEST_MAX_IMAGE_COUNT + imageOverflow },
			(_, index) => ({
				type: "image" as const,
				props: { src: `https://example.com/hostile-${index}.png` },
			}),
		),
		{
			type: "paragraph",
			content: "L".repeat(CLIPBOARD_INGEST_MAX_TEXT_SIZE),
		},
		{ type: "paragraph", content: textOverflow },
		...Array.from(
			{ length: CLIPBOARD_INGEST_MAX_NODE_COUNT + nodeOverflow },
			() => ({
				type: "paragraph" as const,
				content: "n",
			}),
		),
	];
}

describe("IOP5/IOP6 clipboard JSON ingest", () => {
	it("IOP5/IOP6: a 10k-node pathological paste keeps the node cap and reports the overflow", () => {
		const editor = createBareEditor();
		const overflow = 5;
		const blocks: PenBlock[] = Array.from(
			{ length: CLIPBOARD_INGEST_MAX_NODE_COUNT + overflow },
			() => ({ type: "paragraph", content: "n" }),
		);

		const result = admitClipboardBlocks(blocks, editor);

		expect(result.blocks).toHaveLength(CLIPBOARD_INGEST_MAX_NODE_COUNT);
		expect(result.droppedByReason).toEqual([
			{
				reason: "count-exceeded",
				count: overflow,
				bound: "CLIPBOARD_INGEST_MAX_NODE_COUNT",
			},
		]);

		editor.destroy();
	});

	it("IOP5/IOP6: a hostile clipboard payload (deep nest, many blocks, long text, many images) reports every bound", () => {
		const editor = createBareEditor();
		const blocks = buildHostileClipboardPayload();

		const result = admitClipboardBlocks(blocks, editor);

		expect(countNodes(result.blocks)).toBeLessThanOrEqual(
			CLIPBOARD_INGEST_MAX_NODE_COUNT,
		);
		expect(maxDepth(result.blocks)).toBeLessThanOrEqual(
			CLIPBOARD_INGEST_MAX_NESTING_DEPTH,
		);
		expect(countImages(result.blocks)).toBeLessThanOrEqual(
			CLIPBOARD_INGEST_MAX_IMAGE_COUNT,
		);
		expect(totalTextLength(result.blocks)).toBeLessThanOrEqual(
			CLIPBOARD_INGEST_MAX_TEXT_SIZE,
		);
		expect(result.droppedByReason).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					reason: "count-exceeded",
					bound: "CLIPBOARD_INGEST_MAX_NODE_COUNT",
				}),
				expect.objectContaining({
					reason: "depth-exceeded",
					bound: "CLIPBOARD_INGEST_MAX_NESTING_DEPTH",
				}),
				expect.objectContaining({
					reason: "image-count-exceeded",
					bound: "CLIPBOARD_INGEST_MAX_IMAGE_COUNT",
				}),
				expect.objectContaining({
					reason: "text-size-exceeded",
					bound: "CLIPBOARD_INGEST_MAX_TEXT_SIZE",
				}),
			]),
		);

		editor.destroy();
	});
});
