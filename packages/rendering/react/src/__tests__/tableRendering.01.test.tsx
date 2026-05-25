// @vitest-environment jsdom

import React, { act } from "react";
import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { createEditor as createCoreEditor } from "@pen/core";
import { defaultPreset } from "@pen/preset-default";
import type { FieldEditorImpl } from "../field-editor/fieldEditorImpl";
import { handleCopy } from "../field-editor/clipboard";
import { FIELD_EDITOR_SLOT_KEY } from "../constants/fieldEditor";
import { Pen } from "../primitives/index";

type TableRowLike = {
	get(field: "cells"): { delete(index: number, length: number): void };
};

type TableContentLike = {
	get(index: number): TableRowLike;
};

type TableBlockMapLike = {
	get(field: "tableContent"): TableContentLike;
};

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function createEditor(
	options: Parameters<typeof createCoreEditor>[0] = {},
) {
	const { without: _without, ...restOptions } = options;
	return createCoreEditor({
		...restOptions,
		preset: defaultPreset({
			documentOps: false,
			deltaStream: false,
			undo: false,
		}),
	});
}

async function flushAnimationFrames(count = 1): Promise<void> {
	for (let i = 0; i < count; i++) {
		await new Promise<void>((resolve) => {
			requestAnimationFrame(() => resolve());
		});
	}
}

function createKeyEvent(
	key: string,
	options: KeyboardEventInit = {},
): KeyboardEvent {
	return new KeyboardEvent("keydown", {
		key,
		bubbles: true,
		cancelable: true,
		...options,
	});
}

function createSelectAllEvent(): KeyboardEvent {
	return createKeyEvent("a", {
		metaKey: true,
	});
}

function createClipboardData(): DataTransfer {
	const data = new Map<string, string>();

	return {
		files: [] as unknown as FileList,
		types: [],
		getData(type: string) {
			return data.get(type) ?? "";
		},
		setData(type: string, value: string) {
			data.set(type, value);
		},
	} as unknown as DataTransfer;
}

function createMouseEvent(
	type: string,
	options: MouseEventInit = {},
): MouseEvent {
	return new MouseEvent(type, {
		bubbles: true,
		cancelable: true,
		clientX: 20,
		clientY: 20,
		...options,
	});
}

function getFieldEditor(
	editor: ReturnType<typeof createEditor>,
): FieldEditorImpl {
	const fieldEditor = editor.internals.getSlot<FieldEditorImpl>(
		FIELD_EDITOR_SLOT_KEY,
	);
	if (!fieldEditor) {
		throw new Error("Missing attached field editor");
	}
	return fieldEditor;
}

describe("@pen/react table rendering", () => {
	it("renders a table block with cells from the canonical model", async () => {
		const editor = createEditor();

		editor.apply([
			{
				type: "insert-block",
				blockId: "t1",
				blockType: "table",
				props: { hasHeaderRow: true },
				position: "last",
			},
			{
				type: "insert-table-cell-text",
				blockId: "t1",
				row: 0,
				col: 0,
				offset: 0,
				text: "Alice",
			},
			{
				type: "insert-table-cell-text",
				blockId: "t1",
				row: 0,
				col: 1,
				offset: 0,
				text: "30",
			},
			{
				type: "insert-table-cell-text",
				blockId: "t1",
				row: 1,
				col: 0,
				offset: 0,
				text: "Bob",
			},
			{
				type: "insert-table-cell-text",
				blockId: "t1",
				row: 1,
				col: 1,
				offset: 0,
				text: "25",
			},
		]);

		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		await act(async () => {
			root.render(
				<Pen.Editor.Root editor={editor}>
					<Pen.Editor.Content />
				</Pen.Editor.Root>,
			);
		});

		const table = container.querySelector("table");
		expect(table).not.toBeNull();

		const thead = table!.querySelector("thead");
		expect(thead).not.toBeNull();

		const tbody = table!.querySelector("tbody");
		expect(tbody).not.toBeNull();

		const headerCells = thead!.querySelectorAll("th");
		expect(headerCells.length).toBeGreaterThanOrEqual(2);

		const bodyCells = tbody!.querySelectorAll("td[data-pen-table-cell]");
		expect(bodyCells.length).toBe(2);

		expect(bodyCells[0].getAttribute("data-cell-row")).toBe("1");
		expect(bodyCells[0].getAttribute("data-cell-col")).toBe("0");

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

	it("renders cell text content through TableCellContent", async () => {
		const editor = createEditor();

		editor.apply([
			{
				type: "insert-block",
				blockId: "t2",
				blockType: "table",
				props: {},
				position: "last",
			},
			{
				type: "insert-table-cell-text",
				blockId: "t2",
				row: 0,
				col: 0,
				offset: 0,
				text: "Hello",
			},
		]);

		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		await act(async () => {
			root.render(
				<Pen.Editor.Root editor={editor}>
					<Pen.Editor.Content />
				</Pen.Editor.Root>,
			);
		});

		const cellInlineContent = container.querySelector(
			"[data-pen-inline-content][data-cell-row='0'][data-cell-col='0']",
		);
		expect(cellInlineContent).not.toBeNull();
		expect(
			cellInlineContent?.hasAttribute("data-pen-field-editor-surface"),
		).toBe(true);
		const text = (cellInlineContent?.textContent ?? "").replace(
			/\u200B/g,
			"",
		);
		expect(text).toBe("Hello");

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

	it("updates cell content when table ops are applied after render", async () => {
		const editor = createEditor();

		editor.apply([
			{
				type: "insert-block",
				blockId: "t3",
				blockType: "table",
				props: { hasHeaderRow: false },
				position: "last",
			},
		]);

		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		await act(async () => {
			root.render(
				<Pen.Editor.Root editor={editor}>
					<Pen.Editor.Content />
				</Pen.Editor.Root>,
			);
		});

		let bodyCells = container.querySelectorAll("tbody td[data-pen-table-cell]");
		expect(bodyCells.length).toBe(4);

		await act(async () => {
			editor.apply([
				{
					type: "insert-table-row",
					blockId: "t3",
					index: 2,
				},
			]);
		});

		bodyCells = container.querySelectorAll("tbody td[data-pen-table-cell]");
		expect(bodyCells.length).toBe(6);

		await act(async () => {
			editor.apply([
				{
					type: "insert-table-column",
					blockId: "t3",
					index: 2,
				},
			]);
		});

		bodyCells = container.querySelectorAll("tbody td[data-pen-table-cell]");
		expect(bodyCells.length).toBe(9);

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

	it("renders header row with placeholders when hasHeaderRow is set", async () => {
		const editor = createEditor();

		editor.apply([
			{
				type: "insert-block",
				blockId: "t4",
				blockType: "table",
				props: { hasHeaderRow: true },
				position: "last",
			},
		]);

		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		await act(async () => {
			root.render(
				<Pen.Editor.Root editor={editor}>
					<Pen.Editor.Content />
				</Pen.Editor.Root>,
			);
		});

		const thead = container.querySelector("thead");
		expect(thead).not.toBeNull();
		const headerCells = thead!.querySelectorAll("th");
		expect(headerCells.length).toBeGreaterThanOrEqual(2);

		expect(container.querySelector("[data-pen-table]")).not.toBeNull();
		expect(container.querySelector("[data-pen-table-frame]")).not.toBeNull();

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

	it("renders a full row grid even when a legacy row is missing trailing cells", async () => {
		const editor = createEditor();

		editor.apply([
			{
				type: "insert-block",
				blockId: "t4-short-row",
				blockType: "table",
				props: { hasHeaderRow: false },
				position: "last",
			},
			{
				type: "insert-table-column",
				blockId: "t4-short-row",
				index: 2,
			},
		]);

		const blockMap = editor.internals.doc.blocks.get(
			"t4-short-row",
		) as TableBlockMapLike;
		const tableContent = blockMap.get("tableContent");
		const firstRow = tableContent.get(0);
		firstRow.get("cells").delete(2, 1);

		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		await act(async () => {
			root.render(
				<Pen.Editor.Root editor={editor}>
					<Pen.Editor.Content />
				</Pen.Editor.Root>,
			);
		});

		const firstRowCells = container.querySelectorAll(
			`[data-block-id="t4-short-row"] tbody tr[data-row="0"] td[data-pen-table-cell]`,
		);
		expect(firstRowCells).toHaveLength(3);

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

	it("renders add row and column controls outside the table grid", async () => {
		const editor = createEditor();

		editor.apply([
			{
				type: "insert-block",
				blockId: "t4-controls",
				blockType: "table",
				props: { hasHeaderRow: true },
				position: "last",
			},
		]);

		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		await act(async () => {
			root.render(
				<Pen.Editor.Root editor={editor}>
					<Pen.Editor.Content />
				</Pen.Editor.Root>,
			);
		});

		const table = container.querySelector(
			`[data-block-id="t4-controls"] [data-pen-table]`,
		);
		const addColumnControl = container.querySelector(
			`[data-block-id="t4-controls"] button[aria-label="Add column"]`,
		);
		const addRowControl = container.querySelector(
			`[data-block-id="t4-controls"] button[aria-label="Add row"]`,
		);

		expect(table).not.toBeNull();
		expect(addColumnControl).not.toBeNull();
		expect(addRowControl).not.toBeNull();
		expect(table?.contains(addColumnControl)).toBe(false);
		expect(table?.contains(addRowControl)).toBe(false);

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});


});
