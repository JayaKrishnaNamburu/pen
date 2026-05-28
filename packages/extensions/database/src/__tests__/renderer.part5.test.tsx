// @vitest-environment jsdom

import React, { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { createEditor as createCoreEditor } from "@pen/core";
import type { DatabaseViewState, TableColumnSchema } from "@pen/types";
import { Pen, getAttachedFieldEditor, handleCopy } from "@pen/react";
import { DatabaseRenderer } from "../renderer";
import { ColumnMenu } from "../rendererPanels";
import { useDatabaseController } from "../useDatabaseController";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

function createEditor(
	options: Parameters<typeof createCoreEditor>[0] = {},
) {
	const { without: _without, ...restOptions } = options;
	return createCoreEditor({
		...restOptions,
		preset: noDefaultExtensionsPreset,
	});
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

function createSelectAllEvent(): KeyboardEvent {
	return new KeyboardEvent("keydown", {
		key: "a",
		metaKey: true,
		bubbles: true,
		cancelable: true,
	});
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

async function flushAnimationFrames(count = 1): Promise<void> {
	for (let i = 0; i < count; i++) {
		await new Promise<void>((resolve) => {
			requestAnimationFrame(() => resolve());
		});
	}
}

async function renderDatabase(
	editor: ReturnType<typeof createEditor>,
	options?: {
		children?: React.ReactNode;
		interactionModel?: "content-first" | "block-first";
	},
) {
	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);

	await act(async () => {
		root.render(
			<Pen.Editor.Root
				editor={editor}
				interactionModel={options?.interactionModel}
				renderers={{ database: DatabaseRenderer }}
			>
				<Pen.Editor.Content />
				{options?.children}
			</Pen.Editor.Root>,
		);
	});

	return { container, root };
}

async function unmountDatabase(
	root: ReturnType<typeof createRoot>,
	container: HTMLDivElement,
	editor: ReturnType<typeof createEditor>,
) {
	await act(async () => {
		root.unmount();
	});
	container.remove();
	editor.destroy();
}

function createFlowEditorFromSeededDocument(
	seed: (editor: ReturnType<typeof createEditor>) => void,
): ReturnType<typeof createEditor> {
	const bootstrapEditor = createEditor({
	});
	const document = bootstrapEditor.internals.adapter.createDocument();
	bootstrapEditor.destroy();

	const seedEditor = createEditor({
		document,
	});
	seed(seedEditor);
	seedEditor.internals.adapter.setDocumentProfile?.(document, "flow");
	seedEditor.destroy();

	return createEditor({
		document,
	});
}

function seedDatabase(
	editor: ReturnType<typeof createEditor>,
	blockId: string,
	columns: TableColumnSchema[],
	rows: Array<string[]>,
) {
	editor.apply([
		{
			type: "insert-block",
			blockId,
			blockType: "database",
			props: {},
			position: "last",
		},
	]);
	editor.apply([{
		type: "update-table-columns",
		blockId,
		columns,
	}]);
	rows.forEach((values, rowIndex) => {
		editor.apply([{
			type: "database-insert-row",
			blockId,
			index: rowIndex,
			rowId: `${blockId}-row-${rowIndex}`,
			values: Object.fromEntries(
				columns.map((column, colIndex) => [column.id, values[colIndex] ?? ""]),
			),
		}]);
	});
}

function updatePrimaryView(
	editor: ReturnType<typeof createEditor>,
	blockId: string,
	patch: Partial<Omit<DatabaseViewState, "id">>,
) {
	act(() => {
		const block = editor.getBlock(blockId);
		editor.apply([{
			type: "database-update-view",
			blockId,
			viewId: block?.databasePrimaryViewId() ?? undefined,
			patch,
		}], { origin: "user" });
	});
}

function getButtonByText(container: HTMLElement, text: string): HTMLButtonElement | null {
	const buttons = Array.from(container.querySelectorAll("button"));
	return (buttons.find((button) => button.textContent?.trim() === text) as HTMLButtonElement | undefined) ?? null;
}

describe("@pen/database renderer", () => {
	it("falls back to block selection when shift-clicking from a database into text in structured documents", async () => {
		const editor = createEditor({
		});
		const paragraphId = crypto.randomUUID();

		editor.apply([
			{
				type: "insert-block",
				blockId: "db-shift-structured",
				blockType: "database",
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

		const { container, root } = await renderDatabase(editor);
		const databaseBlock = container.querySelector(
			`[data-block-id="db-shift-structured"]`,
		) as HTMLElement | null;
		const paragraphInline = container.querySelector(
			`[data-block-id="${paragraphId}"] [data-pen-inline-content]`,
		) as HTMLElement | null;
		expect(databaseBlock).not.toBeNull();
		expect(paragraphInline).not.toBeNull();

		await act(async () => {
			editor.selectBlock("db-shift-structured");
			databaseBlock?.focus();
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
			blockIds: ["db-shift-structured", paragraphId],
		});

		await unmountDatabase(root, container, editor);
	});

	it("keeps block-first cmd+a copy scoped to the selected database when block-first interaction is enabled", async () => {
		const editor = createEditor({
		});
		const paragraphId = crypto.randomUUID();
		const clipboardData = createClipboardData();

		editor.apply([
			{
				type: "insert-block",
				blockId: "db-copy-structured",
				blockType: "database",
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

		const { container, root } = await renderDatabase(editor, {
			interactionModel: "block-first",
		});
		const databaseBlock = container.querySelector(
			`[data-block-id="db-copy-structured"]`,
		) as HTMLElement | null;
		expect(databaseBlock).not.toBeNull();

		await act(async () => {
			editor.selectBlock("db-copy-structured");
			databaseBlock?.focus();
		});

		await act(async () => {
			document.dispatchEvent(createSelectAllEvent());
			await flushAnimationFrames(2);
		});

		expect(editor.selection).toEqual({
			type: "block",
			blockIds: ["db-copy-structured"],
		});

		handleCopy(editor, { clipboardData } as ClipboardEvent);

		const penBlocks = JSON.parse(
			clipboardData.getData("application/x-pen-blocks"),
		) as Array<{ type: string }>;

		expect(penBlocks.map((block) => block.type)).toEqual(["database"]);
		expect(clipboardData.getData("text/plain")).not.toContain("After");

		await unmountDatabase(root, container, editor);
	});

	it("keeps cmd+a copy scoped to the selected database in flow documents", async () => {
		const paragraphId = crypto.randomUUID();
		const clipboardData = createClipboardData();
		const editor = createFlowEditorFromSeededDocument((seedEditor) => {
			seedEditor.apply([
				{
					type: "insert-block",
					blockId: "db-copy-flow",
					blockType: "database",
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
		});

		const { container, root } = await renderDatabase(editor);
		const databaseBlock = container.querySelector(
			`[data-block-id="db-copy-flow"]`,
		) as HTMLElement | null;
		expect(databaseBlock).not.toBeNull();

		await act(async () => {
			editor.selectBlock("db-copy-flow");
			databaseBlock?.focus();
		});

		await act(async () => {
			document.dispatchEvent(createSelectAllEvent());
			await flushAnimationFrames(2);
		});

		expect(editor.selection).toEqual({
			type: "block",
			blockIds: ["db-copy-flow"],
		});

		handleCopy(editor, { clipboardData } as ClipboardEvent);

		const penBlocks = JSON.parse(
			clipboardData.getData("application/x-pen-blocks"),
		) as Array<{ type: string }>;

		expect(penBlocks.map((block) => block.type)).toEqual(["database"]);
		expect(clipboardData.getData("text/plain")).not.toContain("After");

		await unmountDatabase(root, container, editor);
	});

});
