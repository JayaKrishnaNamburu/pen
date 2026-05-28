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
	it("promotes a repeated click on the same database cell to block selection", async () => {
		const editor = createEditor({
		});

		seedDatabase(
			editor,
			"db1",
			[{ id: "name", title: "Name", type: "text", width: 140 }],
			[["Alpha"]],
		);

		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		await act(async () => {
			root.render(
				<Pen.Editor.Root
					editor={editor}
					renderers={{ database: DatabaseRenderer }}
				>
					<Pen.Editor.Content />
				</Pen.Editor.Root>,
			);
		});

		const firstCell = container.querySelector(
			`[data-block-id="db1"] tbody [data-pen-table-cell][data-cell-row="0"][data-cell-col="0"]`,
		) as HTMLElement | null;
		expect(firstCell).not.toBeNull();

		await act(async () => {
			firstCell?.dispatchEvent(createMouseEvent("mousedown", { detail: 1 }));
			firstCell?.dispatchEvent(createMouseEvent("mouseup", { detail: 1 }));
			await flushAnimationFrames(2);
		});

		expect(editor.selection).toMatchObject({
			type: "cell",
			blockId: "db1",
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
			blockIds: ["db1"],
		});

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

	it("keeps column widths stable when adding a new column", async () => {
		const editor = createEditor({
		});

		editor.apply([
			{
				type: "insert-block",
				blockId: "db-widths",
				blockType: "database",
				props: {},
				position: "last",
			},
			{
				type: "database-insert-row",
				blockId: "db-widths",
				rowId: "row-1",
				values: {
					name: "Task",
				},
			},
		]);

		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		await act(async () => {
			root.render(
				<Pen.Editor.Root
					editor={editor}
					renderers={{ database: DatabaseRenderer }}
				>
					<Pen.Editor.Content />
				</Pen.Editor.Root>,
			);
		});

		const addColumnButton = container.querySelector(
			".pen-table-add-column-control",
		) as HTMLButtonElement | null;
		expect(addColumnButton).not.toBeNull();

		await act(async () => {
			addColumnButton?.dispatchEvent(createMouseEvent("click"));
			await flushAnimationFrames(2);
		});

		const block = editor.getBlock("db-widths");
		expect(block?.tableColumns()).toHaveLength(4);

		const headerCells = container.querySelectorAll(
			`[data-block-id="db-widths"] thead th[data-pen-table-cell]`,
		);
		expect(headerCells).toHaveLength(4);
		expect(headerCells[3]?.textContent).toContain("New column");

		const bodyCells = container.querySelectorAll(
			`[data-block-id="db-widths"] tbody tr[data-row="0"] td[data-pen-table-cell]`,
		);
		expect(bodyCells).toHaveLength(4);

		const table = container.querySelector(
			`[data-block-id="db-widths"] table[data-pen-table]`,
		) as HTMLTableElement | null;
		expect(table).not.toBeNull();
		expect(table?.style.tableLayout).toBe("fixed");
		expect(table?.style.width).toBe("max-content");

		const addRowButton = container.querySelector(
			`[data-block-id="db-widths"] .pen-table-add-row-control`,
		) as HTMLButtonElement | null;
		expect(addRowButton).not.toBeNull();

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

	it("keeps local database chrome editable for hybrid provider-backed views", async () => {
		const editor = createEditor({
		});
		const fetch = vi.fn().mockResolvedValue({
			rows: [{ id: "remote-1", crdtRowIndex: 0, cells: { name: "Remote row" } }],
			totalRows: 1,
			pageIndex: 0,
			pageSize: 50,
		});

		editor.internals.setSlot("database:data-provider", {
			fetch,
		});
		editor.apply([
			{
				type: "insert-block",
				blockId: "db-hybrid",
				blockType: "database",
				props: { dataSource: "hybrid" },
				position: "last",
			},
		]);

		const { container, root } = await renderDatabase(editor);
		await flushAnimationFrames(2);

		expect(fetch).toHaveBeenCalled();
		expect(container.querySelector(`[data-block-id="db-hybrid"] .pen-db-toolbar`)).not.toBeNull();
		expect(container.querySelector(`[data-block-id="db-hybrid"] .pen-table-add-column-control`)).not.toBeNull();
		expect(container.querySelector(`[data-block-id="db-hybrid"] .pen-table-add-row-control`)).toBeNull();
		expect(container.querySelector(`[data-block-id="db-hybrid"] .pen-db-add-view-btn`)).not.toBeNull();
		expect(container.textContent).toContain("Remote row");

		await unmountDatabase(root, container, editor);
	});

	it("does not move the grid selection while a widget trigger has focus", async () => {
		const editor = createEditor({
		});

		seedDatabase(
			editor,
			"db-widget-nav",
			[
				{
					id: "status",
					title: "Status",
					type: "select",
					options: [
						{ id: "todo", value: "Todo" },
						{ id: "done", value: "Done" },
					],
				},
			],
			[["todo"], ["done"]],
		);
		editor.selectCell("db-widget-nav", 0, 0);

		const { container, root } = await renderDatabase(editor);
		await flushAnimationFrames(2);

		const trigger = container.querySelector(
			`[data-block-id="db-widget-nav"] .pen-db-select-trigger`,
		) as HTMLElement | null;
		expect(trigger).not.toBeNull();

		await act(async () => {
			trigger?.focus();
			trigger?.dispatchEvent(createMouseEvent("click"));
			await flushAnimationFrames(1);
		});

		expect(container.querySelector(`[data-block-id="db-widget-nav"] .pen-db-select-dropdown`)).not.toBeNull();

		await act(async () => {
			trigger?.dispatchEvent(createKeyEvent("ArrowDown"));
			await flushAnimationFrames(1);
		});

		expect(editor.selection).toMatchObject({
			type: "cell",
			blockId: "db-widget-nav",
			anchor: { row: 0, col: 0 },
			head: { row: 0, col: 0 },
		});

		await unmountDatabase(root, container, editor);
	});

});
