// @vitest-environment jsdom

import React, { act } from "react";
import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { createDecorationSet } from "@input/pen-core";
import { defineExtension } from "@input/pen-core";
import { domSelectionToEditor } from "@input/pen-dom/field-editor/selectionBridge";
import { Pen } from "../primitives/index";
import { FakeEditContext } from "./utils/fakeEditContext";
import { defaultSchema } from "@input/pen-schema-default";
import {
	createEditor,
	createKeyEvent,
	createSelectAllEvent,
	createUndoSelectionDeletionEditor,
	flushAnimationFrames,
	getFieldEditor,
	setNativeSelectionRange,
	SLOW_BEFOREINPUT_TEST_TIMEOUT_MS,
} from "./utils/selectionDeletionTestHelpers";
describe("@input/pen-react selected text deletion", () => {
	it("converts '3. ' into a numbered list item via EditContext textupdate", async () => {
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
			) as
				| (HTMLElement & { editContext?: FakeEditContext | null })
				| null;

			expect(rootElement).not.toBeNull();
			expect(inlineElement).not.toBeNull();

			await act(async () => {
				fieldEditor.activateTextSelection(blockId, 0, 0);
				await flushAnimationFrames(3);
			});

			const editContext = inlineElement?.editContext;
			expect(editContext).toBeTruthy();

			await act(async () => {
				editContext!.emit("textupdate", {
					updateRangeStart: 0,
					updateRangeEnd: 0,
					text: "3",
					selectionStart: 1,
					selectionEnd: 1,
				});
				await flushAnimationFrames(2);
			});

			await act(async () => {
				editContext!.emit("textupdate", {
					updateRangeStart: 1,
					updateRangeEnd: 1,
					text: ".",
					selectionStart: 2,
					selectionEnd: 2,
				});
				await flushAnimationFrames(2);
			});

			await act(async () => {
				editContext!.emit("textupdate", {
					updateRangeStart: 2,
					updateRangeEnd: 2,
					text: " ",
					selectionStart: 3,
					selectionEnd: 3,
				});
				await flushAnimationFrames(2);
			});

			expect(editor.getBlock(blockId)?.type).toBe("numberedListItem");
			expect(editor.getBlock(blockId)?.props?.start).toBe(3);
			expect(editor.getBlock(blockId)?.textContent()).toBe("");
			expect(editor.selection).toMatchObject({
				type: "text",
				anchor: { blockId, offset: 0 },
				focus: { blockId, offset: 0 },
			});
			expect(domSelectionToEditor(rootElement!)).toMatchObject({
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

	it("deletes a selected word on Backspace in EditContext when cached selection is stale", async () => {
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
			{ type: "splice-text", blockId, from: 0, to: 0, insert: "Hello" },
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
				fieldEditor.activateTextSelection(blockId, 1, 4);
				await flushAnimationFrames(3);
			});

			const editContext = inlineElement?.editContext;
			expect(editContext).toBeTruthy();

			await act(async () => {
				editContext!.updateSelection(4, 4);
				setNativeSelectionRange(inlineElement!, 1, inlineElement!, 4);
				inlineElement!.dispatchEvent(
					createKeyEvent("Backspace", { cancelable: true }),
				);
				await flushAnimationFrames(2);
			});

			expect(editor.getBlock(blockId)?.textContent()).toBe("Ho");
			expect(editor.selection).toMatchObject({
				type: "text",
				anchor: { blockId, offset: 1 },
				focus: { blockId, offset: 1 },
			});
			expect(editContext?.selectionStart).toBe(1);
			expect(editContext?.selectionEnd).toBe(1);

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

	it("deletes a first cmd+a selection on Backspace in EditContext when cached selection is stale", async () => {
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
			});

			const editContext = inlineElement?.editContext;
			expect(editContext).toBeTruthy();

			await act(async () => {
				editContext!.updateSelection(5, 5);
				setNativeSelectionRange(inlineElement!, 0, inlineElement!, 5);
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
			expect(editContext?.selectionStart).toBe(0);
			expect(editContext?.selectionEnd).toBe(0);

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
