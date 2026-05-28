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
	it("promotes beforeinput backspace into a selected database that can be deleted", async () => {
		const editor = createEditor({
		});
		const paragraphId = crypto.randomUUID();

		editor.apply([
			{
				type: "insert-block",
				blockId: "db-backspace",
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
		const fieldEditor = getAttachedFieldEditor(editor);
		const paragraphInline = container.querySelector(
			`[data-block-id="${paragraphId}"] [data-pen-inline-content]`,
		) as HTMLElement | null;
		const databaseBlock = container.querySelector(
			`[data-block-id="db-backspace"]`,
		) as HTMLElement | null;

		expect(fieldEditor).not.toBeNull();
		expect(paragraphInline).not.toBeNull();
		expect(databaseBlock).not.toBeNull();

		await act(async () => {
			fieldEditor?.activateTextSelection?.(paragraphId, 0, 0);
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
			blockIds: ["db-backspace"],
		});
		expect(databaseBlock?.getAttribute("data-selected")).toBe("true");
		expect(
			databaseBlock
				?.querySelector("[data-pen-table-frame]")
				?.getAttribute("data-selected"),
		).toBe("true");

		await act(async () => {
			document.dispatchEvent(createKeyEvent("Backspace"));
			await flushAnimationFrames(2);
		});

		expect(editor.getBlock("db-backspace")).toBeNull();
		expect(editor.getBlock(paragraphId)).not.toBeNull();

		await unmountDatabase(root, container, editor);
	});

	it("supports multi-sort via shift-click on column headers", async () => {
		const editor = createEditor({
		});
		seedDatabase(
			editor,
			"db-sort",
			[
				{ id: "name", title: "Name", type: "text", width: 140 },
				{ id: "tags", title: "Priority", type: "number", width: 120 },
			],
			[["A", "2"], ["B", "1"]],
		);
		const { container, root } = await renderDatabase(editor);

		const nameHeader = container.querySelector(
			`[data-block-id="db-sort"] [data-cell-row="0"][data-cell-col="0"]`,
		) as HTMLElement | null;
		const priorityHeader = container.querySelector(
			`[data-block-id="db-sort"] [data-cell-row="0"][data-cell-col="1"]`,
		) as HTMLElement | null;
		expect(nameHeader).not.toBeNull();
		expect(priorityHeader).not.toBeNull();

		await act(async () => {
			nameHeader?.dispatchEvent(createMouseEvent("click"));
			await flushAnimationFrames(1);
		});
		expect(editor.getBlock("db-sort")?.databaseActiveView()?.sort).toEqual([
			{ columnId: "name", direction: "asc" },
		]);

		await act(async () => {
			priorityHeader?.dispatchEvent(createMouseEvent("click", { shiftKey: true }));
			await flushAnimationFrames(1);
		});
		expect(editor.getBlock("db-sort")?.databaseActiveView()?.sort).toEqual([
			{ columnId: "name", direction: "asc" },
			{ columnId: "tags", direction: "asc" },
		]);

		await act(async () => {
			nameHeader?.dispatchEvent(createMouseEvent("click", { shiftKey: true }));
			await flushAnimationFrames(1);
		});
		expect(editor.getBlock("db-sort")?.databaseActiveView()?.sort).toEqual([
			{ columnId: "name", direction: "desc" },
			{ columnId: "tags", direction: "asc" },
		]);

		await act(async () => {
			nameHeader?.dispatchEvent(createMouseEvent("click", { shiftKey: true }));
			await flushAnimationFrames(1);
		});
		expect(editor.getBlock("db-sort")?.databaseActiveView()?.sort).toEqual([
			{ columnId: "tags", direction: "asc" },
		]);

		await unmountDatabase(root, container, editor);
	});

	it("keeps column header controls out of editor selection gestures", async () => {
		const editor = createEditor({
		});
		seedDatabase(
			editor,
			"db-header-controls",
			[
				{ id: "name", title: "Name", type: "text", width: 140 },
				{ id: "tags", title: "Priority", type: "number", width: 120 },
			],
			[["A", "2"], ["B", "1"]],
		);
		const { container, root } = await renderDatabase(editor);

		const nameHeader = container.querySelector(
			`[data-block-id="db-header-controls"] [data-cell-row="0"][data-cell-col="0"]`,
		) as HTMLElement | null;
		const menuButton = container.querySelector(
			`[data-block-id="db-header-controls"] .pen-db-col-menu-btn`,
		) as HTMLButtonElement | null;
		expect(nameHeader).not.toBeNull();
		expect(menuButton).not.toBeNull();
		expect(editor.selection).toBeNull();

		await act(async () => {
			nameHeader?.dispatchEvent(createMouseEvent("mousedown"));
			nameHeader?.dispatchEvent(createMouseEvent("mouseup"));
			nameHeader?.dispatchEvent(createMouseEvent("click"));
			await flushAnimationFrames(1);
		});

		expect(editor.getBlock("db-header-controls")?.databaseActiveView()?.sort).toEqual([
			{ columnId: "name", direction: "asc" },
		]);
		expect(editor.selection).toBeNull();

		await act(async () => {
			menuButton?.dispatchEvent(createMouseEvent("mousedown"));
			menuButton?.dispatchEvent(createMouseEvent("mouseup"));
			menuButton?.dispatchEvent(createMouseEvent("click"));
			await flushAnimationFrames(1);
		});

		const renameInput = container.querySelector(
			`[data-block-id="db-header-controls"] .pen-db-col-rename-input`,
		) as HTMLInputElement | null;
		expect(renameInput).not.toBeNull();

		await act(async () => {
			renameInput?.dispatchEvent(createMouseEvent("mousedown"));
			renameInput?.dispatchEvent(createMouseEvent("mouseup"));
			renameInput?.dispatchEvent(createMouseEvent("click"));
			await flushAnimationFrames(1);
		});

		expect(editor.selection).toBeNull();

		await unmountDatabase(root, container, editor);
	});

	it("applies sticky left and right pin styles to pinned columns", async () => {
		const editor = createEditor({
		});
		seedDatabase(
			editor,
			"db-pins",
			[
				{ id: "name", title: "Name", type: "text", width: 120, pinned: "left" },
				{ id: "tags", title: "Status", type: "text", width: 120 },
				{ id: "status", title: "Due", type: "text", width: 140, pinned: "right" },
			],
			[["A", "Open", "Soon"]],
		);
		const { container, root } = await renderDatabase(editor);

		const leftHeader = container.querySelector(
			`[data-block-id="db-pins"] th[data-cell-col="0"]`,
		) as HTMLTableCellElement | null;
		const rightHeader = container.querySelector(
			`[data-block-id="db-pins"] th[data-cell-col="2"]`,
		) as HTMLTableCellElement | null;
		const leftCell = container.querySelector(
			`[data-block-id="db-pins"] td[data-cell-row="0"][data-cell-col="0"]`,
		) as HTMLTableCellElement | null;
		const rightCell = container.querySelector(
			`[data-block-id="db-pins"] td[data-cell-row="0"][data-cell-col="2"]`,
		) as HTMLTableCellElement | null;

		expect(leftHeader?.style.position).toBe("sticky");
		expect(leftHeader?.style.left).toBe("44px");
		expect(rightHeader?.style.position).toBe("sticky");
		expect(rightHeader?.style.right).toBe("0px");
		expect(leftCell?.style.left).toBe("44px");
		expect(rightCell?.style.right).toBe("0px");

		await unmountDatabase(root, container, editor);
	});

});
