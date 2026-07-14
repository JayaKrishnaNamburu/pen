// @vitest-environment jsdom

import React, { act } from "react";
import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { createDecorationSet } from "@input/pen-core";
import { defineExtension } from "@input/pen-types";
import { domSelectionToEditor } from "../field-editor/selectionBridge";
import { Pen } from "../primitives/index";
import { FakeEditContext } from "./utils/fakeEditContext";
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
	it("reconciles repeated undo steps with EditContext while focus is on a toolbar button", async () => {
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

		try {
			const editor = createUndoSelectionDeletionEditor();
			const blockId = editor.firstBlock()!.id;

			editor.apply([
				{ type: "insert-text", blockId, offset: 0, text: "Hello" },
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
			const inlineElement = container.querySelector(
				"[data-pen-inline-content]",
			) as
				| (HTMLElement & { editContext?: FakeEditContext | null })
				| null;
			const toolbarButton = container.querySelector(
				"button",
			) as HTMLButtonElement | null;

			expect(inlineElement).not.toBeNull();
			expect(toolbarButton).not.toBeNull();

			await act(async () => {
				fieldEditor.activateTextSelection(blockId, 2, 2);
				await flushAnimationFrames(3);
			});

			const editContext = inlineElement?.editContext;
			expect(editContext).toBeTruthy();

			await act(async () => {
				editContext!.emit("textupdate", {
					updateRangeStart: 2,
					updateRangeEnd: 2,
					text: "X",
					selectionStart: 3,
					selectionEnd: 3,
				});
				await flushAnimationFrames(3);
			});

			await act(async () => {
				editor.undoManager.stopCapturing();
				editContext!.emit("textupdate", {
					updateRangeStart: 3,
					updateRangeEnd: 3,
					text: "Y",
					selectionStart: 4,
					selectionEnd: 4,
				});
				await flushAnimationFrames(3);
			});

			expect(editor.getBlock(blockId)?.textContent()).toBe("HeXYllo");
			expect(inlineElement?.textContent).toBe("HeXYllo");

			await act(async () => {
				toolbarButton!.focus();
				fieldEditor.setFocused(true);
				await flushAnimationFrames(1);
			});

			await act(async () => {
				editor.undoManager.undo();
				await flushAnimationFrames(4);
			});

			expect(editor.getBlock(blockId)?.textContent()).toBe("HeXllo");
			expect(inlineElement?.textContent).toBe("HeXllo");

			await act(async () => {
				editor.undoManager.undo();
				await flushAnimationFrames(4);
			});

			expect(editor.getBlock(blockId)?.textContent()).toBe("Hello");
			expect(inlineElement?.textContent).toBe("Hello");

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

	it("reconciles repeated undo steps on the active block with EditContext focus", async () => {
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

		try {
			const editor = createUndoSelectionDeletionEditor();
			const blockId = editor.firstBlock()!.id;

			editor.apply([
				{ type: "insert-text", blockId, offset: 0, text: "Hello" },
			]);

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

			const fieldEditor = getFieldEditor(editor);
			const inlineElement = container.querySelector(
				"[data-pen-inline-content]",
			) as
				| (HTMLElement & { editContext?: FakeEditContext | null })
				| null;

			expect(inlineElement).not.toBeNull();

			await act(async () => {
				fieldEditor.activateTextSelection(blockId, 2, 2);
				await flushAnimationFrames(3);
			});

			const editContext = inlineElement?.editContext;
			expect(editContext).toBeTruthy();

			await act(async () => {
				editContext!.emit("textupdate", {
					updateRangeStart: 2,
					updateRangeEnd: 2,
					text: "X",
					selectionStart: 3,
					selectionEnd: 3,
				});
				await flushAnimationFrames(3);
			});

			await act(async () => {
				editor.undoManager.stopCapturing();
				editContext!.emit("textupdate", {
					updateRangeStart: 3,
					updateRangeEnd: 3,
					text: "Y",
					selectionStart: 4,
					selectionEnd: 4,
				});
				await flushAnimationFrames(3);
			});

			expect(editor.getBlock(blockId)?.textContent()).toBe("HeXYllo");
			expect(inlineElement?.textContent).toBe("HeXYllo");

			await act(async () => {
				editor.undoManager.undo();
				await flushAnimationFrames(4);
			});

			expect(editor.getBlock(blockId)?.textContent()).toBe("HeXllo");
			expect(inlineElement?.textContent).toBe("HeXllo");

			await act(async () => {
				editor.undoManager.undo();
				await flushAnimationFrames(4);
			});

			expect(editor.getBlock(blockId)?.textContent()).toBe("Hello");
			expect(inlineElement?.textContent).toBe("Hello");

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
