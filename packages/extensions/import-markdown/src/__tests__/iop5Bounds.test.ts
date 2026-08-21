import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
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
