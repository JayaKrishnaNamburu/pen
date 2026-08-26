// @vitest-environment jsdom

import React, { act } from "react";
import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { Pen } from "../primitives/index";
import {
	createUndoSelectionDeletionEditor,
	flushAnimationFrames,
	getFieldEditor,
} from "./utils/selectionDeletionTestHelpers";
describe("@input/pen-react selected text deletion", () => {
	it("reconciles history changes for passive blocks outside activeBlockIds", async () => {
		const editor = createUndoSelectionDeletionEditor();
		const firstBlockId = editor.firstBlock()!.id;
		const secondBlockId = crypto.randomUUID();

		editor.apply([
			{
				type: "splice-text",
				blockId: firstBlockId,
				from: 0,
				to: 0,
				insert: "First",
			},
			{
				type: "insert-block",
				blockId: secondBlockId,
				blockType: "paragraph",
				props: {},
				position: { after: firstBlockId },
			},
			{
				type: "splice-text",
				blockId: secondBlockId,
				from: 0,
				to: 0,
				insert: "Second",
			},
		]);

		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		await act(async () => {
			root.render(
				<Pen.Editor.Root editor={editor}>
					<button type="button">Undo</button>
					<Pen.Editor.Content />
				</Pen.Editor.Root>,
			);
		});

		const fieldEditor = getFieldEditor(editor);
		const inlineElements = Array.from(
			container.querySelectorAll("[data-pen-inline-content]"),
		) as HTMLElement[];
		const secondInlineElement = inlineElements[1] ?? null;
		const toolbarButton = container.querySelector(
			"button",
		) as HTMLButtonElement | null;

		expect(secondInlineElement).not.toBeNull();
		expect(toolbarButton).not.toBeNull();

		await act(async () => {
			fieldEditor.activateTextSelection(firstBlockId, 5, 5);
			await flushAnimationFrames(3);
		});

		expect(fieldEditor.getSnapshot()).toMatchObject({
			focusBlockId: firstBlockId,
			activeBlockIds: [firstBlockId],
			mode: "single",
		});

		await act(async () => {
			editor.apply(
				[
					{
						type: "splice-text",
						blockId: secondBlockId,
						from: 6,
						to: 6,
						insert: "!",
					},
				],
				{ origin: "user" },
			);
			await flushAnimationFrames(3);
		});

		expect(editor.getBlock(secondBlockId)?.textContent()).toBe("Second!");
		expect(secondInlineElement?.textContent).toBe("Second!");

		await act(async () => {
			toolbarButton!.focus();
			fieldEditor.setFocused(true);
			await flushAnimationFrames(1);
		});

		await act(async () => {
			editor.undoManager.undo();
			await flushAnimationFrames(4);
		});

		expect(fieldEditor.getSnapshot()).toMatchObject({
			focusBlockId: firstBlockId,
			activeBlockIds: [firstBlockId],
			mode: "single",
		});
		expect(editor.getBlock(secondBlockId)?.textContent()).toBe("Second");
		expect(secondInlineElement?.textContent).toBe("Second");

		await act(async () => {
			editor.undoManager.redo();
			await flushAnimationFrames(4);
		});

		expect(fieldEditor.getSnapshot()).toMatchObject({
			focusBlockId: firstBlockId,
			activeBlockIds: [firstBlockId],
			mode: "single",
		});
		expect(editor.getBlock(secondBlockId)?.textContent()).toBe("Second!");
		expect(secondInlineElement?.textContent).toBe("Second!");

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});
});
