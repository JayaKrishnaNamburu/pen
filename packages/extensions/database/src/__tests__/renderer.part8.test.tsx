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
	it("filters dates with relative presets from the filter panel", async () => {
		const now = new Date();
		const recentDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2, 9, 0, 0);
		const oldDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 12, 9, 0, 0);
		const editor = createEditor({
		});
		editor.apply([
			{
				type: "insert-block",
				blockId: "db-date-filter",
				blockType: "database",
				props: {},
				position: "last",
			},
			{
				type: "database-update-column",
				blockId: "db-date-filter",
				columnId: "tags",
				patch: {
					title: "Due",
				},
			},
			{
				type: "database-convert-column",
				blockId: "db-date-filter",
				columnId: "tags",
				toType: "date",
			},
			{
				type: "database-insert-row",
				blockId: "db-date-filter",
				rowId: "row-a",
				values: { name: "Alpha", tags: recentDate.toISOString() },
			},
			{
				type: "database-insert-row",
				blockId: "db-date-filter",
				rowId: "row-b",
				values: { name: "Beta", tags: oldDate.toISOString() },
			},
		]);
		const { container, root } = await renderDatabase(editor);

		const filterButton = getButtonByText(container, "Filter");
		expect(filterButton).not.toBeNull();

		await act(async () => {
			filterButton?.dispatchEvent(createMouseEvent("click"));
			await flushAnimationFrames(1);
		});

		const addFilterButton = container.querySelector(".pen-db-filter-add") as HTMLButtonElement | null;
		expect(addFilterButton).not.toBeNull();

		await act(async () => {
			addFilterButton?.dispatchEvent(createMouseEvent("click"));
			await flushAnimationFrames(1);
		});

		const columnSelect = container.querySelector('[data-filter-column="0"]') as HTMLSelectElement | null;
		expect(columnSelect).not.toBeNull();

		await act(async () => {
			if (columnSelect) {
				columnSelect.value = "tags";
				columnSelect.dispatchEvent(new Event("change", { bubbles: true }));
			}
			await flushAnimationFrames(2);
		});

		const operatorSelect = container.querySelector('[data-filter-operator="0"]') as HTMLSelectElement | null;
		expect(operatorSelect).not.toBeNull();
		expect(
			Array.from(operatorSelect?.options ?? []).some(
				(option) => option.value === "is_relative",
			),
		).toBe(true);

		updatePrimaryView(editor, "db-date-filter", {
			filter: {
				operator: "and",
				conditions: [{
					columnId: "tags",
					operator: "is_relative",
					value: "last_7_days",
				}],
			},
		});

		await act(async () => {
			await flushAnimationFrames(2);
		});

		expect(editor.getBlock("db-date-filter")?.databaseActiveView()?.filter).toEqual({
			operator: "and",
			conditions: [{
				columnId: "tags",
				operator: "is_relative",
				value: "last_7_days",
			}],
		});

		await unmountDatabase(root, container, editor);
	});

	it("pins selected rows to the top and bottom through the toolbar", async () => {
		const editor = createEditor({
		});
		editor.apply([
			{
				type: "insert-block",
				blockId: "db-row-pins",
				blockType: "database",
				props: {},
				position: "last",
			},
			{
				type: "database-insert-row",
				blockId: "db-row-pins",
				rowId: "row-a",
				values: { name: "Alpha" },
			},
			{
				type: "database-insert-row",
				blockId: "db-row-pins",
				rowId: "row-b",
				values: { name: "Beta" },
			},
			{
				type: "database-insert-row",
				blockId: "db-row-pins",
				rowId: "row-c",
				values: { name: "Gamma" },
			},
		]);
		const { container, root } = await renderDatabase(editor);

		const rowCheckboxes = Array.from(
			container.querySelectorAll(
				`[data-block-id="db-row-pins"] tbody tr[data-row] .pen-db-row-select-cell input`,
			),
		) as HTMLInputElement[];
		expect(rowCheckboxes).toHaveLength(3);

		await act(async () => {
			rowCheckboxes[1]?.click();
			await flushAnimationFrames(1);
		});

		const pinTopButton = getButtonByText(container, "Pin top");
		expect(pinTopButton).not.toBeNull();

		await act(async () => {
			pinTopButton?.dispatchEvent(createMouseEvent("click"));
			await flushAnimationFrames(1);
		});

		expect(editor.getBlock("db-row-pins")?.databaseActiveView()?.rowPinning).toEqual({
			top: ["row-b"],
		});

		let renderedRows = Array.from(
			container.querySelectorAll(`[data-block-id="db-row-pins"] tbody tr[data-row]`),
		) as HTMLTableRowElement[];
		expect(renderedRows[0]?.getAttribute("data-row-section")).toBe("top");
		expect(renderedRows[0]?.textContent).toContain("Beta");

		const refreshedRowCheckboxes = Array.from(
			container.querySelectorAll(
				`[data-block-id="db-row-pins"] tbody tr[data-row] .pen-db-row-select-cell input`,
			),
		) as HTMLInputElement[];

		await act(async () => {
			refreshedRowCheckboxes[0]?.click();
			await flushAnimationFrames(1);
		});

		await act(async () => {
			refreshedRowCheckboxes[2]?.click();
			await flushAnimationFrames(1);
		});

		const pinBottomButton = getButtonByText(container, "Pin bottom");
		expect(pinBottomButton).not.toBeNull();

		await act(async () => {
			pinBottomButton?.dispatchEvent(createMouseEvent("click"));
			await flushAnimationFrames(1);
		});

		expect(editor.getBlock("db-row-pins")?.databaseActiveView()?.rowPinning).toEqual({
			top: ["row-b"],
			bottom: ["row-c"],
		});

		renderedRows = Array.from(
			container.querySelectorAll(`[data-block-id="db-row-pins"] tbody tr[data-row]`),
		) as HTMLTableRowElement[];
		expect(renderedRows.at(-1)?.getAttribute("data-row-section")).toBe("bottom");
		expect(renderedRows.at(-1)?.textContent).toContain("Gamma");

		await unmountDatabase(root, container, editor);
	});

});
