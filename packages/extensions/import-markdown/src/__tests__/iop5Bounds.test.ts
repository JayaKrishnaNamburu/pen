import { describe, expect, it } from "vitest";
import { createEditor, type PendingBlock } from "@input/pen-core";
import { createDefaultSchema } from "@input/pen-schema-default";
import {
	INGEST_MAX_NESTING_DEPTH,
	INGEST_MAX_NODE_COUNT,
	INGEST_MAX_TEXT_SIZE,
	boundPendingBlocks,
	IngestDropCounts,
} from "../ingestBounds";
import { markdownImporter } from "../importer";

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

function createBareEditor() {
	return createEditor({
		schema: createDefaultSchema(),
		preset: noDefaultExtensionsPreset,
	});
}

function paragraph(
	content = "x",
	extras: Partial<PendingBlock> = {},
): PendingBlock {
	return { type: "paragraph", props: {}, content, ...extras };
}

function nestLayout(levels: number): PendingBlock {
	let current: PendingBlock = paragraph("leaf");
	for (let i = 1; i < levels; i += 1) {
		current = { type: "layoutRow", props: {}, children: [current] };
	}
	return current;
}

describe("IOP5 markdown ingest bounds", () => {
	it("IOP5 truncates oversize node count at a block boundary", () => {
		const drops = new IngestDropCounts();
		const blocks = Array.from({ length: INGEST_MAX_NODE_COUNT + 3 }, () => ({
			type: "paragraph",
			props: {},
			content: "x",
		}));

		const kept = boundPendingBlocks(blocks, drops);

		expect(kept).toHaveLength(INGEST_MAX_NODE_COUNT);
		expect(drops.toDroppedByReason()).toEqual([
			{
				reason: "count-exceeded",
				count: 3,
				bound: "INGEST_MAX_NODE_COUNT",
				limit: INGEST_MAX_NODE_COUNT,
				actual: INGEST_MAX_NODE_COUNT + 3,
				dropped: "3 blocks",
			},
		]);
	});

	it("IOP5 truncates oversize imported text at a block boundary", () => {
		const drops = new IngestDropCounts();
		const kept = boundPendingBlocks(
			[
				{
					type: "paragraph",
					props: {},
					content: "x".repeat(INGEST_MAX_TEXT_SIZE),
				},
				{ type: "paragraph", props: {}, content: "yyyy" },
			],
			drops,
		);

		expect(kept.map((block) => block.content)).toEqual([
			"x".repeat(INGEST_MAX_TEXT_SIZE),
		]);
		expect(drops.toDroppedByReason()).toEqual([
			{
				reason: "text-size-exceeded",
				count: 4,
				bound: "INGEST_MAX_TEXT_SIZE",
				limit: INGEST_MAX_TEXT_SIZE,
				actual: INGEST_MAX_TEXT_SIZE + 4,
				dropped: "4 code units",
			},
		]);
	});

	it("IOP5 truncates nesting past depth 32", () => {
		const drops = new IngestDropCounts();
		const kept = boundPendingBlocks(
			[
				{
					type: "bulletListItem",
					props: { indent: INGEST_MAX_NESTING_DEPTH - 1 },
					content: "ok",
				},
				{
					type: "bulletListItem",
					props: { indent: INGEST_MAX_NESTING_DEPTH },
					content: "too deep",
				},
			],
			drops,
		);

		expect(kept).toHaveLength(1);
		expect(kept[0]?.content).toBe("ok");
		expect(drops.toDroppedByReason()).toEqual([
			{
				reason: "depth-exceeded",
				count: 1,
				bound: "INGEST_MAX_NESTING_DEPTH",
				limit: INGEST_MAX_NESTING_DEPTH,
				actual: INGEST_MAX_NESTING_DEPTH + 1,
				dropped: "1 block",
			},
		]);
	});
});

describe("IOP6 markdown ingest report", () => {
	it("IOP6 returns one dropped-by-reason report instead of a diagnostic stream", () => {
		const editor = createBareEditor();
		const diagnostics: unknown[] = [];
		editor.on("diagnostic", (event) => {
			diagnostics.push(event);
		});

		const markdown = Array.from(
			{ length: INGEST_MAX_NESTING_DEPTH + 2 },
			(_, index) => `${"  ".repeat(index)}- item ${index}`,
		).join("\n");
		const result = markdownImporter.import(markdown, editor);

		expect(diagnostics).toHaveLength(1);
		expect(result.droppedByReason).toEqual([
			{
				reason: "depth-exceeded",
				count: 2,
				bound: "INGEST_MAX_NESTING_DEPTH",
				limit: INGEST_MAX_NESTING_DEPTH,
				actual: INGEST_MAX_NESTING_DEPTH + 2,
				dropped: "2 blocks",
			},
		]);

		editor.destroy();
	});
});

describe("IOP5 markdown nested and layout children", () => {
	it("IOP5 truncates a nested layout-child chain past depth 32", () => {
		const drops = new IngestDropCounts();
		const kept = boundPendingBlocks(
			[nestLayout(INGEST_MAX_NESTING_DEPTH + 1)],
			drops,
		);

		expect(kept).toHaveLength(1);
		let node: PendingBlock | undefined = kept[0];
		let depth = 1;
		while (node?.children?.[0]) {
			node = node.children[0];
			depth += 1;
		}
		expect(depth).toBe(INGEST_MAX_NESTING_DEPTH);
		expect(node?.content).not.toBe("leaf");
		expect(drops.toDroppedByReason()).toEqual([
			{
				reason: "depth-exceeded",
				count: 1,
				bound: "INGEST_MAX_NESTING_DEPTH",
				limit: INGEST_MAX_NESTING_DEPTH,
				actual: INGEST_MAX_NESTING_DEPTH + 1,
				dropped: "1 block",
			},
		]);
	});

	it("IOP5 counts nested children toward the node cap and reports the dropped subtree", () => {
		const overflowChild = paragraph("overflow", {
			children: [paragraph("also-dropped")],
		});
		const parent: PendingBlock = {
			type: "layoutRow",
			props: {},
			children: [
				...Array.from({ length: INGEST_MAX_NODE_COUNT - 1 }, () =>
					paragraph("kept"),
				),
				overflowChild,
			],
		};
		const drops = new IngestDropCounts();
		const kept = boundPendingBlocks([parent], drops);

		expect(kept).toHaveLength(1);
		expect(kept[0]?.children).toHaveLength(INGEST_MAX_NODE_COUNT - 1);
		expect(drops.toDroppedByReason()).toEqual([
			{
				reason: "count-exceeded",
				count: 2,
				bound: "INGEST_MAX_NODE_COUNT",
				limit: INGEST_MAX_NODE_COUNT,
				actual: INGEST_MAX_NODE_COUNT + 2,
				dropped: "2 blocks",
			},
		]);
	});

	it("IOP5 counts table-cell text toward the text-size bound", () => {
		const drops = new IngestDropCounts();
		const kept = boundPendingBlocks(
			[
				{
					type: "table",
					props: {},
					children: [
						{
							type: "__table_row",
							props: {},
							children: [
								{
									type: "__table_cell",
									props: {},
									content: "x".repeat(INGEST_MAX_TEXT_SIZE),
								},
								{
									type: "__table_cell",
									props: {},
									content: "yyyy",
								},
							],
						},
					],
				},
			],
			drops,
		);

		expect(kept[0]?.children?.[0]?.children?.map((cell) => cell.content)).toEqual(
			["x".repeat(INGEST_MAX_TEXT_SIZE)],
		);
		expect(drops.toDroppedByReason()).toEqual([
			{
				reason: "text-size-exceeded",
				count: 4,
				bound: "INGEST_MAX_TEXT_SIZE",
				limit: INGEST_MAX_TEXT_SIZE,
				actual: INGEST_MAX_TEXT_SIZE + 4,
				dropped: "4 code units",
			},
		]);
	});
});
