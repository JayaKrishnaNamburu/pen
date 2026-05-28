// @vitest-environment jsdom

import React, { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { createEditor } from "@pen/core";
import { defaultPreset } from "@pen/preset-default";
import { Pen } from "../primitives/index";
import { useSlashMenu } from "../hooks/useSlashMenu";
import { getAttachedFieldEditor } from "../utils/fieldEditor";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

async function flushAnimationFrames(count = 1): Promise<void> {
	for (let i = 0; i < count; i++) {
		await new Promise<void>((resolve) => {
			window.requestAnimationFrame(() => resolve());
		});
	}
}

function createSlashMenuEditor(
	options: Parameters<typeof createEditor>[0] = {},
) {
	return createEditor({
		...options,
		preset: defaultPreset({
			documentOps: false,
			deltaStream: false,
			undo: false,
		}),
	});
}

function dispatchKey(key: string, target: EventTarget = document) {
	target.dispatchEvent(
		new KeyboardEvent("keydown", {
			key,
			bubbles: true,
			cancelable: true,
		}),
	);
}

describe("@pen/react slash menu", () => {
	it("inserts a non-empty nested block after its visible subtree", async () => {
		const editor = createSlashMenuEditor();
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
			{
				type: "insert-text",
				blockId: toggleBlockId,
				offset: 0,
				text: "Parent",
			},
			{
				type: "insert-block",
				blockId: nestedToggleId,
				blockType: "toggle",
				props: { open: true },
				position: { after: toggleBlockId },
			},
			{
				type: "insert-text",
				blockId: nestedToggleId,
				offset: 0,
				text: "Nested",
			},
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
		expect(editor.documentState.parentOf(insertedBlockId)).toBe(
			toggleBlockId,
		);
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

	it("hides flow-disallowed blocks from the slash menu in flow documents", async () => {
		const editor = createSlashMenuEditor({
			documentProfile: "flow",
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
			slashMenu?.setQuery("");
		});

		expect(slashMenu).not.toBeNull();
		const itemTypes = slashMenu!.items.map((item) => item.type);
		expect(itemTypes).not.toContain("database");
		expect(itemTypes).not.toContain("subdocument");
		expect(itemTypes).toContain("table");

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

});
