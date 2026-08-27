// @vitest-environment jsdom

import React, { act } from "react";
import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { domSelectionToEditor } from "@input/pen-dom/field-editor/selectionBridge";
import { Pen } from "../primitives/index";
import { FakeEditContext } from "./utils/fakeEditContext";
import { defaultSchema } from "@input/pen-schema";
import {
	createEditor,
	flushAnimationFrames,
	getFieldEditor,
	setNativeSelectionRange,
} from "./utils/selectionDeletionTestHelpers";

describe("@input/pen-react EditContext: pointer caret moves", () => {
	it("R3: accepts a same-block caret move inside the pointer window instead of restoring the authority caret", async () => {
		const globalWithEditContext = globalThis as typeof globalThis & {
			EditContext?: typeof FakeEditContext;
		};
		const originalEditContext = globalWithEditContext.EditContext;
		globalWithEditContext.EditContext = FakeEditContext;

		const editor = createEditor({ schema: defaultSchema });
		const blockId = editor.firstBlock()!.id;
		editor.apply([
			{
				type: "splice-text",
				blockId,
				from: 0,
				to: 0,
				insert: "Hello world",
			},
		]);

		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		try {
			await act(async () => {
				root.render(
					<Pen.Editor.Root editor={editor}>
						<Pen.Editor.Content />
					</Pen.Editor.Root>,
				);
			});

			const fieldEditor = getFieldEditor(editor);
			const rootElement = container.querySelector(
				"[data-pen-editor-root]",
			) as HTMLElement | null;
			const inlineElement = container.querySelector(
				"[data-pen-inline-content]",
			) as HTMLElement | null;

			expect(rootElement).not.toBeNull();
			expect(inlineElement).not.toBeNull();

			await act(async () => {
				fieldEditor.activateTextSelection(blockId, 1, 1);
				await flushAnimationFrames(2);
			});

			// The browser places the caret at the click point while the
			// button is still down, so the pointer window is open.
			await act(async () => {
				inlineElement!.dispatchEvent(
					new PointerEvent("pointerdown", {
						bubbles: true,
						button: 0,
					}),
				);
				setNativeSelectionRange(inlineElement!, 7, inlineElement!, 7);
				document.dispatchEvent(new Event("selectionchange"));
				await flushAnimationFrames(2);
			});

			expect(editor.selection).toMatchObject({
				type: "text",
				anchor: { blockId, offset: 7 },
				focus: { blockId, offset: 7 },
			});
			expect(domSelectionToEditor(rootElement!)).toMatchObject({
				anchor: { blockId, offset: 7 },
				focus: { blockId, offset: 7 },
			});

			await act(async () => {
				root.unmount();
			});
			container.remove();
			editor.destroy();
		} finally {
			globalWithEditContext.EditContext = originalEditContext;
		}
	});
});
