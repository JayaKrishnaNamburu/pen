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
	it("renders calendar views from the first date column", async () => {
		const editor = createEditor({
		});
		editor.apply([
			{
				type: "insert-block",
				blockId: "db-calendar",
				blockType: "database",
				props: {},
				position: "last",
			},
			{
				type: "database-update-column",
				blockId: "db-calendar",
				columnId: "tags",
				patch: {
					title: "Due",
				},
			},
			{
				type: "database-convert-column",
				blockId: "db-calendar",
				columnId: "tags",
				toType: "date",
			},
			{
				type: "database-add-view",
				blockId: "db-calendar",
				view: {
					id: "view-calendar",
					title: "Calendar view",
					type: "calendar",
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
				blockId: "db-calendar",
				viewId: "view-calendar",
			},
			{
				type: "database-insert-row",
				blockId: "db-calendar",
				rowId: "row-a",
				values: { name: "Alpha", tags: "2024-03-10T09:00:00.000Z", status: "true" },
			},
			{
				type: "database-insert-row",
				blockId: "db-calendar",
				rowId: "row-b",
				values: { name: "Beta", tags: "", status: "false" },
			},
		]);
		const { container, root } = await renderDatabase(editor);

		await act(async () => {
			await flushAnimationFrames(2);
		});

		const calendarView = container.querySelector(
			`[data-block-id="db-calendar"] .pen-db-calendar-view`,
		) as HTMLDivElement | null;
		expect(calendarView).not.toBeNull();

		const calendarCards = Array.from(
			container.querySelectorAll(
				`[data-block-id="db-calendar"] .pen-db-calendar-view .pen-db-calendar-card`,
			),
		) as HTMLDivElement[];
		expect(
			calendarCards.some((card) => card.textContent?.includes("Alpha")),
		).toBe(true);

		const unscheduledSection = container.querySelector(
			`[data-block-id="db-calendar"] .pen-db-calendar-unscheduled`,
		) as HTMLDivElement | null;
		expect(unscheduledSection).not.toBeNull();
		expect(unscheduledSection?.textContent).toContain("Beta");

		await unmountDatabase(root, container, editor);
	});
});
