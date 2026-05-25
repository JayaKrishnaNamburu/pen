import { yjsAdapter } from "@pen/crdt-yjs";
import { processStream } from "@pen/delta-stream";
import { inputRulesExtension } from "@pen/input-rules";
import { undoExtension } from "@pen/undo";
import {
	defineExtension,
	type DocumentSession,
	type PenStreamPart,
	getOpOriginType,
} from "@pen/types";
import { describe, expect, it, vi } from "vitest";

import {
	createDecorationSet,
	createDocumentSession,
	createEditor as createCoreEditor,
	createHeadlessEditor,
	ensureInlineCompletionController,
} from "../index";

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

const undoOnlyPreset = {
	resolve() {
		return { extensions: [undoExtension()] };
	},
};

function createEditor(options: Parameters<typeof createCoreEditor>[0] = {}) {
	return createCoreEditor({
		...options,
		preset: options.preset ?? noDefaultExtensionsPreset,
	});
}

function createDefaultEditor(
	options: Parameters<typeof createCoreEditor>[0] = {},
) {
	return createCoreEditor(options);
}

function createEditorWithUndo(
	options: Parameters<typeof createCoreEditor>[0] = {},
) {
	return createCoreEditor({
		...options,
		preset: options.preset ?? undoOnlyPreset,
	});
}

async function* createStream(parts: PenStreamPart[]) {
	for (const part of parts) {
		yield part;
	}
}

async function flushMicrotasks(count = 2): Promise<void> {
	for (let index = 0; index < count; index++) {
		await Promise.resolve();
	}
}

function visibleText(text: string): string {
	return text.replace(/\u200B/g, "");
}

type TestYTextLike = {
	insert(offset: number, text: string): void;
};

type TestBlockMapLike = {
	get(key: string): unknown;
};

type TestBlocksMapLike = {
	get(key: string): TestBlockMapLike | undefined;
};

type TestRawDocLike = {
	getMap(name: "blocks"): TestBlocksMapLike;
};

type TestTableRowLike = {
	get(field: "cells"): { delete(index: number, length: number): void };
};

type TestTableContentLike = {
	get(index: number): TestTableRowLike;
};


describe("@pen/core table operations", () => {
	it("insert-block with table type produces seeded 2x2 grid", () => {
		const editor = createEditor();

		editor.apply([
			{
				type: "insert-block",
				blockId: "t1",
				blockType: "table",
				props: {},
				position: "last",
			},
		]);

		const block = editor.getBlock("t1")!;
		expect(block.type).toBe("table");
		expect(block.tableRowCount()).toBe(2);
		expect(block.tableColumnCount()).toBe(2);

		const cell = block.tableCell(0, 0)!;
		expect(cell).not.toBeNull();
		expect(cell.id).toEqual(expect.any(String));
		expect(cell.textContent()).toBe("");

		editor.destroy();
	});

	it("insert-table-row adds a row matching existing column count", () => {
		const editor = createEditor();

		editor.apply([
			{
				type: "insert-block",
				blockId: "t1",
				blockType: "table",
				props: {},
				position: "last",
			},
		]);

		editor.apply([
			{
				type: "insert-table-row",
				blockId: "t1",
				index: 2,
			},
		]);

		const block = editor.getBlock("t1")!;
		expect(block.tableRowCount()).toBe(3);
		expect(block.tableColumnCount()).toBe(2);
		expect(block.tableCell(2, 0)).not.toBeNull();
		expect(block.tableCell(2, 1)).not.toBeNull();

		editor.destroy();
	});

	it("repairs table width from the widest row when legacy rows are short", () => {
		const editor = createEditor();

		editor.apply([
			{
				type: "insert-block",
				blockId: "t1",
				blockType: "table",
				props: {},
				position: "last",
			},
		]);

		editor.apply([
			{
				type: "insert-table-column",
				blockId: "t1",
				index: 2,
			},
		]);

		const blockMap = editor.internals.doc.blocks.get(
			"t1",
		) as TestBlockMapLike;
		const tableContent = blockMap.get(
			"tableContent",
		) as TestTableContentLike;
		const firstRow = tableContent.get(0);
		firstRow.get("cells").delete(2, 1);

		let block = editor.getBlock("t1")!;
		expect(block.tableColumnCount()).toBe(3);

		editor.apply([
			{
				type: "insert-table-row",
				blockId: "t1",
				index: block.tableRowCount(),
			},
			{
				type: "insert-table-cell-text",
				blockId: "t1",
				row: 0,
				col: 2,
				offset: 0,
				text: "Recovered",
			},
		]);

		block = editor.getBlock("t1")!;
		expect(block.tableRowCount()).toBe(3);
		expect(block.tableCell(0, 2)?.textContent()).toBe("Recovered");
		expect(block.tableCell(2, 0)).not.toBeNull();
		expect(block.tableCell(2, 1)).not.toBeNull();
		expect(block.tableCell(2, 2)).not.toBeNull();

		editor.destroy();
	});

	it("insert-table-column adds a column to all rows", () => {
		const editor = createEditor();

		editor.apply([
			{
				type: "insert-block",
				blockId: "t1",
				blockType: "table",
				props: {},
				position: "last",
			},
		]);

		editor.apply([
			{
				type: "insert-table-column",
				blockId: "t1",
				index: 2,
			},
		]);

		const block = editor.getBlock("t1")!;
		expect(block.tableRowCount()).toBe(2);
		expect(block.tableColumnCount()).toBe(3);
		expect(block.tableCell(0, 2)).not.toBeNull();
		expect(block.tableCell(1, 2)).not.toBeNull();

		editor.destroy();
	});

	it("delete-table-row removes a row", () => {
		const editor = createEditor();

		editor.apply([
			{
				type: "insert-block",
				blockId: "t1",
				blockType: "table",
				props: {},
				position: "last",
			},
		]);

		editor.apply([
			{
				type: "delete-table-row",
				blockId: "t1",
				index: 0,
			},
		]);

		expect(editor.getBlock("t1")!.tableRowCount()).toBe(1);

		editor.destroy();
	});

	it("delete-table-column removes a column from all rows", () => {
		const editor = createEditor();

		editor.apply([
			{
				type: "insert-block",
				blockId: "t1",
				blockType: "table",
				props: {},
				position: "last",
			},
		]);

		editor.apply([
			{
				type: "delete-table-column",
				blockId: "t1",
				index: 0,
			},
		]);

		expect(editor.getBlock("t1")!.tableColumnCount()).toBe(1);

		editor.destroy();
	});

	it("insert-table-cell-text writes text into a specific cell", () => {
		const editor = createEditor();

		editor.apply([
			{
				type: "insert-block",
				blockId: "t1",
				blockType: "table",
				props: {},
				position: "last",
			},
		]);

		editor.apply([
			{
				type: "insert-table-cell-text",
				blockId: "t1",
				row: 0,
				col: 1,
				offset: 0,
				text: "Hello",
			},
		]);

		const cell = editor.getBlock("t1")!.tableCell(0, 1)!;
		expect(cell.textContent()).toBe("Hello");

		editor.destroy();
	});

	it("delete-table-cell-text removes text from a specific cell", () => {
		const editor = createEditor();

		editor.apply([
			{
				type: "insert-block",
				blockId: "t1",
				blockType: "table",
				props: {},
				position: "last",
			},
			{
				type: "insert-table-cell-text",
				blockId: "t1",
				row: 0,
				col: 0,
				offset: 0,
				text: "Hello",
			},
			{
				type: "delete-table-cell-text",
				blockId: "t1",
				row: 0,
				col: 0,
				offset: 1,
				length: 3,
			},
		]);

		const cell = editor.getBlock("t1")!.tableCell(0, 0)!;
		expect(cell.textContent()).toBe("Ho");

		editor.destroy();
	});

	it("format-table-cell-text applies formatting to cell text", () => {
		const editor = createEditor();

		editor.apply([
			{
				type: "insert-block",
				blockId: "t1",
				blockType: "table",
				props: {},
				position: "last",
			},
			{
				type: "insert-table-cell-text",
				blockId: "t1",
				row: 0,
				col: 0,
				offset: 0,
				text: "bold text",
			},
			{
				type: "format-table-cell-text",
				blockId: "t1",
				row: 0,
				col: 0,
				offset: 0,
				length: 4,
				marks: { bold: true },
			},
		]);

		const cell = editor.getBlock("t1")!.tableCell(0, 0)!;
		const deltas = cell.textDeltas();
		expect(deltas[0].insert).toBe("bold");
		expect(deltas[0].attributes).toEqual({ bold: true });
		expect(deltas[1].insert).toBe(" text");

		editor.destroy();
	});

	it("convert-block to table seeds tableContent", () => {
		const editor = createEditor();

		editor.apply([
			{
				type: "insert-block",
				blockId: "b1",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
		]);

		editor.apply([
			{
				type: "convert-block",
				blockId: "b1",
				newType: "table",
				newProps: {},
			},
		]);

		const block = editor.getBlock("b1")!;
		expect(block.type).toBe("table");
		expect(block.tableRowCount()).toBe(2);
		expect(block.tableColumnCount()).toBe(2);

		editor.destroy();
	});

});
