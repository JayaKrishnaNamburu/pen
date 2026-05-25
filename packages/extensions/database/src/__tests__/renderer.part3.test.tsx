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
	it("moves through pinned and grouped rows in rendered order", async () => {
		const editor = createEditor({
		});
		seedDatabase(
			editor,
			"db-nav-grouped",
			[
				{ id: "name", title: "Name", type: "text" },
				{ id: "status", title: "Status", type: "text" },
			],
			[
				["Pinned", "todo"],
				["Alpha", "done"],
				["Beta", "todo"],
			],
		);
		updatePrimaryView(editor, "db-nav-grouped", {
			groupBy: "status",
			rowPinning: {
				top: ["db-nav-grouped-row-0"],
				bottom: [],
			},
		});

		const { container, root } = await renderDatabase(editor);
		const databaseBlock = container.querySelector(
			`[data-block-id="db-nav-grouped"]`,
		) as HTMLElement | null;
		const groupedCells = Array.from(
			container.querySelectorAll(
				`[data-block-id="db-nav-grouped"] tbody td[data-pen-table-cell]`,
			),
		) as HTMLTableCellElement[];
		const firstGroupedCell = groupedCells[0] ?? null;
		expect(firstGroupedCell?.textContent).toContain("Pinned");

		await act(async () => {
			firstGroupedCell?.dispatchEvent(createMouseEvent("mousedown"));
			firstGroupedCell?.dispatchEvent(createMouseEvent("mouseup"));
			databaseBlock?.focus();
			await flushAnimationFrames(2);
		});

		await act(async () => {
			document.dispatchEvent(createKeyEvent("ArrowDown"));
			await flushAnimationFrames(2);
		});

		expect(editor.selection).toMatchObject({
			type: "cell",
			blockId: "db-nav-grouped",
			head: { row: 1, col: 0 },
			rowIds: [
				"db-nav-grouped-row-0",
				"db-nav-grouped-row-1",
				"db-nav-grouped-row-2",
			],
		});

		await unmountDatabase(root, container, editor);
	});

	it("re-normalizes cell selection to the current page", async () => {
		const editor = createEditor({
		});
		seedDatabase(
			editor,
			"db-nav-page",
			[
				{ id: "name", title: "Name", type: "text" },
			],
			[
				["Alpha"],
				["Beta"],
			],
		);
		updatePrimaryView(editor, "db-nav-page", {
			pageSize: 1,
			pageIndex: 1,
		});

		const { container, root } = await renderDatabase(editor);
		const previousPageButton = Array.from(
			container.querySelectorAll(
				`[data-block-id="db-nav-page"] .pen-db-pagination button`,
			),
		)[0] as HTMLButtonElement | undefined;
		const pageCells = Array.from(
			container.querySelectorAll(
				`[data-block-id="db-nav-page"] tbody td[data-pen-table-cell]`,
			),
		) as HTMLTableCellElement[];
		const secondPageCell = pageCells[0] ?? null;
		expect(secondPageCell?.textContent).toContain("Beta");

		await act(async () => {
			secondPageCell?.dispatchEvent(createMouseEvent("mousedown"));
			secondPageCell?.dispatchEvent(createMouseEvent("mouseup"));
			await flushAnimationFrames(2);
		});
		await act(async () => {
			previousPageButton?.dispatchEvent(createMouseEvent("click"));
			await flushAnimationFrames(2);
		});

		expect(editor.selection).toMatchObject({
			type: "cell",
			blockId: "db-nav-page",
			head: { row: 0, col: 0 },
			rowIds: ["db-nav-page-row-0"],
		});

		await unmountDatabase(root, container, editor);
	});

	it("keeps cmd+a block-scoped for selected databases in flow documents", async () => {
		const paragraphId = crypto.randomUUID();
		const editor = createFlowEditorFromSeededDocument((seedEditor) => {
			seedEditor.apply([
				{
					type: "insert-block",
					blockId: "db2",
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

		const databaseBlock = container.querySelector(
			`[data-block-id="db2"]`,
		) as HTMLElement | null;
		expect(databaseBlock).not.toBeNull();

		await act(async () => {
			editor.selectBlock("db2");
			databaseBlock?.focus();
		});

		await act(async () => {
			document.dispatchEvent(createSelectAllEvent());
			await flushAnimationFrames(2);
		});

		expect(editor.selection).toEqual({
			type: "block",
			blockIds: ["db2"],
		});

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

});
