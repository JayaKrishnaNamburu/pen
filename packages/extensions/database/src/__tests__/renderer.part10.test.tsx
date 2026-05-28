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
	it("renders list views as stacked row cards", async () => {
		const editor = createEditor({
		});
		editor.apply([
			{
				type: "insert-block",
				blockId: "db-list",
				blockType: "database",
				props: {},
				position: "last",
			},
			{
				type: "database-add-view",
				blockId: "db-list",
				view: {
					id: "view-list",
					title: "List view",
					type: "list",
					visibleColumnIds: ["name", "tags", "status"],
					columnOrder: ["name", "tags", "status"],
					sort: [],
					filter: null,
					groupBy: null,
					pageIndex: 0,
					pageSize: 50,
				},
			},
			{
				type: "database-set-active-view",
				blockId: "db-list",
				viewId: "view-list",
			},
			{
				type: "database-insert-row",
				blockId: "db-list",
				rowId: "row-a",
				values: { name: "Alpha", tags: "Todo", status: "true" },
			},
		]);
		const { container, root } = await renderDatabase(editor);

		const listView = container.querySelector(
			`[data-block-id="db-list"] .pen-db-list-view`,
		) as HTMLDivElement | null;
		expect(listView).not.toBeNull();
		expect(container.querySelector(`[data-block-id="db-list"] table[data-pen-table]`)).toBeNull();

		const listRow = container.querySelector(
			`[data-block-id="db-list"] .pen-db-list-row[data-row="0"]`,
		) as HTMLDivElement | null;
		expect(listRow).not.toBeNull();
		expect(listRow?.textContent).toContain("Name");
		expect(listRow?.textContent).toContain("Tags");
		expect(listRow?.textContent).toContain("Done");
		expect(listRow?.textContent).toContain("Alpha");

		await unmountDatabase(root, container, editor);
	});

	it("renders board views as grouped kanban lanes", async () => {
		const editor = createEditor({
		});
		editor.apply([
			{
				type: "insert-block",
				blockId: "db-board",
				blockType: "database",
				props: {},
				position: "last",
			},
			{
				type: "database-update-column",
				blockId: "db-board",
				columnId: "tags",
				patch: {
					title: "Status",
					options: [
						{ id: "todo", value: "Todo" },
						{ id: "done", value: "Done" },
					],
				},
			},
			{
				type: "database-add-view",
				blockId: "db-board",
				view: {
					id: "view-board",
					title: "Board view",
					type: "board",
					visibleColumnIds: ["name", "tags", "status"],
					columnOrder: ["name", "tags", "status"],
					sort: [],
					filter: null,
					groupBy: "tags",
					pageIndex: 0,
					pageSize: 50,
				},
			},
			{
				type: "database-set-active-view",
				blockId: "db-board",
				viewId: "view-board",
			},
			{
				type: "database-insert-row",
				blockId: "db-board",
				rowId: "row-a",
				values: { name: "Alpha", tags: "todo", status: "true" },
			},
			{
				type: "database-insert-row",
				blockId: "db-board",
				rowId: "row-b",
				values: { name: "Beta", tags: "done", status: "false" },
			},
		]);
		const { container, root } = await renderDatabase(editor);

		const boardView = container.querySelector(
			`[data-block-id="db-board"] .pen-db-board-view`,
		) as HTMLDivElement | null;
		expect(boardView).not.toBeNull();

		const laneHeaders = Array.from(
			container.querySelectorAll(`[data-block-id="db-board"] .pen-db-board-lane-header`),
		) as HTMLDivElement[];
		expect(laneHeaders).toHaveLength(2);
		expect(laneHeaders[0]?.textContent).toContain("Todo (1)");
		expect(laneHeaders[1]?.textContent).toContain("Done (1)");

		const boardCard = container.querySelector(
			`[data-block-id="db-board"] .pen-db-board-card[data-row="0"]`,
		) as HTMLDivElement | null;
		expect(boardCard).not.toBeNull();
		expect(boardCard?.textContent).toContain("Alpha");
		expect(boardCard?.textContent).toContain("Status");

		await unmountDatabase(root, container, editor);
	});

	it("renders gallery views as row cards", async () => {
		const editor = createEditor({
		});
		editor.apply([
			{
				type: "insert-block",
				blockId: "db-gallery",
				blockType: "database",
				props: {},
				position: "last",
			},
			{
				type: "database-add-view",
				blockId: "db-gallery",
				view: {
					id: "view-gallery",
					title: "Gallery view",
					type: "gallery",
					visibleColumnIds: ["name", "tags", "status"],
					columnOrder: ["name", "tags", "status"],
					sort: [],
					filter: null,
					groupBy: null,
					pageIndex: 0,
					pageSize: 50,
				},
			},
			{
				type: "database-set-active-view",
				blockId: "db-gallery",
				viewId: "view-gallery",
			},
			{
				type: "database-insert-row",
				blockId: "db-gallery",
				rowId: "row-a",
				values: { name: "Alpha", tags: "Todo", status: "true" },
			},
		]);
		const { container, root } = await renderDatabase(editor);

		const galleryView = container.querySelector(
			`[data-block-id="db-gallery"] .pen-db-gallery-view`,
		) as HTMLDivElement | null;
		expect(galleryView).not.toBeNull();

		const galleryCard = container.querySelector(
			`[data-block-id="db-gallery"] .pen-db-gallery-card[data-row="0"]`,
		) as HTMLDivElement | null;
		expect(galleryCard).not.toBeNull();
		expect(galleryCard?.textContent).toContain("Name");
		expect(galleryCard?.textContent).toContain("Alpha");
		expect(galleryCard?.textContent).toContain("Tags");

		await unmountDatabase(root, container, editor);
	});

});
