// @vitest-environment jsdom

import React, { act } from "react";
import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { Pen } from "../primitives/index";
import { FakeEditContext } from "./utils/fakeEditContext";
import { defaultSchema } from "@input/pen-schema-default";
import {
	createEditor,
	createKeyEvent,
	createSelectAllEvent,
	flushAnimationFrames,
	getFieldEditor,
	setNativeSelectionRange,
} from "./utils/selectionDeletionTestHelpers";
describe("@input/pen-react selected text deletion", () => {
	it("deletes a cmd+a selection on Backspace when the native EditContext range is collapsed", async () => {
		const originalEditContext = (
			globalThis as typeof globalThis & {
				EditContext?: typeof FakeEditContext;
			}
		).EditContext;
		(
			globalThis as typeof globalThis & {
				EditContext?: typeof FakeEditContext;
			}
		).EditContext = FakeEditContext;

		const editor = createEditor({ schema: defaultSchema });
		const blockId = editor.firstBlock()!.id;

		editor.apply([
			{ type: "splice-text", blockId, from: 0, to: 0, insert: "Title" },
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
			const inlineElement = container.querySelector(
				"[data-pen-inline-content]",
			) as
				| (HTMLElement & { editContext?: FakeEditContext | null })
				| null;

			expect(inlineElement).not.toBeNull();

			await act(async () => {
				fieldEditor.activateTextSelection(blockId, 2, 2);
				await flushAnimationFrames(2);
			});

			await act(async () => {
				inlineElement!.dispatchEvent(createSelectAllEvent());
				await flushAnimationFrames(4);
				setNativeSelectionRange(inlineElement!, 0, inlineElement!, 0);
				document.dispatchEvent(new Event("selectionchange"));
				await flushAnimationFrames(2);
			});

			expect(editor.selection).toMatchObject({
				type: "text",
				anchor: { blockId, offset: 0 },
				focus: { blockId, offset: 5 },
			});

			await act(async () => {
				setNativeSelectionRange(inlineElement!, 0, inlineElement!, 0);
				inlineElement!.dispatchEvent(
					createKeyEvent("Backspace", { cancelable: true }),
				);
				await flushAnimationFrames(2);
			});

			expect(editor.getBlock(blockId)?.textContent()).toBe("");
			expect(editor.selection).toMatchObject({
				type: "text",
				anchor: { blockId, offset: 0 },
				focus: { blockId, offset: 0 },
			});

			await act(async () => {
				root.unmount();
			});
			container.remove();
			editor.destroy();
		} finally {
			(
				globalThis as typeof globalThis & {
					EditContext?: typeof FakeEditContext;
				}
			).EditContext = originalEditContext;
		}
	});

	it("keeps repeated cmd+a deletion working after retyping in EditContext", async () => {
		const originalEditContext = (
			globalThis as typeof globalThis & {
				EditContext?: typeof FakeEditContext;
			}
		).EditContext;
		(
			globalThis as typeof globalThis & {
				EditContext?: typeof FakeEditContext;
			}
		).EditContext = FakeEditContext;

		const editor = createEditor({ schema: defaultSchema });
		const blockId = editor.firstBlock()!.id;

		editor.apply([
			{ type: "splice-text", blockId, from: 0, to: 0, insert: "Title" },
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
			const inlineElement = container.querySelector(
				"[data-pen-inline-content]",
			) as
				| (HTMLElement & { editContext?: FakeEditContext | null })
				| null;

			expect(inlineElement).not.toBeNull();

			await act(async () => {
				fieldEditor.activateTextSelection(blockId, 2, 2);
				await flushAnimationFrames(2);
			});

			await act(async () => {
				inlineElement!.dispatchEvent(createSelectAllEvent());
				await flushAnimationFrames(2);
				inlineElement!.dispatchEvent(
					createKeyEvent("Backspace", { cancelable: true }),
				);
				await flushAnimationFrames(2);
			});

			expect(editor.getBlock(blockId)?.textContent()).toBe("");

			const editContext = inlineElement?.editContext;
			expect(editContext).toBeTruthy();

			await act(async () => {
				editContext!.emit("textupdate", {
					updateRangeStart: 0,
					updateRangeEnd: 0,
					text: "Again",
					selectionStart: 5,
					selectionEnd: 5,
				});
				await flushAnimationFrames(2);
			});

			expect(editor.getBlock(blockId)?.textContent()).toBe("Again");

			await act(async () => {
				inlineElement!.dispatchEvent(createSelectAllEvent());
				await flushAnimationFrames(2);
			});

			expect(editor.selection).toMatchObject({
				type: "text",
				anchor: { blockId, offset: 0 },
				focus: { blockId, offset: 5 },
			});

			await act(async () => {
				setNativeSelectionRange(inlineElement!, 0, inlineElement!, 0);
				inlineElement!.dispatchEvent(
					createKeyEvent("Backspace", { cancelable: true }),
				);
				await flushAnimationFrames(2);
			});

			expect(editor.getBlock(blockId)?.textContent()).toBe("");
			expect(editor.selection).toMatchObject({
				type: "text",
				anchor: { blockId, offset: 0 },
				focus: { blockId, offset: 0 },
			});

			await act(async () => {
				root.unmount();
			});
			container.remove();
			editor.destroy();
		} finally {
			(
				globalThis as typeof globalThis & {
					EditContext?: typeof FakeEditContext;
				}
			).EditContext = originalEditContext;
		}
	});
});
