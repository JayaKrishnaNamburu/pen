// @vitest-environment jsdom

import React, { act, cloneElement } from "react";
import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { createEditor } from "@input/pen-core";
import { defaultPreset } from "@input/pen";
import type { BlockHandle, BlockRenderContext } from "@input/pen-types";
import { defaultSchema } from "@input/pen-schema";
import { Pen } from "../primitives/index";
import {
	BulletListItemRenderer,
	CheckListItemRenderer,
	NumberedListItemRenderer,
} from "../renderers/index";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function createListEditor() {
	return createEditor({
		schema: defaultSchema,
		preset: defaultPreset({
			tools: false,
			deltaStream: false,
			undo: false,
		}),
	});
}

async function renderWithHostRenderer(
	editor: ReturnType<typeof createListEditor>,
	renderers: Record<
		string,
		(block: BlockHandle, ctx: BlockRenderContext) => React.ReactElement
	>,
): Promise<{ container: HTMLDivElement; root: ReturnType<typeof createRoot> }> {
	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);

	await act(async () => {
		root.render(
			<Pen.Editor.Root editor={editor} renderers={renderers}>
				<Pen.Editor.Content />
			</Pen.Editor.Root>,
		);
	});

	return { container, root };
}

async function unmount(
	root: ReturnType<typeof createRoot>,
	container: HTMLDivElement,
	editor: ReturnType<typeof createListEditor>,
): Promise<void> {
	await act(async () => {
		root.unmount();
	});
	container.remove();
	editor.destroy();
}

describe("HB8 list item host attributes", () => {
	it("HB8: cloneElement extraAttributes land on numbered and bullet layout hosts", async () => {
		const editor = createListEditor();
		const blockId = editor.firstBlock()!.id;
		editor.apply([
			{
				type: "set-props",
				blockId,
				props: { type: "numberedListItem", start: 3 },
			},
			{ type: "splice-text", blockId, from: 0, to: 0, insert: "Third" },
		]);

		const { container, root } = await renderWithHostRenderer(editor, {
			numberedListItem(block, ctx) {
				return cloneElement(NumberedListItemRenderer(block, ctx), {
					extraAttributes: { "data-align": "center" },
				});
			},
		});

		const layout = container.querySelector(
			"[data-pen-list-item-layout][data-block-type='numberedListItem']",
		) as HTMLElement | null;

		expect(layout?.getAttribute("data-align")).toBe("center");
		expect(layout?.getAttribute("data-counter")).toBe("3");
		expect(
			layout?.querySelector("[data-pen-list-marker]")?.textContent,
		).toBe("3.");

		await unmount(root, container, editor);
	});

	it("HB8: cloneElement data-* lands on numbered items the same way as bullet", async () => {
		const editor = createListEditor();
		const numberedId = editor.firstBlock()!.id;
		const bulletId = crypto.randomUUID();

		editor.apply([
			{
				type: "set-props",
				blockId: numberedId,
				props: { type: "numberedListItem", start: 4 },
			},
			{
				type: "insert-block",
				blockId: bulletId,
				blockType: "bulletListItem",
				props: {},
				position: "last",
			},
		]);

		const { container, root } = await renderWithHostRenderer(editor, {
			numberedListItem(block, ctx) {
				return cloneElement(NumberedListItemRenderer(block, ctx), {
					"data-align": "right",
				});
			},
			bulletListItem(block, ctx) {
				return cloneElement(BulletListItemRenderer(block, ctx), {
					"data-align": "right",
				});
			},
		});

		const numbered = container.querySelector(
			"[data-pen-list-item-layout][data-block-type='numberedListItem']",
		);
		const bullet = container.querySelector(
			"[data-pen-list-item-layout][data-block-type='bulletListItem']",
		);

		expect(numbered?.getAttribute("data-align")).toBe("right");
		expect(bullet?.getAttribute("data-align")).toBe("right");
		expect(numbered?.getAttribute("data-counter")).toBe("4");
		expect(
			numbered?.querySelector("[data-pen-list-marker]")?.textContent,
		).toBe("4.");

		await unmount(root, container, editor);
	});

	it("HB8: a colliding host data-counter cannot replace the resolved ordinal", async () => {
		const editor = createListEditor();
		const blockId = editor.firstBlock()!.id;
		editor.apply([
			{
				type: "set-props",
				blockId,
				props: { type: "numberedListItem", start: 5 },
			},
		]);

		const { container, root } = await renderWithHostRenderer(editor, {
			numberedListItem(block, ctx) {
				return cloneElement(NumberedListItemRenderer(block, ctx), {
					extraAttributes: {
						"data-align": "left",
						"data-counter": "99",
					},
				});
			},
		});

		const layout = container.querySelector(
			"[data-pen-list-item-layout][data-block-type='numberedListItem']",
		);

		expect(layout?.getAttribute("data-align")).toBe("left");
		expect(layout?.getAttribute("data-counter")).toBe("5");
		expect(
			layout?.querySelector("[data-pen-list-marker]")?.textContent,
		).toBe("5.");

		await unmount(root, container, editor);
	});

	it("HB8: host extraAttributes cannot replace data-checked on a check list item", async () => {
		const editor = createListEditor();
		const blockId = editor.firstBlock()!.id;
		editor.apply([
			{
				type: "set-props",
				blockId,
				props: { type: "checkListItem", checked: true },
			},
		]);

		const { container, root } = await renderWithHostRenderer(editor, {
			checkListItem(block, ctx) {
				return cloneElement(CheckListItemRenderer(block, ctx), {
					extraAttributes: { "data-align": "center" },
				});
			},
		});

		const layout = container.querySelector(
			"[data-pen-list-item-layout][data-block-type='checkListItem']",
		);

		expect(layout?.getAttribute("data-align")).toBe("center");
		expect(layout?.getAttribute("data-checked")).toBe("");

		await unmount(root, container, editor);
	});

	it("HB8: host attributes cannot replace the layout identity attributes", async () => {
		const editor = createListEditor();
		const blockId = editor.firstBlock()!.id;
		editor.apply([
			{
				type: "set-props",
				blockId,
				props: { type: "bulletListItem", indent: 1 },
			},
		]);

		const { container, root } = await renderWithHostRenderer(editor, {
			bulletListItem(block, ctx) {
				return cloneElement(BulletListItemRenderer(block, ctx), {
					extraAttributes: {
						"data-block-type": "hostClaimed",
						"data-indent": "99",
						"data-pen-list-item-layout": "hostClaimed",
						"data-align": "right",
					},
				});
			},
		});

		const layout = container.querySelector("[data-pen-list-item-layout]");

		expect(layout?.getAttribute("data-block-type")).toBe("bulletListItem");
		expect(layout?.getAttribute("data-indent")).toBe("1");
		expect(layout?.getAttribute("data-pen-list-item-layout")).toBe("");
		expect(layout?.getAttribute("data-align")).toBe("right");

		await unmount(root, container, editor);
	});
});
