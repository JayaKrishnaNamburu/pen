import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import committedBlocks100 from "../fixtures/envelope/committed/blocks-100.json";
import {
	ENVELOPE_COMMITTED_BLOCK_COUNT,
	ENVELOPE_LONG_BLOCK_CHARS,
	ENVELOPE_NESTING_DEPTH,
	ENVELOPE_TABLE_COLS,
	ENVELOPE_TABLE_ROWS,
	LONG_BLOCK_ID,
	TABLE_BLOCK_ID,
	createBlockCountEditor,
	createLongBlockEditor,
	createNestingEditor,
	createTableEditor,
	envelopeBlockId,
	envelopeMetadata,
	envelopeNestId,
	generateBlockSpecs,
	measureNestingDepth,
} from "../fixtures/envelope/generate";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../../../");
const ENVELOPE_MD = join(ROOT, "packages/tooling/test/ENVELOPE.md");

describe("SCALE1 envelope ladder", () => {
	it("SCALE1 committed 100-block fixture matches the generator", () => {
		expect(generateBlockSpecs(ENVELOPE_COMMITTED_BLOCK_COUNT)).toEqual(
			committedBlocks100,
		);
	});

	it("SCALE1 100-block document loads and accepts a text insert", () => {
		const editor = createBlockCountEditor(100);
		expect(editor.document.blockOrder.length).toBe(100);
		const lastId = envelopeBlockId(99);
		const before = editor.getBlock(lastId).textContent();
		editor.apply(
			[
				{
					type: "insert-text",
					blockId: lastId,
					offset: before.length,
					text: "x",
				},
			],
			{ origin: "user" },
		);
		expect(editor.getBlock(lastId).textContent()).toBe(`${before}x`);
		editor.destroy();
	});

	it("SCALE1 1000-block document loads and accepts a text insert", () => {
		const editor = createBlockCountEditor(1000);
		expect(editor.document.blockOrder.length).toBe(1000);
		const lastId = envelopeBlockId(999);
		const before = editor.getBlock(lastId).textContent();
		editor.apply(
			[
				{
					type: "insert-text",
					blockId: lastId,
					offset: before.length,
					text: "x",
				},
			],
			{ origin: "user" },
		);
		expect(editor.getBlock(lastId).textContent()).toBe(`${before}x`);
		editor.destroy();
	});

	it("SCALE1 5000-block document loads and accepts a text insert", () => {
		const editor = createBlockCountEditor(5000);
		expect(editor.document.blockOrder.length).toBe(5000);
		const lastId = envelopeBlockId(4999);
		const before = editor.getBlock(lastId).textContent();
		editor.apply(
			[
				{
					type: "insert-text",
					blockId: lastId,
					offset: before.length,
					text: "x",
				},
			],
			{ origin: "user" },
		);
		expect(editor.getBlock(lastId).textContent()).toBe(`${before}x`);
		editor.destroy();
	}, 60_000);

	it("SCALE1 100k-character block loads and accepts a text insert", () => {
		const editor = createLongBlockEditor();
		const block = editor.getBlock(LONG_BLOCK_ID);
		expect(block.textContent().length).toBe(ENVELOPE_LONG_BLOCK_CHARS);
		editor.apply(
			[
				{
					type: "insert-text",
					blockId: LONG_BLOCK_ID,
					offset: ENVELOPE_LONG_BLOCK_CHARS,
					text: "x",
				},
			],
			{ origin: "user" },
		);
		expect(editor.getBlock(LONG_BLOCK_ID).textContent().length).toBe(
			ENVELOPE_LONG_BLOCK_CHARS + 1,
		);
		editor.destroy();
	});

	it("SCALE1 nesting depth 10 loads in a headless editor", () => {
		const editor = createNestingEditor();
		expect(measureNestingDepth(editor, envelopeNestId(0))).toBe(
			ENVELOPE_NESTING_DEPTH,
		);
		editor.destroy();
	});

	it("SCALE1 50x20 table loads in a headless editor", () => {
		const editor = createTableEditor();
		const table = editor.getBlock(TABLE_BLOCK_ID);
		expect(table.tableRowCount()).toBe(ENVELOPE_TABLE_ROWS);
		expect(table.tableColumnCount()).toBe(ENVELOPE_TABLE_COLS);
		editor.destroy();
	});

	it("SCALE1 envelope table lists every axis grade from metadata", () => {
		const markdown = readFileSync(ENVELOPE_MD, "utf8");
		for (const axis of envelopeMetadata.axes) {
			expect(markdown).toContain(axis.label);
			expect(markdown).toContain(axis.verified.display);
			expect(markdown).toContain(axis.untestedAbove.display);
			if (axis.measured) {
				expect(markdown).toContain(axis.measured.display);
			}
		}
	});
});
