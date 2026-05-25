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
	it("does not route printable keys through cell-selection shortcuts while editing a cell", async () => {
		const editor = createEditor();

		editor.apply([
			{
				type: "insert-block",
				blockId: "t5",
				blockType: "table",
				props: {},
				position: "last",
			},
			{
				type: "insert-table-cell-text",
				blockId: "t5",
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

		const fieldEditor = getFieldEditor(editor);
		const cellSurface = container.querySelector(
			`[data-block-id="t5"] [data-cell-row="0"][data-cell-col="0"] [data-pen-field-editor-surface]`,
		) as HTMLElement | null;

		expect(cellSurface).not.toBeNull();

		await act(async () => {
			editor.selectCell("t5", 0, 0);
			fieldEditor.activateCellFromElement?.("t5", 0, 0, cellSurface!);
			await flushAnimationFrames(2);
		});

		const event = new KeyboardEvent("keydown", {
			key: "b",
			bubbles: true,
			cancelable: true,
		});

		await act(async () => {
			cellSurface?.dispatchEvent(event);
		});

		expect(event.defaultPrevented).toBe(false);

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

	it("promotes a repeated click on the same cell to block selection", async () => {
		const editor = createEditor();

		editor.apply([
			{
				type: "insert-block",
				blockId: "t6",
				blockType: "table",
				props: {},
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

		const firstCell = container.querySelector(
			`[data-block-id="t6"] [data-pen-table-cell][data-cell-row="0"][data-cell-col="0"]`,
		) as HTMLElement | null;
		expect(firstCell).not.toBeNull();

		await act(async () => {
			firstCell?.dispatchEvent(createMouseEvent("mousedown", { detail: 1 }));
			firstCell?.dispatchEvent(createMouseEvent("mouseup", { detail: 1 }));
			await flushAnimationFrames(2);
		});

		expect(editor.selection).toMatchObject({
			type: "cell",
			blockId: "t6",
			anchor: { row: 0, col: 0 },
			head: { row: 0, col: 0 },
		});

		await act(async () => {
			firstCell?.dispatchEvent(createMouseEvent("mousedown", { detail: 1 }));
			firstCell?.dispatchEvent(createMouseEvent("mouseup", { detail: 1 }));
			await flushAnimationFrames(2);
		});

		expect(editor.selection).toEqual({
			type: "block",
			blockIds: ["t6"],
		});

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

	it("promotes backspace at the start of the next block to table block selection", async () => {
		const editor = createEditor();
		const paragraphId = crypto.randomUUID();

		editor.apply([
			{
				type: "insert-block",
				blockId: "t7",
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

		const fieldEditor = getFieldEditor(editor);
		const paragraphInline = container.querySelector(
			`[data-block-id="${paragraphId}"] [data-pen-inline-content]`,
		) as HTMLElement | null;
		expect(paragraphInline).not.toBeNull();

		await act(async () => {
			fieldEditor.activateTextSelection(paragraphId, 0, 0);
			await flushAnimationFrames(2);
		});

		await act(async () => {
			paragraphInline?.dispatchEvent(createKeyEvent("Backspace"));
			await flushAnimationFrames(2);
		});

		expect(editor.selection).toEqual({
			type: "block",
			blockIds: ["t7"],
		});

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

	it("promotes beforeinput backspace into a selected table that can be deleted", async () => {
		const editor = createEditor();
		const paragraphId = crypto.randomUUID();

		editor.apply([
			{
				type: "insert-block",
				blockId: "t7-beforeinput",
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

		const fieldEditor = getFieldEditor(editor);
		const paragraphInline = container.querySelector(
			`[data-block-id="${paragraphId}"] [data-pen-inline-content]`,
		) as HTMLElement | null;
		const tableBlock = container.querySelector(
			`[data-block-id="t7-beforeinput"]`,
		) as HTMLElement | null;

		expect(paragraphInline).not.toBeNull();
		expect(tableBlock).not.toBeNull();

		await act(async () => {
			fieldEditor.activateTextSelection(paragraphId, 0, 0);
			await flushAnimationFrames(2);
		});

		await act(async () => {
			paragraphInline?.dispatchEvent(
				new InputEvent("beforeinput", {
					bubbles: true,
					cancelable: true,
					inputType: "deleteContentBackward",
				}),
			);
			await flushAnimationFrames(2);
		});

		expect(editor.selection).toEqual({
			type: "block",
			blockIds: ["t7-beforeinput"],
		});
		expect(tableBlock?.getAttribute("data-selected")).toBe("true");
		expect(
			tableBlock?.querySelector("[data-pen-table-frame]")?.getAttribute("data-selected"),
		).toBe("true");

		await act(async () => {
			document.dispatchEvent(createKeyEvent("Backspace"));
			await flushAnimationFrames(2);
		});

		expect(editor.getBlock("t7-beforeinput")).toBeNull();
		expect(editor.getBlock(paragraphId)).not.toBeNull();

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});


});
