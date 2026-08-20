// @vitest-environment jsdom

import React, { act } from "react";
import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { createDecorationSet } from "@input/pen-core";
import { defineExtension } from "@input/pen-core";
import { domSelectionToEditor } from "../field-editor/selectionBridge";
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
	it("uses the editor caret when EditContext reports a stale collapsed insert range", async () => {
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
			const inlineElement = container.querySelector(
				"[data-pen-inline-content]",
			) as
				| (HTMLElement & { editContext?: FakeEditContext | null })
				| null;
			const rootElement = container.querySelector(
				"[data-pen-editor-root]",
			) as HTMLElement | null;

			expect(inlineElement).not.toBeNull();
			expect(rootElement).not.toBeNull();

			await act(async () => {
				fieldEditor.activateTextSelection(blockId, 0, 0);
				await flushAnimationFrames(2);
			});

			const editContext = inlineElement?.editContext;
			expect(editContext).toBeTruthy();

			await act(async () => {
				editContext!.emit("textupdate", {
					updateRangeStart: 0,
					updateRangeEnd: 0,
					text: "H",
					selectionStart: 0,
					selectionEnd: 0,
				});
				await flushAnimationFrames(2);
				setNativeSelectionRange(inlineElement!, 0, inlineElement!, 0);
				document.dispatchEvent(new Event("selectionchange"));
				await flushAnimationFrames(2);
			});
			expect(domSelectionToEditor(rootElement!)).toMatchObject({
				anchor: { blockId, offset: 1 },
				focus: { blockId, offset: 1 },
			});

			await act(async () => {
				editContext!.emit("textupdate", {
					updateRangeStart: 1,
					updateRangeEnd: 1,
					text: "e",
					selectionStart: 1,
					selectionEnd: 1,
				});
				await flushAnimationFrames(2);
			});

			expect(editor.selection).toMatchObject({
				type: "text",
				anchor: { blockId, offset: 2 },
				focus: { blockId, offset: 2 },
			});
			await act(async () => {
				fieldEditor.syncTextSelection(blockId, 1, 1);
				await flushAnimationFrames(1);
			});
			expect(editor.selection).toMatchObject({
				type: "text",
				anchor: { blockId, offset: 1 },
				focus: { blockId, offset: 1 },
			});

			await act(async () => {
				editContext!.emit("textupdate", {
					updateRangeStart: 1,
					updateRangeEnd: 1,
					text: "y",
					selectionStart: 1,
					selectionEnd: 1,
				});
				await flushAnimationFrames(2);
			});

			expect(editor.getBlock(blockId)?.textContent()).toBe("Hey");
			expect(inlineElement!.textContent).toBe("Hey");
			expect(editor.selection).toMatchObject({
				type: "text",
				anchor: { blockId, offset: 3 },
				focus: { blockId, offset: 3 },
			});
			expect(domSelectionToEditor(rootElement!)).toMatchObject({
				anchor: { blockId, offset: 3 },
				focus: { blockId, offset: 3 },
			});
			expect(editContext?.selectionStart).toBe(3);
			expect(editContext?.selectionEnd).toBe(3);

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

	it("treats the initial zero-width placeholder as offset zero for EditContext input", async () => {
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
		editor.apply(
			[{ type: "insert-text", blockId, offset: 0, text: "\u200B" }],
			{ origin: "import" },
		);
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
			const rootElement = container.querySelector(
				"[data-pen-editor-root]",
			) as HTMLElement | null;

			expect(inlineElement).not.toBeNull();
			expect(rootElement).not.toBeNull();

			await act(async () => {
				fieldEditor.activateTextSelection(blockId, 1, 1);
				await flushAnimationFrames(2);
			});

			const editContext = inlineElement?.editContext;
			expect(editContext).toBeTruthy();
			expect(editContext?.text).toBe("");
			expect(editContext?.selectionStart).toBe(0);
			expect(editContext?.selectionEnd).toBe(0);

			await act(async () => {
				editContext!.emit("textupdate", {
					updateRangeStart: 1,
					updateRangeEnd: 1,
					text: "H",
					selectionStart: 1,
					selectionEnd: 1,
				});
				await flushAnimationFrames(2);
				setNativeSelectionRange(inlineElement!, 0, inlineElement!, 0);
				document.dispatchEvent(new Event("selectionchange"));
				await flushAnimationFrames(2);
			});
			expect(domSelectionToEditor(rootElement!)).toMatchObject({
				anchor: { blockId, offset: 1 },
				focus: { blockId, offset: 1 },
			});

			await act(async () => {
				editContext!.emit("textupdate", {
					updateRangeStart: 0,
					updateRangeEnd: 0,
					text: "e",
					selectionStart: 0,
					selectionEnd: 0,
				});
				await flushAnimationFrames(2);
				setNativeSelectionRange(inlineElement!, 0, inlineElement!, 0);
				document.dispatchEvent(new Event("selectionchange"));
				await flushAnimationFrames(2);
			});
			expect(domSelectionToEditor(rootElement!)).toMatchObject({
				anchor: { blockId, offset: 2 },
				focus: { blockId, offset: 2 },
			});

			await act(async () => {
				editContext!.emit("textupdate", {
					updateRangeStart: 0,
					updateRangeEnd: 0,
					text: "y",
					selectionStart: 0,
					selectionEnd: 0,
				});
				await flushAnimationFrames(2);
				setNativeSelectionRange(inlineElement!, 0, inlineElement!, 0);
				document.dispatchEvent(new Event("selectionchange"));
				await flushAnimationFrames(2);
			});

			expect(editor.getBlock(blockId)?.textContent()).toBe("Hey");
			expect(inlineElement!.textContent).toBe("Hey");
			expect(editor.selection).toMatchObject({
				type: "text",
				anchor: { blockId, offset: 3 },
				focus: { blockId, offset: 3 },
			});
			expect(domSelectionToEditor(rootElement!)).toMatchObject({
				anchor: { blockId, offset: 3 },
				focus: { blockId, offset: 3 },
			});
			expect(editContext?.selectionStart).toBe(3);
			expect(editContext?.selectionEnd).toBe(3);

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
