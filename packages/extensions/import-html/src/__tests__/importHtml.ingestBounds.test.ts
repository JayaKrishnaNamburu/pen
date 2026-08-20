import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { createDefaultSchema } from "@input/pen-schema-default";
import {
	INGEST_MAX_IMAGE_COUNT,
	INGEST_MAX_NESTING_DEPTH,
	INGEST_MAX_NODE_COUNT,
	INGEST_MAX_TEXT_SIZE,
	boundPendingBlocks,
	IngestDropCounts,
} from "../ingestBounds";
import {
	htmlImporter,
	parseHtmlWithReport,
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

function nestedListHtml(depth: number): string {
	let html = "";
	for (let index = 0; index < depth; index++) {
		html += `<ul><li>item ${index}`;
	}
	for (let index = 0; index < depth; index++) {
		html += "</li></ul>";
	}
	return html;
}

describe("IOP5 HTML ingest bounds", () => {
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
				dropped: "3 blocks",
			},
		]);
	});

	it("IOP5 truncates oversize imported text at a block boundary", () => {
		const editor = createBareEditor();
		const overflow = "y".repeat(32);
		const html = `${"x".repeat(INGEST_MAX_TEXT_SIZE)}\n<p>${overflow}</p>`;

		const { blocks, report } = parseHtmlWithReport(html, editor);

		expect(blocks.every((block) => (block.content ?? "").includes("y"))).toBe(
			false,
		);
		const textDrop = report.droppedByReason.find(
			(entry) => entry.reason === "text-size-exceeded",
		);
		expect(textDrop).toMatchObject({
			reason: "text-size-exceeded",
			bound: "INGEST_MAX_TEXT_SIZE",
		});
		expect(textDrop?.count).toBeGreaterThan(0);

		editor.destroy();
	});

	it("IOP5 truncates deep list nesting past depth 32", () => {
		const editor = createBareEditor();
		const { blocks, report } = parseHtmlWithReport(
			nestedListHtml(INGEST_MAX_NESTING_DEPTH + 2),
			editor,
		);

		const maxIndent = Math.max(
			0,
			...blocks.map((block) =>
				typeof block.props.indent === "number" ? block.props.indent : 0,
			),
		);
		expect(maxIndent).toBe(INGEST_MAX_NESTING_DEPTH - 1);
		expect(report.droppedByReason).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					reason: "depth-exceeded",
					bound: "INGEST_MAX_NESTING_DEPTH",
				}),
			]),
		);

		editor.destroy();
	});

	it("IOP5 truncates many images and names the bound", async () => {
		const editor = createBareEditor();
		const html = Array.from(
			{ length: INGEST_MAX_IMAGE_COUNT + 4 },
			(_, index) =>
				`<img src="https://example.com/${index}.png" alt="alt ${index}" />`,
		).join("\n");

		const diagnostics: Array<{ code: string; droppedByReason?: unknown }> = [];
		editor.on("diagnostic", (event) => {
			diagnostics.push(event);
		});

		const result = await htmlImporter.import(html, editor);

		const imageCount = [...editor.documentState.allBlocks()].filter(
			(block) => block.type === "image",
		).length;
		expect(imageCount).toBe(INGEST_MAX_IMAGE_COUNT);
		expect(result.droppedByReason).toEqual([
			{
				reason: "image-count-exceeded",
				count: 4,
				bound: "INGEST_MAX_IMAGE_COUNT",
				dropped: "4 images",
			},
		]);
		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0]?.code).toBe("import-truncated");
		expect(diagnostics[0]?.droppedByReason).toEqual(result.droppedByReason);

		editor.destroy();
	});
});

describe("IOP6 HTML ingest report", () => {
	it("IOP6 returns one dropped-by-reason report instead of a diagnostic stream", async () => {
		const editor = createBareEditor();
		const diagnostics: unknown[] = [];
		editor.on("diagnostic", (event) => {
			diagnostics.push(event);
		});

		const html = Array.from(
			{ length: 8 },
			(_, index) =>
				`<img src="https://example.com/${index}.png" alt="alt ${index}" />`,
		).join("\n");
		const overImageHtml = `${html}\n${Array.from(
			{ length: INGEST_MAX_IMAGE_COUNT },
			(_, index) =>
				`<img src="https://example.com/extra-${index}.png" alt="extra ${index}" />`,
		).join("\n")}`;

		const result = await htmlImporter.import(overImageHtml, editor);

		expect(diagnostics).toHaveLength(1);
		expect(result.droppedByReason).toHaveLength(1);
		expect(result.droppedByReason[0]?.reason).toBe("image-count-exceeded");
		expect(result.droppedByReason[0]?.count).toBe(8);

		editor.destroy();
	});
});
