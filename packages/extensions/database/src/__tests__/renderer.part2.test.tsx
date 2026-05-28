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
	it("uses the block default column width for implicit and newly added columns", async () => {
		const editor = createEditor({
		});

		editor.apply([
			{
				type: "insert-block",
				blockId: "db-custom-width",
				blockType: "database",
				props: { defaultColumnWidth: 220 },
				position: "last",
			},
			{
				type: "database-insert-row",
				blockId: "db-custom-width",
				rowId: "row-1",
				values: {
					name: "Task",
				},
			},
		]);

		const { container, root } = await renderDatabase(editor);

		const headerCellsBeforeInsert = container.querySelectorAll(
			`[data-block-id="db-custom-width"] thead th[data-pen-table-cell]`,
		);
		expect((headerCellsBeforeInsert[0] as HTMLTableCellElement).style.minWidth).toBe("220px");
		expect((headerCellsBeforeInsert[0] as HTMLTableCellElement).style.maxWidth).toBe("220px");

		const addColumnButton = container.querySelector(
			".pen-table-add-column-control",
		) as HTMLButtonElement | null;
		expect(addColumnButton).not.toBeNull();

		await act(async () => {
			addColumnButton?.dispatchEvent(createMouseEvent("click"));
			await flushAnimationFrames(2);
		});

		const headerCellsAfterInsert = container.querySelectorAll(
			`[data-block-id="db-custom-width"] thead th[data-pen-table-cell]`,
		);
		expect(headerCellsAfterInsert).toHaveLength(4);
		expect((headerCellsAfterInsert[3] as HTMLTableCellElement).style.minWidth).toBe("220px");
		expect((headerCellsAfterInsert[3] as HTMLTableCellElement).style.maxWidth).toBe("220px");

		await unmountDatabase(root, container, editor);
	});

	it("deletes selected rows when delete is pressed from a row checkbox", async () => {
		const editor = createEditor({
		});
		editor.apply([
			{
				type: "insert-block",
				blockId: "db-delete-rows",
				blockType: "database",
				props: {},
				position: "last",
			},
			{
				type: "update-table-columns",
				blockId: "db-delete-rows",
				columns: [
					{ id: "name", title: "Name", type: "text" },
					{ id: "status", title: "Status", type: "checkbox" },
				],
			},
			{
				type: "database-insert-row",
				blockId: "db-delete-rows",
				rowId: "row-alpha",
				values: { name: "Alpha", status: "true" },
			},
			{
				type: "database-insert-row",
				blockId: "db-delete-rows",
				rowId: "row-beta",
				values: { name: "Beta", status: "false" },
			},
		]);

		const { container, root } = await renderDatabase(editor);
		const tableRows = Array.from(
			container.querySelectorAll(`[data-block-id="db-delete-rows"] tbody tr[data-row]`),
		) as HTMLTableRowElement[];
		const alphaRow = tableRows.find((row) => row.textContent?.includes("Alpha")) ?? null;
		const rowCheckbox = alphaRow?.querySelector(
			`input[type="checkbox"]`,
		) as HTMLInputElement | null;
		expect(alphaRow).not.toBeNull();
		expect(rowCheckbox).not.toBeNull();

		await act(async () => {
			rowCheckbox?.focus();
			rowCheckbox?.click();
			await flushAnimationFrames(2);
		});

		const liveAlphaRow = Array.from(
			container.querySelectorAll(`[data-block-id="db-delete-rows"] tbody tr[data-row]`),
		).find((row) => row.textContent?.includes("Alpha")) as HTMLTableRowElement | undefined;
		const liveRowCheckbox = liveAlphaRow?.querySelector(
			`input[type="checkbox"]`,
		) as HTMLInputElement | null;
		expect(liveRowCheckbox?.checked).toBe(true);
		const blockBeforeDelete = editor.getBlock("db-delete-rows");
		const rowCountBeforeDelete = blockBeforeDelete?.tableRowCount() ?? 0;
		expect(rowCountBeforeDelete).toBeGreaterThan(1);

		await act(async () => {
			liveRowCheckbox?.focus();
			await flushAnimationFrames(1);
		});
		expect(document.activeElement).toBe(liveRowCheckbox);

		await act(async () => {
			liveRowCheckbox?.dispatchEvent(createKeyEvent("Delete"));
			await flushAnimationFrames(2);
		});

		const block = editor.getBlock("db-delete-rows");
		expect(block?.tableRowCount()).toBe(rowCountBeforeDelete - 1);
		const renderedRowsAfterDelete = Array.from(
			container.querySelectorAll(`[data-block-id="db-delete-rows"] tbody tr[data-row]`),
		).map((row) => row.textContent ?? "");
		expect(renderedRowsAfterDelete.some((text) => text.includes("Alpha"))).toBe(false);
		expect(renderedRowsAfterDelete.some((text) => text.includes("Beta"))).toBe(true);

		await unmountDatabase(root, container, editor);
	});

	it("navigates visible sorted rows instead of storage order", async () => {
		const editor = createEditor({
		});
		seedDatabase(
			editor,
			"db-nav-visible-rows",
			[
				{ id: "name", title: "Name", type: "text" },
				{ id: "score", title: "Score", type: "number" },
				{ id: "status", title: "Status", type: "text" },
			],
			[
				["Alpha", "2", "keep"],
				["Beta", "1", "skip"],
				["Gamma", "3", "keep"],
			],
		);
		updatePrimaryView(editor, "db-nav-visible-rows", {
			sort: [{ columnId: "score", direction: "desc" }],
		});

		const { container, root } = await renderDatabase(editor);
		const databaseBlock = container.querySelector(
			`[data-block-id="db-nav-visible-rows"]`,
		) as HTMLElement | null;
		const bodyCells = Array.from(
			container.querySelectorAll(
				`[data-block-id="db-nav-visible-rows"] tbody td[data-pen-table-cell]`,
			),
		) as HTMLTableCellElement[];
		const firstBodyCell = bodyCells[0] ?? null;
		expect(firstBodyCell?.textContent).toContain("Gamma");

		await act(async () => {
			firstBodyCell?.dispatchEvent(createMouseEvent("mousedown"));
			firstBodyCell?.dispatchEvent(createMouseEvent("mouseup"));
			databaseBlock?.focus();
			await flushAnimationFrames(2);
		});

		await act(async () => {
			document.dispatchEvent(createKeyEvent("ArrowDown"));
			await flushAnimationFrames(2);
		});

		expect(editor.selection).toMatchObject({
			type: "cell",
			blockId: "db-nav-visible-rows",
			head: { row: 1, col: 0 },
			rowIds: [
				"db-nav-visible-rows-row-2",
				"db-nav-visible-rows-row-0",
				"db-nav-visible-rows-row-1",
			],
		});

		await unmountDatabase(root, container, editor);
	});

	it("skips hidden columns and respects pinned column order when tabbing", async () => {
		const editor = createEditor({
		});
		seedDatabase(
			editor,
			"db-nav-columns",
			[
				{ id: "name", title: "Name", type: "text" },
				{ id: "hidden", title: "Hidden", type: "text" },
				{ id: "pinned", title: "Pinned", type: "text", pinned: "left" },
			],
			[["Alpha", "secret", "Lead"]],
		);
		updatePrimaryView(editor, "db-nav-columns", {
			visibleColumnIds: ["name", "pinned"],
		});

		const { container, root } = await renderDatabase(editor);
		const databaseBlock = container.querySelector(
			`[data-block-id="db-nav-columns"]`,
		) as HTMLElement | null;
		const firstRowCells = Array.from(
			container.querySelectorAll(
				`[data-block-id="db-nav-columns"] tbody tr[data-row] td[data-pen-table-cell]`,
			),
		) as HTMLTableCellElement[];
		const firstVisibleCell = firstRowCells[0] ?? null;
		expect(firstVisibleCell?.textContent).toContain("Lead");

		await act(async () => {
			firstVisibleCell?.dispatchEvent(createMouseEvent("mousedown"));
			firstVisibleCell?.dispatchEvent(createMouseEvent("mouseup"));
			databaseBlock?.focus();
			await flushAnimationFrames(2);
		});

		await act(async () => {
			document.dispatchEvent(createKeyEvent("Tab"));
			await flushAnimationFrames(2);
		});

		expect(editor.selection).toMatchObject({
			type: "cell",
			blockId: "db-nav-columns",
			head: { row: 0, col: 1 },
			columnIds: ["pinned", "name"],
		});

		await unmountDatabase(root, container, editor);
	});

});
