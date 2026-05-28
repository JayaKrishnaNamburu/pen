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
	it("maps cmd+a from a selected table directly to full-document selection in flow documents", async () => {
		const editor = createEditor({
			documentProfile: "flow",
		});
		const paragraphId = crypto.randomUUID();

		editor.apply([
			{
				type: "insert-block",
				blockId: "t8",
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

		const tableBlock = container.querySelector(
			`[data-block-id="t8"]`,
		) as HTMLElement | null;
		expect(tableBlock).not.toBeNull();

		await act(async () => {
			editor.selectBlock("t8");
			tableBlock?.focus();
		});

		await act(async () => {
			document.dispatchEvent(createSelectAllEvent());
			await flushAnimationFrames(2);
		});

		expect(editor.selection).toMatchObject({
			type: "text",
			isMultiBlock: true,
		});
		expect(
			editor.selection?.type === "text" ? editor.selection.blockRange : [],
		).toEqual(expect.arrayContaining(["t8", paragraphId]));
		expect(
			[
				JSON.stringify(editor.selection?.type === "text" ? editor.selection.anchor : null),
				JSON.stringify(editor.selection?.type === "text" ? editor.selection.focus : null),
			],
		).toContain(JSON.stringify({ blockId: paragraphId, offset: 5 }));

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

	it("keeps block-first cmd+a copy scoped to the selected table when block-first interaction is enabled", async () => {
		const editor = createEditor();
		const paragraphId = crypto.randomUUID();
		const clipboardData = createClipboardData();

		editor.apply([
			{
				type: "insert-block",
				blockId: "t8-copy-structured",
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
				<Pen.Editor.Root editor={editor} interactionModel="block-first">
					<Pen.Editor.Content />
				</Pen.Editor.Root>,
			);
		});

		const tableBlock = container.querySelector(
			`[data-block-id="t8-copy-structured"]`,
		) as HTMLElement | null;
		expect(tableBlock).not.toBeNull();

		await act(async () => {
			editor.selectBlock("t8-copy-structured");
			tableBlock?.focus();
		});

		await act(async () => {
			document.dispatchEvent(createSelectAllEvent());
			await flushAnimationFrames(2);
		});

		expect(editor.selection).toEqual({
			type: "block",
			blockIds: ["t8-copy-structured"],
		});

		handleCopy(editor, { clipboardData } as ClipboardEvent);

		const penBlocks = JSON.parse(
			clipboardData.getData("application/x-pen-blocks"),
		) as Array<{ type: string }>;

		expect(penBlocks.map((block) => block.type)).toEqual(["table"]);
		expect(clipboardData.getData("text/plain")).not.toContain("After");

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

	it("promotes cmd+a copy from a selected table to the full document in flow documents", async () => {
		const editor = createEditor({
			documentProfile: "flow",
		});
		const paragraphId = crypto.randomUUID();
		const clipboardData = createClipboardData();

		editor.apply([
			{
				type: "insert-block",
				blockId: "t8-copy-flow",
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

		const tableBlock = container.querySelector(
			`[data-block-id="t8-copy-flow"]`,
		) as HTMLElement | null;
		expect(tableBlock).not.toBeNull();

		await act(async () => {
			editor.selectBlock("t8-copy-flow");
			tableBlock?.focus();
		});

		await act(async () => {
			document.dispatchEvent(createSelectAllEvent());
			await flushAnimationFrames(2);
		});

		expect(editor.selection).toMatchObject({
			type: "text",
			isMultiBlock: true,
		});

		handleCopy(editor, { clipboardData } as ClipboardEvent);

		const penBlocks = JSON.parse(
			clipboardData.getData("application/x-pen-blocks"),
		) as Array<{ type: string }>;

		expect(penBlocks.map((block) => block.type)).toEqual([
			"paragraph",
			"table",
			"paragraph",
		]);
		expect(clipboardData.getData("text/plain")).toContain("After");

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

	it("pressing enter on a block-selected table inserts a paragraph after it", async () => {
		const editor = createEditor();

		editor.apply([
			{
				type: "insert-block",
				blockId: "t-enter",
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

		const tableBlock = container.querySelector(
			`[data-block-id="t-enter"]`,
		) as HTMLElement | null;
		expect(tableBlock).not.toBeNull();

		await act(async () => {
			editor.selectBlock("t-enter");
			tableBlock?.focus();
			document.dispatchEvent(createKeyEvent("Enter"));
			await flushAnimationFrames(2);
		});

		const paragraphAfterTable = editor.lastBlock();
		expect(paragraphAfterTable?.type).toBe("paragraph");
		expect(paragraphAfterTable?.id).not.toBe("t-enter");

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});


});
