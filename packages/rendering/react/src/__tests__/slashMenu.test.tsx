// @vitest-environment jsdom

import React, { act } from "react";
import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { createEditor } from "@pen/core";
import { Pen } from "../primitives/index";
import { useSlashMenu } from "../hooks/useSlashMenu";
import { getAttachedFieldEditor } from "../utils/fieldEditor";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("@pen/react slash menu", () => {
	it("opens after selection sync when slash text commits before a text selection exists", async () => {
		const editor = createEditor({
			without: ["document-ops", "delta-stream", "undo"],
		});
		const blockId = editor.firstBlock()!.id;

		const slashMenuRef: {
			current: ReturnType<typeof useSlashMenu> | null;
		} = { current: null };

		function Harness() {
			slashMenuRef.current = useSlashMenu(editor);

			return (
				<Pen.Editor.Root editor={editor}>
					<Pen.Editor.Content />
				</Pen.Editor.Root>
			);
		}

		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		await act(async () => {
			root.render(<Harness />);
		});

		await act(async () => {
			editor.apply([{ type: "insert-text", blockId, offset: 0, text: "/" }]);
		});

		const slashMenuBeforeSelection = slashMenuRef.current;
		expect(slashMenuBeforeSelection).not.toBeNull();
		expect(slashMenuBeforeSelection!.open).toBe(false);

		await act(async () => {
			editor.selectText(blockId, 1, 1);
		});

		const slashMenuAfterSelection = slashMenuRef.current;
		expect(slashMenuAfterSelection).not.toBeNull();
		expect(slashMenuAfterSelection!.open).toBe(true);
		expect(slashMenuAfterSelection!.query).toBe("");

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

	it("activates the first starter table cell after inserting a table", async () => {
		const editor = createEditor({
			without: ["document-ops", "delta-stream", "undo"],
		});
		const blockId = editor.firstBlock()!.id;
		editor.selectText(blockId, 0, 0);

		let slashMenu: ReturnType<typeof useSlashMenu> | null = null;

		function Harness() {
			slashMenu = useSlashMenu(editor);

			return (
				<Pen.Editor.Root editor={editor}>
					<Pen.Editor.Content />
				</Pen.Editor.Root>
			);
		}

		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		await act(async () => {
			root.render(<Harness />);
		});

		await act(async () => {
			slashMenu?.setQuery("table");
		});

		await act(async () => {
			slashMenu?.confirm(0);
			await new Promise<void>((resolve) => {
				window.requestAnimationFrame(() => resolve());
			});
		});

		expect(editor.getBlock(blockId)?.type).toBe("table");
		expect(editor.getBlock(blockId)?.props.hasHeaderRow).toBe(true);
		expect(editor.getBlock(blockId)?.tableRowCount()).toBe(2);
		expect(editor.getBlock(blockId)?.tableColumnCount()).toBe(2);

		const activeCell = container.querySelector(
			"[data-pen-table-cell][data-cell-row='0'][data-cell-col='0'] [data-pen-field-editor-active-surface]",
		);
		expect(activeCell).not.toBeNull();

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

	it("allows typing into the starter cell after slash-menu insertion", async () => {
		const editor = createEditor({
			without: ["document-ops", "delta-stream", "undo"],
		});
		const blockId = editor.firstBlock()!.id;
		editor.selectText(blockId, 0, 0);

		let slashMenu: ReturnType<typeof useSlashMenu> | null = null;

		function Harness() {
			slashMenu = useSlashMenu(editor);

			return (
				<Pen.Editor.Root editor={editor}>
					<Pen.Editor.Content />
				</Pen.Editor.Root>
			);
		}

		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		await act(async () => {
			root.render(<Harness />);
		});

		await act(async () => {
			slashMenu?.setQuery("table");
		});

		await act(async () => {
			slashMenu?.confirm(0);
			await new Promise<void>((resolve) => {
				window.requestAnimationFrame(() => resolve());
			});
		});

		const fieldEditor = getAttachedFieldEditor(editor) as
			| {
					activateCell(blockId: string, row: number, col: number): void;
				}
			| null;
		fieldEditor?.activateCell(blockId, 0, 0);

		const cellSurface = container.querySelector(
			"[data-pen-table-cell][data-cell-row='0'][data-cell-col='0'] [data-pen-inline-content]",
		) as HTMLElement | null;
		expect(cellSurface).not.toBeNull();

		await act(async () => {
			cellSurface?.dispatchEvent(
				new InputEvent("beforeinput", {
					bubbles: true,
					cancelable: true,
					inputType: "insertText",
					data: "A",
				}),
			);
		});

		await act(async () => {
			cellSurface?.dispatchEvent(
				new InputEvent("beforeinput", {
					bubbles: true,
					cancelable: true,
					inputType: "insertText",
					data: "B",
				}),
			);
		});

		expect(editor.getBlock(blockId)?.tableCell(0, 0)?.textContent()).toBe("AB");

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

	it("inserts a non-empty nested block after its visible subtree", async () => {
		const editor = createEditor({
			without: ["document-ops", "delta-stream", "undo"],
		});
		const toggleBlockId = editor.firstBlock()!.id;
		const nestedToggleId = crypto.randomUUID();
		const nestedChildId = crypto.randomUUID();

		editor.apply([
			{
				type: "convert-block",
				blockId: toggleBlockId,
				newType: "toggle",
				newProps: { open: true },
			},
			{ type: "insert-text", blockId: toggleBlockId, offset: 0, text: "Parent" },
			{
				type: "insert-block",
				blockId: nestedToggleId,
				blockType: "toggle",
				props: { open: true },
				position: { after: toggleBlockId },
			},
			{ type: "insert-text", blockId: nestedToggleId, offset: 0, text: "Nested" },
			{
				type: "update-block",
				blockId: nestedToggleId,
				props: { parentId: toggleBlockId },
			},
			{
				type: "insert-block",
				blockId: nestedChildId,
				blockType: "paragraph",
				props: {},
				position: { after: nestedToggleId },
			},
			{
				type: "insert-text",
				blockId: nestedChildId,
				offset: 0,
				text: "Nested child",
			},
			{
				type: "update-block",
				blockId: nestedChildId,
				props: { parentId: nestedToggleId },
			},
		]);
		editor.selectText(nestedToggleId, 0, 0);

		let slashMenu: ReturnType<typeof useSlashMenu> | null = null;

		function Harness() {
			slashMenu = useSlashMenu(editor);

			return (
				<Pen.Editor.Root editor={editor}>
					<Pen.Editor.Content />
				</Pen.Editor.Root>
			);
		}

		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		await act(async () => {
			root.render(<Harness />);
		});

		await act(async () => {
			slashMenu?.setQuery("heading");
		});

		await act(async () => {
			slashMenu?.confirm(0);
		});

		const insertedBlockIds = editor.documentState.blockOrder.filter(
			(blockId) =>
				blockId !== toggleBlockId &&
				blockId !== nestedToggleId &&
				blockId !== nestedChildId,
		);
		expect(insertedBlockIds).toHaveLength(1);

		const insertedBlockId = insertedBlockIds[0]!;
		expect(editor.getBlock(insertedBlockId)?.type).toBe("heading");
		expect(editor.documentState.parentOf(insertedBlockId)).toBe(toggleBlockId);
		expect(editor.documentState.blockOrder).toEqual([
			toggleBlockId,
			nestedToggleId,
			nestedChildId,
			insertedBlockId,
		]);

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});
});
