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
	it("refreshes the open column menu after adding a select option", async () => {
		const editor = createEditor({
		});

		function OptionMutationHarness() {
			const db = useDatabaseController({ blockId: "db-option-menu" });
			const statusColumn = db.columnSchema.find((entry) => entry.id === "status");
			return (
				<>
					<button onClick={() => db.addOption("status", "Blocked", "gray")}>
						Add test option
					</button>
					<ColumnMenu
						column={statusColumn}
						onClose={() => { }}
						onRename={(nextTitle) => db.renameColumn("status", nextTitle)}
						onChangeType={(nextType) => db.changeColumnType("status", nextType)}
						onDelete={() => db.deleteColumn("status")}
						onToggleVisibility={() => db.toggleColumnVisibility("status")}
						onChangePin={(nextPinned) => db.changeColumnPin("status", nextPinned)}
						onAddOption={(value, color) => db.addOption("status", value, color)}
						onRenameOption={(optionId, value) => db.renameOption("status", optionId, value)}
						onRecolorOption={(optionId, color) => db.recolorOption("status", optionId, color)}
						onRemoveOption={(optionId) => db.removeOption("status", optionId)}
						onMoveOption={(optionId, direction) => db.moveOption("status", optionId, direction)}
					/>
				</>
			);
		}

		seedDatabase(
			editor,
			"db-option-menu",
			[
				{ id: "name", title: "Name", type: "text", width: 140 },
				{ id: "status", title: "Status", type: "select", width: 140, options: [] },
			],
			[["Alpha", ""]],
		);
		const { container, root } = await renderDatabase(
			editor,
			{ children: <OptionMutationHarness /> },
		);

		let optionRows = Array.from(
			container.querySelectorAll(`.pen-db-col-option-row input`),
		) as HTMLInputElement[];
		expect(optionRows).toHaveLength(0);

		const addOptionButton = getButtonByText(container, "Add test option");
		expect(addOptionButton).not.toBeNull();

		await act(async () => {
			addOptionButton?.dispatchEvent(createMouseEvent("click"));
			await flushAnimationFrames(2);
		});

		expect(editor.getBlock("db-option-menu")?.tableColumns()[1]?.options).toEqual([
			expect.objectContaining({
				value: "Blocked",
				color: "gray",
			}),
		]);

		optionRows = Array.from(
			container.querySelectorAll(`.pen-db-col-option-row input`),
		) as HTMLInputElement[];
		expect(optionRows).toHaveLength(1);
		expect(optionRows[0]?.value).toBe("Blocked");

		await unmountDatabase(root, container, editor);
	});

	it("renders grouped sections from the group panel", async () => {
		const editor = createEditor({
		});
		editor.apply([
			{
				type: "insert-block",
				blockId: "db-group",
				blockType: "database",
				props: {},
				position: "last",
			},
			{
				type: "database-update-column",
				blockId: "db-group",
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
				type: "database-insert-row",
				blockId: "db-group",
				rowId: "row-a",
				values: { name: "Alpha", tags: "todo" },
			},
			{
				type: "database-insert-row",
				blockId: "db-group",
				rowId: "row-b",
				values: { name: "Beta", tags: "done" },
			},
			{
				type: "database-insert-row",
				blockId: "db-group",
				rowId: "row-c",
				values: { name: "Gamma", tags: "todo" },
			},
		]);
		const { container, root } = await renderDatabase(editor);

		const groupButton = getButtonByText(container, "Group");
		expect(groupButton).not.toBeNull();

		await act(async () => {
			groupButton?.dispatchEvent(createMouseEvent("click"));
			await flushAnimationFrames(1);
		});

		const groupSelect = container.querySelector(".pen-db-col-vis-panel select") as HTMLSelectElement | null;
		expect(groupSelect).not.toBeNull();

		await act(async () => {
			if (groupSelect) {
				groupSelect.value = "tags";
				groupSelect.dispatchEvent(new Event("change", { bubbles: true }));
			}
			await flushAnimationFrames(1);
		});

		expect(editor.getBlock("db-group")?.databaseActiveView()?.groupBy).toBe("tags");

		const groupRows = Array.from(
			container.querySelectorAll(`[data-block-id="db-group"] .pen-db-group-row`),
		) as HTMLTableRowElement[];
		expect(groupRows).toHaveLength(2);
		expect(groupRows[0]?.textContent).toContain("Todo (2)");
		expect(groupRows[1]?.textContent).toContain("Done (1)");

		await unmountDatabase(root, container, editor);
	});

	it("adds switches and removes database views from the title bar", async () => {
		const editor = createEditor({
		});
		seedDatabase(
			editor,
			"db-views",
			[
				{ id: "name", title: "Name", type: "text", width: 140 },
				{ id: "status", title: "Status", type: "text", width: 120 },
			],
			[["Alpha", "Open"], ["Beta", "Done"]],
		);
		const primaryViewId = editor.getBlock("db-views")?.databasePrimaryViewId() ?? "";
		const { container, root } = await renderDatabase(editor);

		const addViewButton = getButtonByText(container, "+ View");
		expect(addViewButton).not.toBeNull();

		await act(async () => {
			addViewButton?.dispatchEvent(createMouseEvent("click"));
			await flushAnimationFrames(1);
		});

		const addListViewButton = getButtonByText(container, "New list view");
		const addBoardViewButton = getButtonByText(container, "New board view");
		const addCalendarViewButton = getButtonByText(container, "New calendar view");
		const addGalleryViewButton = getButtonByText(container, "New gallery view");
		expect(addListViewButton).not.toBeNull();
		expect(addBoardViewButton).not.toBeNull();
		expect(addCalendarViewButton).not.toBeNull();
		expect(addGalleryViewButton).not.toBeNull();

		await act(async () => {
			addListViewButton?.dispatchEvent(createMouseEvent("click"));
			await flushAnimationFrames(1);
		});

		const blockAfterAdd = editor.getBlock("db-views");
		const listView = blockAfterAdd?.databaseViews().find((view) => view.type === "list");
		expect(listView).toBeDefined();
		expect(blockAfterAdd?.databaseViews()).toHaveLength(2);
		expect(blockAfterAdd?.databaseActiveView()?.id).toBe(listView?.id);
		expect(container.querySelector(`[data-block-id="db-views"] .pen-db-list-view`)).not.toBeNull();

		const tableTab = container.querySelector(
			`[data-block-id="db-views"] [data-view-id="${primaryViewId}"]`,
		) as HTMLButtonElement | null;
		expect(tableTab).not.toBeNull();

		await act(async () => {
			tableTab?.dispatchEvent(createMouseEvent("click"));
			await flushAnimationFrames(2);
		});

		expect(editor.getBlock("db-views")?.databaseActiveView()?.id).toBe(primaryViewId);
		expect(container.querySelector(`[data-block-id="db-views"] table[data-pen-table]`)).not.toBeNull();

		const removeListViewButton = container.querySelector(
			`[data-block-id="db-views"] [data-remove-view-id="${listView?.id ?? ""}"]`,
		) as HTMLButtonElement | null;
		expect(removeListViewButton).not.toBeNull();

		await act(async () => {
			removeListViewButton?.dispatchEvent(createMouseEvent("click"));
			await flushAnimationFrames(1);
		});

		expect(editor.getBlock("db-views")?.databaseViews()).toHaveLength(1);
		expect(editor.getBlock("db-views")?.databasePrimaryViewId()).toBe(primaryViewId);

		await unmountDatabase(root, container, editor);
	});

});
