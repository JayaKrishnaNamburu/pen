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
	it("shows facet-backed autocomplete options in the filter panel", async () => {
		const editor = createEditor({
		});
		seedDatabase(
			editor,
			"db-filter",
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
			[["todo"], ["done"], ["todo"]],
		);
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

		const datalist = container.querySelector('datalist[id="pen-db-filter-values-0"]');
		const todoOption = datalist?.querySelector('option[value="todo"]') as HTMLOptionElement | null;
		const doneOption = datalist?.querySelector('option[value="done"]') as HTMLOptionElement | null;
		expect(todoOption?.label).toBe("Todo (2)");
		expect(doneOption?.label).toBe("Done (1)");

		await unmountDatabase(root, container, editor);
	});

	it("manages the multi-sort stack from the sort panel", async () => {
		const editor = createEditor({
		});
		seedDatabase(
			editor,
			"db-sort-panel",
			[
				{ id: "name", title: "Name", type: "text", width: 140 },
				{ id: "tags", title: "Priority", type: "number", width: 120 },
				{ id: "status", title: "Status", type: "text", width: 120 },
			],
			[["A", "2", "Open"], ["B", "1", "Done"]],
		);
		const { container, root } = await renderDatabase(editor);

		const sortButton = getButtonByText(container, "Sort");
		expect(sortButton).not.toBeNull();

		await act(async () => {
			sortButton?.dispatchEvent(createMouseEvent("click"));
			await flushAnimationFrames(1);
		});

		const addSortButton = container.querySelector(".pen-db-sort-add") as HTMLButtonElement | null;
		expect(addSortButton).not.toBeNull();

		await act(async () => {
			addSortButton?.dispatchEvent(createMouseEvent("click"));
			await flushAnimationFrames(1);
		});

		const refreshedAddSortButton = container.querySelector(".pen-db-sort-add") as HTMLButtonElement | null;
		expect(refreshedAddSortButton).not.toBeNull();

		await act(async () => {
			refreshedAddSortButton?.dispatchEvent(createMouseEvent("click"));
			await flushAnimationFrames(1);
		});

		const secondColumnSelect = container.querySelector('[data-sort-column="1"]') as HTMLSelectElement | null;
		expect(secondColumnSelect).not.toBeNull();

		await act(async () => {
			if (secondColumnSelect) {
				secondColumnSelect.value = "tags";
				secondColumnSelect.dispatchEvent(new Event("change", { bubbles: true }));
			}
			await flushAnimationFrames(1);
		});

		const refreshedSecondDirectionSelect = container.querySelector(
			'[data-sort-direction="1"]',
		) as HTMLSelectElement | null;
		expect(refreshedSecondDirectionSelect).not.toBeNull();

		await act(async () => {
			if (refreshedSecondDirectionSelect) {
				refreshedSecondDirectionSelect.value = "desc";
				refreshedSecondDirectionSelect.dispatchEvent(new Event("change", { bubbles: true }));
			}
			await flushAnimationFrames(1);
		});

		const moveUpButton = container.querySelector('[data-sort-move-up="1"]') as HTMLButtonElement | null;
		expect(moveUpButton).not.toBeNull();

		await act(async () => {
			moveUpButton?.dispatchEvent(createMouseEvent("click"));
			await flushAnimationFrames(1);
		});

		expect(editor.getBlock("db-sort-panel")?.databaseActiveView()?.sort).toEqual([
			{ columnId: "tags", direction: "desc" },
			{ columnId: "name", direction: "asc" },
		]);

		await unmountDatabase(root, container, editor);
	});

	it("supports nested filter groups from the filter panel", async () => {
		const editor = createEditor({
		});
		seedDatabase(
			editor,
			"db-filter-groups",
			[
				{ id: "name", title: "Name", type: "text", width: 140 },
				{ id: "status", title: "Status", type: "text", width: 120 },
			],
			[["Alpha", "Open"], ["Beta", "Done"]],
		);
		const { container, root } = await renderDatabase(editor);

		const filterButton = getButtonByText(container, "Filter");
		expect(filterButton).not.toBeNull();

		await act(async () => {
			filterButton?.dispatchEvent(createMouseEvent("click"));
			await flushAnimationFrames(1);
		});

		const addGroupButton = container.querySelector('[data-filter-add-group="root"]') as HTMLButtonElement | null;
		expect(addGroupButton).not.toBeNull();

		await act(async () => {
			addGroupButton?.dispatchEvent(createMouseEvent("click"));
			await flushAnimationFrames(1);
		});

		const nestedValueInput = container.querySelector('[data-filter-value="0-0"]') as HTMLInputElement | null;
		expect(nestedValueInput).not.toBeNull();

		await act(async () => {
			if (nestedValueInput) {
				const valueSetter = Object.getOwnPropertyDescriptor(
					window.HTMLInputElement.prototype,
					"value",
				)?.set;
				valueSetter?.call(nestedValueInput, "Alpha");
				nestedValueInput.dispatchEvent(new InputEvent("input", { bubbles: true, data: "Alpha" }));
			}
			await flushAnimationFrames(1);
		});

		expect(editor.getBlock("db-filter-groups")?.databaseActiveView()?.filter).toEqual({
			operator: "and",
			conditions: [
				{
					operator: "and",
					conditions: [
						{ columnId: "name", operator: "contains", value: "Alpha" },
					],
				},
			],
		});

		const renderedRows = Array.from(
			container.querySelectorAll(`[data-block-id="db-filter-groups"] tbody tr[data-row]`),
		) as HTMLTableRowElement[];
		expect(renderedRows).toHaveLength(1);
		expect(renderedRows[0]?.textContent).toContain("Alpha");

		await unmountDatabase(root, container, editor);
	});

});
