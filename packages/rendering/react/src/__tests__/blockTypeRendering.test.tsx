// @vitest-environment jsdom

import React, { act } from "react";
import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { createEditor } from "@pen/core";
import { Pen } from "../primitives/index.js";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const BLOCK_TYPE_OPTIONS = [
	{ value: "paragraph", label: "Paragraph" },
	{ value: "heading", label: "Heading" },
];

function visibleText(text: string | null | undefined): string {
	return (text ?? "").replace(/\u200B/g, "");
}

describe("@pen/react block type rendering", () => {
	it("updates the rendered block immediately when the toolbar converts block type", async () => {
		const editor = createEditor({
			without: ["document-ops", "delta-stream", "undo"],
		});
		const blockId = editor.firstBlock()!.id;

		editor.apply([
			{ type: "insert-text", blockId, offset: 0, text: "Hello world" },
		]);
		editor.selectText(blockId, 0, 0);

		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		await act(async () => {
			root.render(
				<Pen.Editor.Root editor={editor}>
					<Pen.Toolbar.Root editor={editor}>
						<Pen.Toolbar.Select
							format="blockType"
							options={BLOCK_TYPE_OPTIONS}
						/>
					</Pen.Toolbar.Root>
					<Pen.Editor.Content />
				</Pen.Editor.Root>,
			);
		});

		const select = container.querySelector(
			"[data-pen-toolbar-select]",
		) as HTMLSelectElement | null;

		expect(select?.value).toBe("paragraph");
		expect(
			container.querySelector("h1[data-block-type='heading']"),
		).toBeNull();
		expect(
			container.querySelector("div[data-block-type='paragraph']"),
		).not.toBeNull();

		await act(async () => {
			if (!select) {
				throw new Error("Missing toolbar select");
			}
			select.value = "heading";
			select.dispatchEvent(new Event("change", { bubbles: true }));
		});

		expect(editor.getBlock(blockId)?.type).toBe("heading");
		expect(select?.value).toBe("heading");
		expect(
			container.querySelector("h1[data-block-type='heading']"),
		).not.toBeNull();

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

	it("updates inactive inline content when CRDT text changes", async () => {
		const editor = createEditor({
			without: ["document-ops", "delta-stream", "undo"],
		});
		const blockId = editor.firstBlock()!.id;

		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		await act(async () => {
			root.render(
				<Pen.Editor.Root editor={editor}>
					<Pen.Editor.Content />
				</Pen.Editor.Root>,
			);
		});

		const inlineContent = container.querySelector(
			"[data-pen-inline-content]",
		) as HTMLElement | null;

		expect(visibleText(inlineContent?.textContent)).toBe("");

		await act(async () => {
			editor.apply([
				{
					type: "insert-text",
					blockId,
					offset: 0,
					text: "Synced text",
				},
			]);
		});

		expect(visibleText(inlineContent?.textContent)).toBe("Synced text");

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});
});
