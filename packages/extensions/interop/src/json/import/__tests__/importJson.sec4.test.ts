import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { createDefaultSchema } from "@input/pen-schema-default";
import {
	INGEST_MAX_IMAGE_COUNT,
	INGEST_MAX_NESTING_DEPTH,
	INGEST_MAX_NODE_COUNT,
	INGEST_MAX_TEXT_SIZE,
} from "../ingestBounds";
import { jsonImporter, parseJsonWithReport } from "../importer";

// packages/ is 6 levels up after the move (was 4: src/__tests__ → import-json
// → extensions → packages). Depth difference: +2 (json/import inserted).
const hostileDir = join(
	dirname(fileURLToPath(import.meta.url)),
	"../../../../../../tooling/conformance/fixtures/hostile",
);

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

function createBareEditor() {
	const editor = createEditor({
		schema: createDefaultSchema(),
		preset: noDefaultExtensionsPreset,
	});
	const existingBlockIds = [...editor.documentState.allBlocks()]
		.filter((handle) => handle.parent === null)
		.map((handle) => handle.id);
	if (existingBlockIds.length > 0) {
		editor.apply(
			existingBlockIds.reverse().map((blockId) => ({
				type: "delete-block" as const,
				blockId,
			})),
		);
	}
	return editor;
}

function paragraph(id: string, text = "Hi") {
	return {
		id,
		type: "paragraph",
		props: {},
		content: { text },
	};
}

function nestToggles(depth: number): Record<string, unknown> {
	if (depth <= 1) {
		return paragraph("leaf");
	}
	return {
		id: `toggle-${depth}`,
		type: "toggle",
		props: {},
		content: { text: `d${depth}` },
		children: [nestToggles(depth - 1)],
	};
}

describe("IOP5 JSON ingest bounds", () => {
	it("IOP5 truncates oversize node count at a block boundary", () => {
		const editor = createBareEditor();
		const blocks = Array.from({ length: INGEST_MAX_NODE_COUNT + 5 }, (_, index) =>
			paragraph(`p-${index}`),
		);

		const { blocks: kept, report } = parseJsonWithReport(
			{ version: 1, blocks },
			editor,
		);

		expect(kept).toHaveLength(INGEST_MAX_NODE_COUNT);
		expect(report.droppedByReason).toEqual([
			{
				reason: "count-exceeded",
				count: 5,
				bound: "INGEST_MAX_NODE_COUNT",
				limit: INGEST_MAX_NODE_COUNT,
				actual: INGEST_MAX_NODE_COUNT + 5,
				dropped: "5 blocks",
			},
		]);

		editor.destroy();
	});

	it("IOP5 truncates oversize imported text at a block boundary", () => {
		const editor = createBareEditor();
		const { blocks, report } = parseJsonWithReport(
			{
				version: 1,
				blocks: [
					paragraph("ok", "x".repeat(INGEST_MAX_TEXT_SIZE)),
					paragraph("overflow", "yyyy"),
				],
			},
			editor,
		);

		expect(blocks.map((block) => block.content)).toEqual([
			"x".repeat(INGEST_MAX_TEXT_SIZE),
		]);
		expect(report.droppedByReason).toEqual([
			{
				reason: "text-size-exceeded",
				count: 4,
				bound: "INGEST_MAX_TEXT_SIZE",
				limit: INGEST_MAX_TEXT_SIZE,
				actual: INGEST_MAX_TEXT_SIZE + 4,
				dropped: "4 code units",
			},
		]);

		editor.destroy();
	});

	it("IOP5 truncates deep nesting past depth 32", () => {
		const editor = createBareEditor();
		const { blocks, report } = parseJsonWithReport(
			{ version: 1, blocks: [nestToggles(INGEST_MAX_NESTING_DEPTH + 1)] },
			editor,
		);

		expect(report.droppedByReason).toEqual([
			{
				reason: "depth-exceeded",
				count: 1,
				bound: "INGEST_MAX_NESTING_DEPTH",
				limit: INGEST_MAX_NESTING_DEPTH,
				actual: INGEST_MAX_NESTING_DEPTH + 1,
				dropped: "1 block",
			},
		]);

		let depth = 0;
		let current: (typeof blocks)[number] | undefined = blocks[0];
		while (current) {
			depth += 1;
			current = current.children?.[0];
		}
		expect(depth).toBe(INGEST_MAX_NESTING_DEPTH);

		editor.destroy();
	});

	it("IOP5 truncates many images and names the bound", () => {
		const editor = createBareEditor();
		const blocks = Array.from(
			{ length: INGEST_MAX_IMAGE_COUNT + 2 },
			(_, index) => ({
				id: `img-${index}`,
				type: "image",
				props: { src: `https://example.com/${index}.png`, alt: `${index}` },
			}),
		);

		const result = jsonImporter.import({ version: 1, blocks }, editor);
		const imageCount = [...editor.documentState.allBlocks()].filter(
			(block) => block.type === "image",
		).length;

		expect(imageCount).toBe(INGEST_MAX_IMAGE_COUNT);
		expect(result.droppedByReason).toEqual([
			{
				reason: "image-count-exceeded",
				count: 2,
				bound: "INGEST_MAX_IMAGE_COUNT",
				limit: INGEST_MAX_IMAGE_COUNT,
				actual: INGEST_MAX_IMAGE_COUNT + 2,
				dropped: "2 images",
			},
		]);

		editor.destroy();
	});
});

describe("IOP5 JSON ingest pre-parse cap", () => {
	it("IOP5 a 2×-cap string is refused before JSON.parse, so trailing junk never parses", () => {
		const editor = createBareEditor();
		const keep =
			'{"version":1,"blocks":[{"id":"k","type":"paragraph","props":{},"content":{"text":"keep"}}]}';
		const input2x = `${keep}${"x".repeat(INGEST_MAX_TEXT_SIZE)}`;
		const input4x = `${keep}${"x".repeat(INGEST_MAX_TEXT_SIZE * 3)}`;

		expect(input2x.length).toBeGreaterThan(INGEST_MAX_TEXT_SIZE);
		expect(() => JSON.parse(input2x)).toThrow();

		const full2x = parseJsonWithReport(input2x, editor);
		const full4x = parseJsonWithReport(input4x, editor);

		expect(full2x.blocks).toEqual([]);
		expect(full2x.blocks).toEqual(full4x.blocks);
		expect(full2x.report.droppedByReason).toEqual([
			{
				reason: "text-size-exceeded",
				count: input2x.length - INGEST_MAX_TEXT_SIZE,
				bound: "INGEST_MAX_TEXT_SIZE",
				limit: INGEST_MAX_TEXT_SIZE,
				actual: input2x.length,
				dropped: `${input2x.length - INGEST_MAX_TEXT_SIZE} code units`,
			},
		]);
		expect(full4x.report.droppedByReason[0]?.actual).toBeGreaterThan(
			full2x.report.droppedByReason[0]?.actual ?? 0,
		);

		editor.destroy();
	});
});

describe("IOP6 JSON ingest report", () => {
	it("IOP6 returns one dropped-by-reason report instead of a diagnostic stream", () => {
		const editor = createBareEditor();
		const diagnostics: Array<{ code: string }> = [];
		editor.on("diagnostic", (event) => {
			diagnostics.push(event);
		});

		const result = jsonImporter.import(
			{
				version: 1,
				blocks: [
					{ id: "a", type: "not-a-real-block", props: {} },
					{ id: "b", type: "also-missing", props: {} },
					paragraph("ok"),
				],
			},
			editor,
		);

		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0]?.code).toBe("import-dropped");
		expect(result.droppedByReason).toEqual([
			{
				reason: "unknown-block-type",
				count: 2,
				dropped: "2 blocks",
			},
		]);
		expect(result.droppedBlockTypes).toEqual([
			"not-a-real-block",
			"also-missing",
		]);

		editor.destroy();
	});
});

describe("SEC4 JSON ingestion", () => {
	it("SEC4 schema-validates before ops and drops unknown props with import-dropped", () => {
		const editor = createBareEditor();
		const diagnostics: Array<{ code: string }> = [];
		editor.on("diagnostic", (event) => {
			diagnostics.push(event);
		});

		jsonImporter.import(
			{
				version: 1,
				blocks: [
					{
						id: "h1",
						type: "heading",
						props: { level: 2, extraEvil: "nope" },
						content: { text: "Title" },
					},
				],
			},
			editor,
		);

		const heading = [...editor.documentState.allBlocks()].find(
			(block) => block.type === "heading",
		);
		expect(heading?.props.level).toBe(2);
		expect(heading?.props).not.toHaveProperty("extraEvil");
		expect(diagnostics).toEqual([
			expect.objectContaining({
				code: "import-dropped",
			}),
		]);

		editor.destroy();
	});

	it("SEC4 rejects __proto__/constructor/prototype own keys", () => {
		const editor = createBareEditor();
		const diagnostics: Array<{
			code: string;
			droppedByReason?: Array<{ reason: string }>;
		}> = [];
		editor.on("diagnostic", (event) => {
			diagnostics.push(event);
		});

		const polluted = JSON.parse(`{
			"version": 1,
			"blocks": [{
				"id": "b1",
				"type": "paragraph",
				"__proto__": { "polluted": true },
				"constructor": { "polluted": true },
				"prototype": { "polluted": true },
				"props": {
					"__proto__": { "polluted": true },
					"constructor": "nope",
					"prototype": "nope"
				},
				"content": { "text": "Safe" }
			}]
		}`);

		const before = Object.hasOwn(Object.prototype, "polluted");
		const result = jsonImporter.import(polluted, editor);

		expect(Object.hasOwn(Object.prototype, "polluted")).toBe(before);
		expect(result.droppedByReason).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					reason: "forbidden-key",
				}),
			]),
		);
		expect(diagnostics).toEqual([
			expect.objectContaining({ code: "import-dropped" }),
		]);

		const imported = [...editor.documentState.allBlocks()].find(
			(block) => block.type === "paragraph",
		);
		expect(imported?.textContent()).toBe("Safe");
		expect(Object.getPrototypeOf(result.droppedByReason[0] ?? {})).not.toBeNull();
		expect(imported?.props).not.toHaveProperty("prototype");
		expect(imported?.props).not.toHaveProperty("constructor");
		expect(imported?.props).not.toHaveProperty("__proto__");

		editor.destroy();
	});

	it("SEC4 rejects constructor and prototype own keys", () => {
		const editor = createBareEditor();
		const polluted = JSON.parse(`{
			"version": 1,
			"metadata": {
				"constructor": { "polluted": true },
				"prototype": { "polluted": true }
			},
			"blocks": [{
				"id": "b1",
				"type": "paragraph",
				"props": {
					"constructor": "nope",
					"prototype": "nope"
				},
				"content": {
					"text": "Safe",
					"marks": [{
						"type": "bold",
						"start": 0,
						"end": 4,
						"constructor": { "polluted": true },
						"prototype": { "polluted": true },
						"props": {
							"constructor": "nope",
							"prototype": "nope"
						}
					}]
				}
			}]
		}`);

		const before = Object.hasOwn(Object.prototype, "polluted");
		const { blocks, report } = parseJsonWithReport(polluted, editor);

		expect(Object.hasOwn(Object.prototype, "polluted")).toBe(before);
		expect(report.droppedByReason).toEqual([
			{
				reason: "forbidden-key",
				count: 8,
				dropped: "8 own keys",
			},
		]);

		const block = blocks[0]!;
		expect(block.content).toBe("Safe");
		expect(block.props).not.toHaveProperty("constructor");
		expect(block.props).not.toHaveProperty("prototype");
		expect(block.marks?.[0]).toMatchObject({ type: "bold", start: 0, end: 4 });
		expect(block.marks?.[0]).not.toHaveProperty("constructor");
		expect(block.marks?.[0]).not.toHaveProperty("prototype");
		expect(block.marks?.[0]?.props ?? {}).not.toHaveProperty("constructor");
		expect(block.marks?.[0]?.props ?? {}).not.toHaveProperty("prototype");

		editor.destroy();
	});

	it("SEC4 builds fresh null-prototype records and never deep-merges raw JSON", () => {
		const editor = createBareEditor();
		const rawProps = { level: 1 };
		const document = {
			version: 1,
			blocks: [
				{
					id: "h1",
					type: "heading",
					props: rawProps,
					content: { text: "Hi" },
				},
			],
		};

		const { blocks } = parseJsonWithReport(document, editor);

		expect(Object.getPrototypeOf(blocks[0]!.props)).toBeNull();
		expect(blocks[0]!.props).not.toBe(rawProps);
		rawProps.level = 99;
		expect(blocks[0]!.props.level).toBe(1);

		editor.destroy();
	});

	it("SEC4 corpus proto-keys.json does not pollute and emits import-dropped", () => {
		const editor = createBareEditor();
		const diagnostics: Array<{ code: string }> = [];
		editor.on("diagnostic", (event) => {
			diagnostics.push(event);
		});

		const document = JSON.parse(
			readFileSync(join(hostileDir, "proto-keys.json"), "utf8"),
		) as unknown;
		const before = Object.hasOwn(Object.prototype, "polluted");
		const result = jsonImporter.import(document, editor);

		expect(Object.hasOwn(Object.prototype, "polluted")).toBe(before);
		expect(diagnostics).toEqual([
			expect.objectContaining({ code: "import-dropped" }),
		]);
		expect(result.droppedByReason).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ reason: "forbidden-key" }),
			]),
		);
		const imported = [...editor.documentState.allBlocks()].find(
			(block) => block.type === "paragraph",
		);
		expect(imported?.textContent()).toBe("proto");
		expect(imported?.props).not.toHaveProperty("__proto__");
		expect(imported?.props).not.toHaveProperty("constructor");
		expect(imported?.props).not.toHaveProperty("prototype");

		editor.destroy();
	});

	it("SEC4 corpus oversized depth/count builders truncate", () => {
		const editor = createBareEditor();
		const depth = parseJsonWithReport(
			{ version: 1, blocks: [nestToggles(INGEST_MAX_NESTING_DEPTH + 1)] },
			editor,
		);
		expect(depth.report.droppedByReason).toEqual([
			{
				reason: "depth-exceeded",
				count: 1,
				bound: "INGEST_MAX_NESTING_DEPTH",
				limit: INGEST_MAX_NESTING_DEPTH,
				actual: INGEST_MAX_NESTING_DEPTH + 1,
				dropped: "1 block",
			},
		]);

		const count = parseJsonWithReport(
			{
				version: 1,
				blocks: Array.from(
					{ length: INGEST_MAX_NODE_COUNT + 3 },
					(_, index) => paragraph(`p-${index}`),
				),
			},
			editor,
		);
		expect(count.blocks).toHaveLength(INGEST_MAX_NODE_COUNT);
		expect(count.report.droppedByReason).toEqual([
			{
				reason: "count-exceeded",
				count: 3,
				bound: "INGEST_MAX_NODE_COUNT",
				limit: INGEST_MAX_NODE_COUNT,
				actual: INGEST_MAX_NODE_COUNT + 3,
				dropped: "3 blocks",
			},
		]);

		editor.destroy();
	});
});
