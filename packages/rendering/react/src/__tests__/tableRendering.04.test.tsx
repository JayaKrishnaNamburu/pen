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
	it("keeps the first cmd+a cell-local before promoting to the document in flow documents", async () => {
		const editor = createEditor({
			documentProfile: "flow",
		});
		const paragraphId = crypto.randomUUID();

		editor.apply([
			{
				type: "insert-block",
				blockId: "t8-cell",
				blockType: "table",
				props: {},
				position: "last",
			},
			{
				type: "insert-table-cell-text",
				blockId: "t8-cell",
				row: 0,
				col: 0,
				offset: 0,
				text: "Alpha",
			},
			{
				type: "insert-table-cell-text",
				blockId: "t8-cell",
				row: 0,
				col: 1,
				offset: 0,
				text: "Bravo",
			},
			{
				type: "insert-block",
				blockId: paragraphId,
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{
				type: "insert-text",
				blockId: paragraphId,
				offset: 0,
				text: "After",
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

		const fieldEditor = getFieldEditor(editor);
		const secondCellSurface = container.querySelector(
			`[data-block-id="t8-cell"] [data-cell-row="0"][data-cell-col="1"] [data-pen-field-editor-surface]`,
		) as HTMLElement | null;
		expect(secondCellSurface).not.toBeNull();

		await act(async () => {
			editor.selectCell("t8-cell", 0, 1);
			fieldEditor.activateCellFromElement?.("t8-cell", 0, 1, secondCellSurface!);
			await flushAnimationFrames(2);
		});

		await act(async () => {
			document.dispatchEvent(createSelectAllEvent());
			await flushAnimationFrames(2);
		});

		expect(document.getSelection()?.toString()).toBe("Bravo");
		expect(editor.selection).toMatchObject({
			type: "cell",
			blockId: "t8-cell",
			anchor: { row: 0, col: 1 },
			head: { row: 0, col: 1 },
		});

		await act(async () => {
			document.dispatchEvent(createSelectAllEvent());
			await flushAnimationFrames(2);
		});

		expect(editor.selection).toMatchObject({
			type: "text",
			focus: { blockId: paragraphId, offset: 5 },
			isMultiBlock: true,
		});
		expect(
			editor.selection?.type === "text" ? editor.selection.blockRange : [],
		).toEqual(expect.arrayContaining(["t8-cell", paragraphId]));

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

	it("creates a canonical cross-block selection when dragging from a table into text in flow documents", async () => {
		const editor = createEditor({
			documentProfile: "flow",
		});
		const paragraphId = crypto.randomUUID();

		editor.apply([
			{
				type: "insert-block",
				blockId: "t9",
				blockType: "table",
				props: {},
				position: "last",
			},
			{
				type: "insert-block",
				blockId: paragraphId,
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{
				type: "insert-text",
				blockId: paragraphId,
				offset: 0,
				text: "After",
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

		const firstCell = container.querySelector(
			`[data-block-id="t9"] [data-pen-table-cell][data-cell-row="0"][data-cell-col="0"]`,
		) as HTMLElement | null;
		const paragraphInline = container.querySelector(
			`[data-block-id="${paragraphId}"] [data-pen-inline-content]`,
		) as HTMLElement | null;
		expect(firstCell).not.toBeNull();
		expect(paragraphInline).not.toBeNull();

		const docWithCaretRange = document as Document & {
			caretRangeFromPoint?: (x: number, y: number) => Range | null;
		};
		const originalCaretRangeFromPoint = docWithCaretRange.caretRangeFromPoint;
		docWithCaretRange.caretRangeFromPoint = () => {
			const range = document.createRange();
			range.setStart(paragraphInline!.firstChild ?? paragraphInline!, 2);
			range.setEnd(paragraphInline!.firstChild ?? paragraphInline!, 2);
			return range;
		};

		await act(async () => {
			firstCell?.dispatchEvent(
				createMouseEvent("mousedown", {
					detail: 1,
					clientX: 10,
					clientY: 10,
				}),
			);
			paragraphInline?.dispatchEvent(
				createMouseEvent("mouseup", {
					detail: 1,
					clientX: 60,
					clientY: 40,
				}),
			);
			await flushAnimationFrames(2);
		});

		expect(editor.selection).toMatchObject({
			type: "text",
			isMultiBlock: true,
			anchor: { blockId: "t9", offset: 0 },
			focus: { blockId: paragraphId, offset: 2 },
		});

		docWithCaretRange.caretRangeFromPoint = originalCaretRangeFromPoint;

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

	it("falls back to block selection when dragging from a table into text in structured documents", async () => {
		const editor = createEditor();
		const paragraphId = crypto.randomUUID();

		editor.apply([
			{
				type: "insert-block",
				blockId: "t9-structured",
				blockType: "table",
				props: {},
				position: "last",
			},
			{
				type: "insert-block",
				blockId: paragraphId,
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{
				type: "insert-text",
				blockId: paragraphId,
				offset: 0,
				text: "After",
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

		const tableCell = container.querySelector(
			`[data-block-id="t9-structured"] [data-pen-table-cell][data-cell-row="0"][data-cell-col="0"]`,
		) as HTMLElement | null;
		const paragraphInline = container.querySelector(
			`[data-block-id="${paragraphId}"] [data-pen-inline-content]`,
		) as HTMLElement | null;
		expect(tableCell).not.toBeNull();
		expect(paragraphInline).not.toBeNull();

		const docWithCaretRange = document as Document & {
			caretRangeFromPoint?: (x: number, y: number) => Range | null;
		};
		const originalCaretRangeFromPoint = docWithCaretRange.caretRangeFromPoint;
		docWithCaretRange.caretRangeFromPoint = () => {
			const range = document.createRange();
			range.setStart(paragraphInline!.firstChild ?? paragraphInline!, 2);
			range.setEnd(paragraphInline!.firstChild ?? paragraphInline!, 2);
			return range;
		};

		await act(async () => {
			tableCell?.dispatchEvent(
				createMouseEvent("mousedown", {
					detail: 1,
					clientX: 10,
					clientY: 10,
				}),
			);
			paragraphInline?.dispatchEvent(
				createMouseEvent("mouseup", {
					detail: 1,
					clientX: 60,
					clientY: 40,
				}),
			);
			await flushAnimationFrames(2);
		});

		expect(editor.selection).toEqual({
			type: "block",
			blockIds: ["t9-structured", paragraphId],
		});

		docWithCaretRange.caretRangeFromPoint = originalCaretRangeFromPoint;

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});


});
