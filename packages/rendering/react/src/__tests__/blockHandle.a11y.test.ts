// @vitest-environment jsdom

import { act, createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { createEditor } from "@input/pen-core";
import { generateId } from "@input/pen-types";
import { defaultPreset } from "@input/pen-preset-default";
import { Pen } from "../primitives/index";
import {
	PEN_MOVE_BLOCK_DOWN,
	PEN_MOVE_BLOCK_UP,
	type BlockHandleMoveCommand,
} from "../primitives/editor/blockHandle";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function createHandleEditor() {
	return createEditor({
		preset: defaultPreset({
			documentOps: false,
			deltaStream: false,
			undo: false,
		}),
	});
}

function seedBlocks(
	editor: ReturnType<typeof createEditor>,
	count: number,
): string[] {
	const ids = [editor.firstBlock()!.id];
	for (let index = 1; index < count; index += 1) {
		const blockId = generateId();
		editor.apply([
			{
				type: "insert-block",
				blockId,
				blockType: "paragraph",
				props: {},
				position: "last",
			},
		]);
		ids.push(blockId);
	}
	return ids;
}

async function renderHandle(options: {
	editor: ReturnType<typeof createEditor>;
	blockId: string;
	onMoveBlock?: (command: BlockHandleMoveCommand, blockId: string) => void;
}): Promise<{
	container: HTMLDivElement;
	root: Root;
	unmount: () => Promise<void>;
}> {
	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);

	await act(async () => {
		root.render(
			createElement(
				Pen.Editor.Root,
				{ editor: options.editor },
				createElement(Pen.Editor.BlockHandle, {
					blockId: options.blockId,
					onMoveBlock: options.onMoveBlock,
				}),
			),
		);
	});

	return {
		container,
		root,
		unmount: async () => {
			await act(async () => {
				root.unmount();
			});
			container.remove();
		},
	};
}

function getHandle(container: HTMLElement): HTMLElement {
	const handle = container.querySelector(
		"[data-pen-block-handle]",
	) as HTMLElement | null;
	if (!handle) {
		throw new Error("Missing block handle");
	}
	return handle;
}

function dispatchKey(target: EventTarget, key: string): void {
	target.dispatchEvent(
		new KeyboardEvent("keydown", {
			key,
			bubbles: true,
			cancelable: true,
		}),
	);
}

describe("@input/pen-react block handle AX3", () => {
	it("AX3: exposes aria-haspopup for the drag-handle menu", async () => {
		const editor = createHandleEditor();
		const blockId = editor.firstBlock()!.id;
		const view = await renderHandle({ editor, blockId });

		const handle = getHandle(view.container);
		expect(handle.getAttribute("aria-haspopup")).toBe("menu");
		expect(handle.getAttribute("role")).toBe("button");
		expect(handle.getAttribute("aria-expanded")).toBe("false");
		expect(
			view.container.querySelector("[data-pen-block-handle-menu]"),
		).toBeNull();

		await view.unmount();
		editor.destroy();
	});

	it("AX3: Enter opens the drag-handle menu with role=menu", async () => {
		const editor = createHandleEditor();
		const blockId = editor.firstBlock()!.id;
		const view = await renderHandle({ editor, blockId });

		const handle = getHandle(view.container);
		await act(async () => {
			handle.focus();
			dispatchKey(handle, "Enter");
		});

		const menu = view.container.querySelector(
			"[data-pen-block-handle-menu]",
		);
		expect(menu).not.toBeNull();
		expect(menu?.getAttribute("role")).toBe("menu");
		expect(handle.getAttribute("aria-expanded")).toBe("true");
		expect(handle.getAttribute("aria-controls")).toBe(menu?.id);
		expect(
			menu
				?.querySelector(`[data-pen-command="${PEN_MOVE_BLOCK_UP}"]`)
				?.getAttribute("role"),
		).toBe("menuitem");
		expect(
			menu
				?.querySelector(`[data-pen-command="${PEN_MOVE_BLOCK_DOWN}"]`)
				?.getAttribute("role"),
		).toBe("menuitem");

		await view.unmount();
		editor.destroy();
	});

	it("AX3: Space opens the drag-handle menu", async () => {
		const editor = createHandleEditor();
		const blockId = editor.firstBlock()!.id;
		const view = await renderHandle({ editor, blockId });

		const handle = getHandle(view.container);
		await act(async () => {
			handle.focus();
			dispatchKey(handle, " ");
		});

		expect(
			view.container
				.querySelector("[data-pen-block-handle-menu]")
				?.getAttribute("role"),
		).toBe("menu");

		await view.unmount();
		editor.destroy();
	});

	it("AX3: move items dispatch pen.moveBlockUp/Down callbacks", async () => {
		const editor = createHandleEditor();
		const blockId = editor.firstBlock()!.id;
		const onMoveBlock = vi.fn();
		const view = await renderHandle({ editor, blockId, onMoveBlock });

		const handle = getHandle(view.container);
		await act(async () => {
			handle.focus();
			dispatchKey(handle, "Enter");
		});

		const moveUp = view.container.querySelector(
			`[data-pen-command="${PEN_MOVE_BLOCK_UP}"]`,
		) as HTMLElement | null;
		const moveDown = view.container.querySelector(
			`[data-pen-command="${PEN_MOVE_BLOCK_DOWN}"]`,
		) as HTMLElement | null;
		expect(moveUp).not.toBeNull();
		expect(moveDown).not.toBeNull();

		await act(async () => {
			moveUp?.click();
		});
		expect(onMoveBlock).toHaveBeenCalledWith(PEN_MOVE_BLOCK_UP, blockId);

		await act(async () => {
			handle.focus();
			dispatchKey(handle, "Enter");
		});
		await act(async () => {
			view.container
				.querySelector(`[data-pen-command="${PEN_MOVE_BLOCK_DOWN}"]`)
				?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(onMoveBlock).toHaveBeenCalledWith(PEN_MOVE_BLOCK_DOWN, blockId);

		await view.unmount();
		editor.destroy();
	});

	it("AX3: move items apply adjacent move-block ops when no callback is wired", async () => {
		const editor = createHandleEditor();
		const [firstId, secondId] = seedBlocks(editor, 2);
		const view = await renderHandle({ editor, blockId: firstId });

		const handle = getHandle(view.container);
		await act(async () => {
			handle.focus();
			dispatchKey(handle, "Enter");
		});
		await act(async () => {
			view.container
				.querySelector(`[data-pen-command="${PEN_MOVE_BLOCK_DOWN}"]`)
				?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		expect([...editor.documentState.blockOrder]).toEqual([
			secondId,
			firstId,
		]);

		await view.unmount();
		editor.destroy();
	});
});
