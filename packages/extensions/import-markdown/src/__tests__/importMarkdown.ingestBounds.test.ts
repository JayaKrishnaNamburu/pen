import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { createDefaultSchema } from "@input/pen-schema-default";
import {
	INGEST_MAX_IMAGE_COUNT,
	INGEST_MAX_NESTING_DEPTH,
	INGEST_MAX_NODE_COUNT,
	INGEST_MAX_TEXT_SIZE,
	INGEST_TIME_BUDGET_MS,
	boundPendingBlocks,
	capRawMarkdownSource,
	IngestDropCounts,
} from "../ingestBounds";
import {
	markdownImporter,
	parseMarkdownWithReport,
} from "../importer";

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

const defaultRegistry = createDefaultSchema();

function createBareEditor() {
	return createEditor({
		schema: defaultRegistry,
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

	it("IOP5 truncates oversize parsed markdown node count at a block boundary", () => {
		const editor = createBareEditor();
		const overflow = 3;
		const markdown = Array.from(
			{ length: INGEST_MAX_NODE_COUNT + overflow },
			(_, index) => `p${index}`,
		).join("\n\n");

		const { blocks, report } = parseMarkdownWithReport(markdown, editor);

		expect(blocks).toHaveLength(INGEST_MAX_NODE_COUNT);
		expect(report.droppedByReason).toEqual([
			{
				reason: "count-exceeded",
				count: overflow,
				bound: "INGEST_MAX_NODE_COUNT",
				limit: INGEST_MAX_NODE_COUNT,
				actual: INGEST_MAX_NODE_COUNT + overflow,
				dropped: "3 blocks",
			},
		]);

		editor.destroy();
	});

	it("IOP5 truncates oversize imported text at a block boundary", () => {
		const editor = createBareEditor();
		const overflow = "y".repeat(32);
		const markdown = `${"x".repeat(INGEST_MAX_TEXT_SIZE)}\n\n${overflow}`;

		const { blocks, report } = parseMarkdownWithReport(markdown, editor);

		expect(blocks.every((block) => (block.content ?? "").includes("y"))).toBe(
			false,
		);
		expect(report.droppedByReason).toEqual([
			{
				reason: "text-size-exceeded",
				count: 2 + overflow.length,
				bound: "INGEST_MAX_TEXT_SIZE",
				limit: INGEST_MAX_TEXT_SIZE,
				actual: markdown.length,
				dropped: `${2 + overflow.length} code units`,
			},
		]);

		editor.destroy();
	});

	it("IOP5 truncates deep list nesting past depth 32", () => {
		const editor = createBareEditor();
		const lines = Array.from(
			{ length: INGEST_MAX_NESTING_DEPTH + 2 },
			(_, index) => `${"  ".repeat(index)}- item ${index}`,
		);
		const { blocks, report } = parseMarkdownWithReport(lines.join("\n"), editor);

		const maxIndent = Math.max(
			0,
			...blocks.map((block) =>
				typeof block.props.indent === "number" ? block.props.indent : 0,
			),
		);
		expect(maxIndent).toBe(INGEST_MAX_NESTING_DEPTH - 1);
		expect(report.droppedByReason).toEqual([
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

	it("IOP5 truncates many images and names the bound", () => {
		const editor = createBareEditor();
		const markdown = Array.from(
			{ length: INGEST_MAX_IMAGE_COUNT + 4 },
			(_, index) => `![alt ${index}](https://example.com/${index}.png)`,
		).join("\n\n");

		const diagnostics: Array<{ code: string; droppedByReason?: unknown }> = [];
		editor.on("diagnostic", (event) => {
			diagnostics.push(event);
		});

		const result = markdownImporter.import(markdown, editor);

		const imageCount = [...editor.documentState.allBlocks()].filter(
			(block) => block.type === "image",
		).length;
		expect(imageCount).toBe(INGEST_MAX_IMAGE_COUNT);
		expect(result.droppedByReason).toEqual([
			{
				reason: "image-count-exceeded",
				count: 4,
				bound: "INGEST_MAX_IMAGE_COUNT",
				limit: INGEST_MAX_IMAGE_COUNT,
				actual: INGEST_MAX_IMAGE_COUNT + 4,
				dropped: "4 images",
			},
		]);
		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0]?.code).toBe("import-truncated");
		expect(diagnostics[0]?.droppedByReason).toEqual(result.droppedByReason);

		editor.destroy();
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
			{ length: 8 },
			(_, index) => `![alt ${index}](https://example.com/${index}.png)`,
		).join("\n\n");
		const overImageMarkdown = `${markdown}\n\n${Array.from(
			{ length: INGEST_MAX_IMAGE_COUNT },
			(_, index) => `![extra ${index}](https://example.com/extra-${index}.png)`,
		).join("\n\n")}`;

		const result = markdownImporter.import(overImageMarkdown, editor);

		expect(diagnostics).toHaveLength(1);
		expect(result.droppedByReason).toHaveLength(1);
		expect(result.droppedByReason[0]?.reason).toBe("image-count-exceeded");
		expect(result.droppedByReason[0]?.count).toBe(8);
		expect(result.droppedByReason[0]?.limit).toBe(INGEST_MAX_IMAGE_COUNT);
		expect(result.droppedByReason[0]?.actual).toBe(INGEST_MAX_IMAGE_COUNT + 8);

		editor.destroy();
	});
});

describe("IOP5 markdown ingest time budget", () => {
	it("IOP5 states the clipboard-sibling time budget (not re-recorded tonight)", () => {
		expect(INGEST_TIME_BUDGET_MS).toBe(1_000);
	});

	it("IOP5 a 2×-cap source is sliced before parse and reports the actual overflow", () => {
		const editor = createBareEditor();
		const keep = "keep\n\n";
		const input = `${keep}${"x".repeat(INGEST_MAX_TEXT_SIZE * 2)}`;
		const preview = new IngestDropCounts();
		const capped = capRawMarkdownSource(input, preview);

		expect(capped.length).toBeLessThanOrEqual(INGEST_MAX_TEXT_SIZE);
		expect(preview.toDroppedByReason()).toEqual([
			{
				reason: "text-size-exceeded",
				count: input.length - capped.length,
				bound: "INGEST_MAX_TEXT_SIZE",
				limit: INGEST_MAX_TEXT_SIZE,
				actual: input.length,
				dropped: `${input.length - capped.length} code units`,
			},
		]);

		const { blocks, report } = parseMarkdownWithReport(input, editor);
		expect(report.droppedByReason).toEqual(preview.toDroppedByReason());
		expect(blocks.every((block) => (block.content ?? "").includes("x"))).toBe(
			false,
		);
		expect(blocks).toEqual([
			expect.objectContaining({ type: "paragraph", content: "keep" }),
		]);

		editor.destroy();
	});

	it("IOP5/IOP6 markdownImporter.parse (paste entry) emits one report naming the bound, limit, and actual", () => {
		const editor = createBareEditor();
		const diagnostics: Array<{
			code: string;
			droppedByReason?: unknown;
			message?: string;
		}> = [];
		editor.on("diagnostic", (event) => {
			diagnostics.push(event);
		});

		const markdown = Array.from(
			{ length: INGEST_MAX_IMAGE_COUNT + 4 },
			(_, index) => `![alt ${index}](https://example.com/${index}.png)`,
		).join("\n\n");
		const blocks = markdownImporter.parse(markdown, editor);

		expect(blocks.filter((block) => block.type === "image")).toHaveLength(
			INGEST_MAX_IMAGE_COUNT,
		);
		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0]?.code).toBe("import-truncated");
		expect(diagnostics[0]?.message).toContain("actual 260");
		expect(diagnostics[0]?.message).toContain("limit 256");
		expect(diagnostics[0]?.droppedByReason).toEqual([
			{
				reason: "image-count-exceeded",
				count: 4,
				bound: "INGEST_MAX_IMAGE_COUNT",
				limit: INGEST_MAX_IMAGE_COUNT,
				actual: INGEST_MAX_IMAGE_COUNT + 4,
				dropped: "4 images",
			},
		]);

		editor.destroy();
	});
});
