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
	it("creates a canonical cross-block selection when shift-clicking from a table into text in flow documents", async () => {
		const editor = createEditor({
			documentProfile: "flow",
		});
		const paragraphId = crypto.randomUUID();

		editor.apply([
			{
				type: "insert-block",
				blockId: "t10-shift-flow",
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
			`[data-block-id="t10-shift-flow"]`,
		) as HTMLElement | null;
		const paragraphInline = container.querySelector(
			`[data-block-id="${paragraphId}"] [data-pen-inline-content]`,
		) as HTMLElement | null;
		expect(tableBlock).not.toBeNull();
		expect(paragraphInline).not.toBeNull();

		await act(async () => {
			editor.selectBlock("t10-shift-flow");
			tableBlock?.focus();
			paragraphInline?.dispatchEvent(
				createMouseEvent("click", {
					detail: 1,
					shiftKey: true,
				}),
			);
			await flushAnimationFrames(2);
		});

		expect(editor.selection).toMatchObject({
			type: "text",
			isMultiBlock: true,
			anchor: { blockId: "t10-shift-flow", offset: 0 },
			focus: { blockId: paragraphId, offset: 5 },
		});

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

	it("falls back to block selection when shift-clicking from a table into text in structured documents", async () => {
		const editor = createEditor();
		const paragraphId = crypto.randomUUID();

		editor.apply([
			{
				type: "insert-block",
				blockId: "t10-shift-structured",
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
			`[data-block-id="t10-shift-structured"]`,
		) as HTMLElement | null;
		const paragraphInline = container.querySelector(
			`[data-block-id="${paragraphId}"] [data-pen-inline-content]`,
		) as HTMLElement | null;
		expect(tableBlock).not.toBeNull();
		expect(paragraphInline).not.toBeNull();

		await act(async () => {
			editor.selectBlock("t10-shift-structured");
			tableBlock?.focus();
			paragraphInline?.dispatchEvent(
				createMouseEvent("click", {
					detail: 1,
					shiftKey: true,
				}),
			);
			await flushAnimationFrames(2);
		});

		expect(editor.selection).toEqual({
			type: "block",
			blockIds: ["t10-shift-structured", paragraphId],
		});

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

});
