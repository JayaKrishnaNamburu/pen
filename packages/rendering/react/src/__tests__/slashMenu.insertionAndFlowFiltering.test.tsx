// @vitest-environment jsdom

import React, { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { createEditor } from "@input/pen-core";
import { defaultPreset } from "@input/pen";
import { Pen } from "../primitives/index";
import { useSlashMenu } from "../hooks/useSlashMenu";
import { getAttachedFieldEditor } from "../utils/fieldEditor";
import { defaultSchema } from "@input/pen-schema";

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
		schema: defaultSchema,
		...options,
		preset: defaultPreset({
			tools: false,
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

describe("@input/pen-react slash menu: insertion and flow filtering", () => {
	it("inserts a non-empty nested block after its visible subtree", async () => {
		const editor = createSlashMenuEditor();
		const toggleBlockId = editor.firstBlock()!.id;
		const nestedToggleId = crypto.randomUUID();
		const nestedChildId = crypto.randomUUID();

		editor.apply([
			{
				type: "set-props",
				blockId: toggleBlockId,
				props: { type: "toggle", ...{ open: true } },
			},
			{
				type: "splice-text",
				blockId: toggleBlockId,
				from: 0,
				to: 0,
				insert: "Parent",
			},
			{
				type: "insert-block",
				blockId: nestedToggleId,
				blockType: "toggle",
				props: { open: true },
				position: { after: toggleBlockId },
			},
			{
				type: "splice-text",
				blockId: nestedToggleId,
				from: 0,
				to: 0,
				insert: "Nested",
			},
			{
				type: "set-props",
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
				type: "splice-text",
				blockId: nestedChildId,
				from: 0,
				to: 0,
				insert: "Nested child",
			},
			{
				type: "set-props",
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

	it("AX3: auto list confirms the block type it rendered and names the visible option active", async () => {
		const editor = createSlashMenuEditor();
		const blockId = editor.firstBlock()!.id;
		editor.apply([
			{ type: "splice-text", blockId, from: 0, to: 0, insert: "/" },
		]);
		editor.selectText(blockId, 1, 1);

		function Harness() {
			return (
				<Pen.Editor.Root editor={editor}>
					<Pen.Editor.Content />
					<Pen.SlashMenu.Root editor={editor}>
						<Pen.SlashMenu.List />
					</Pen.SlashMenu.Root>
				</Pen.Editor.Root>
			);
		}

		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		await act(async () => {
			root.render(<Harness />);
		});

		// a group heading appearing twice means `items` reached the list
		// ungrouped: the list only breaks runs, so it cannot merge a group
		// that registration order split.
		const headings = [
			...container.querySelectorAll("[data-pen-slash-menu-group]"),
		].map((group) => group.getAttribute("aria-label"));
		expect(headings.length).toBeGreaterThan(1);
		expect(new Set(headings).size).toBe(headings.length);

		// the active option has to be the one the user can see is selected,
		// which only holds while rendered order and item indices agree.
		const list = container.querySelector<HTMLElement>(
			"[data-pen-slash-menu-list]",
		);
		const selected = container.querySelector<HTMLElement>(
			"[data-pen-slash-menu-item][data-selected]",
		);
		expect(selected).not.toBeNull();
		expect(list?.getAttribute("aria-activedescendant")).toBe(selected!.id);

		// walking the whole list is the point: the regression moved the active
		// option through a different order than the one on screen, so the
		// highlight only diverged partway down.
		const renderedItems = [
			...container.querySelectorAll("[data-pen-slash-menu-item]"),
		];
		expect(renderedItems.length).toBeGreaterThan(2);

		for (let step = 1; step < renderedItems.length; step++) {
			await act(async () => {
				dispatchKey("ArrowDown", container);
			});

			const active = container.querySelector<HTMLElement>(
				"[data-pen-slash-menu-item][data-selected]",
			);
			expect(renderedItems.indexOf(active!)).toBe(step);
			expect(list?.getAttribute("aria-activedescendant")).toBe(
				active!.id,
			);
		}

		const codeBlockItem = container.querySelector<HTMLElement>(
			"[data-pen-slash-menu-item][data-block-type='codeBlock']",
		);
		expect(codeBlockItem).not.toBeNull();

		await act(async () => {
			codeBlockItem!.click();
		});

		expect(editor.getBlock(blockId)?.type).toBe("codeBlock");

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
		expect(itemTypes).not.toContain("subdocument");
		expect(itemTypes).toContain("table");

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});
});
