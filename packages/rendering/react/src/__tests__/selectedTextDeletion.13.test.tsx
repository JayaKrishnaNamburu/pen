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
	it("reconciles expanded active blocks after replaceSelection commits", async () => {
		const editor = createEditor({ schema: defaultSchema });
		const firstBlockId = editor.firstBlock()!.id;
		const secondBlockId = crypto.randomUUID();

		editor.apply([
			{
				type: "splice-text",
				blockId: firstBlockId,
				from: 0,
				to: 0,
				insert: "Hello",
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
				insert: "World",
			},
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

		await act(async () => {
			fieldEditor.activate(firstBlockId);
			editor.selectTextRange(
				{ blockId: firstBlockId, offset: 1 },
				{ blockId: secondBlockId, offset: 2 },
			);
			await flushAnimationFrames(4);
		});

		await act(async () => {
			editor.replaceSelection("X");
			await flushAnimationFrames(4);
		});

		const inlineElements = Array.from(
			container.querySelectorAll("[data-pen-inline-content]"),
		) as HTMLElement[];

		expect(editor.getBlock(firstBlockId)?.textContent()).toBe("HXrld");
		expect(editor.getBlock(secondBlockId)).toBeNull();
		expect(inlineElements).toHaveLength(1);
		expect(inlineElements[0]?.textContent).toBe("HXrld");

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

	it("prevents native drag and drop on a single-block text selection", async () => {
		const editor = createEditor({ schema: defaultSchema });
		const blockId = editor.firstBlock()!.id;

		editor.apply([
			{ type: "splice-text", blockId, from: 0,
				to: 0,
				insert: "Hello world" },
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
		) as HTMLElement | null;

		expect(inlineElement).not.toBeNull();

		await act(async () => {
			fieldEditor.activateTextSelection(blockId, 1, 5);
			await flushAnimationFrames(2);
		});

		const dragStartEvent = new Event("dragstart", {
			bubbles: true,
			cancelable: true,
		});
		const dropEvent = new Event("drop", {
			bubbles: true,
			cancelable: true,
		});

		expect(inlineElement?.dispatchEvent(dragStartEvent)).toBe(false);
		expect(dragStartEvent.defaultPrevented).toBe(true);
		expect(inlineElement?.dispatchEvent(dropEvent)).toBe(false);
		expect(dropEvent.defaultPrevented).toBe(true);
		expect(editor.getBlock(blockId)?.textContent()).toBe("Hello world");

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

	it("keeps advancing the caret for EditContext textupdate events", async () => {
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
			{ type: "splice-text", blockId, from: 0,
				to: 0,
				insert: "Hello" },
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
			) as
				| (HTMLElement & { editContext?: FakeEditContext | null })
				| null;

			expect(rootElement).not.toBeNull();
			expect(inlineElement).not.toBeNull();

			await act(async () => {
				fieldEditor.activateTextSelection(blockId, 2, 2);
				await flushAnimationFrames(3);
			});

			const editContext = inlineElement?.editContext;
			expect(editContext).toBeTruthy();
			const originalUpdateText =
				editContext!.updateText.bind(editContext);
			editContext!.updateText = (start, end, text) => {
				originalUpdateText(start, end, text);
				editContext!.selectionStart = start;
				editContext!.selectionEnd = start;
			};

			await act(async () => {
				editContext!.emit("textupdate", {
					updateRangeStart: 2,
					updateRangeEnd: 2,
					text: "X",
					selectionStart: 3,
					selectionEnd: 3,
				});
				await flushAnimationFrames(2);
			});

			expect(editor.getBlock(blockId)?.textContent()).toBe("HeXllo");
			expect(editor.selection).toMatchObject({
				type: "text",
				anchor: { blockId, offset: 3 },
				focus: { blockId, offset: 3 },
				isCollapsed: true,
			});
			expect(domSelectionToEditor(rootElement!)).toMatchObject({
				anchor: { blockId, offset: 3 },
				focus: { blockId, offset: 3 },
			});

			await act(async () => {
				editContext!.emit("textupdate", {
					updateRangeStart: 3,
					updateRangeEnd: 3,
					text: "Y",
					selectionStart: 4,
					selectionEnd: 4,
				});
				await flushAnimationFrames(2);
			});

			expect(editor.getBlock(blockId)?.textContent()).toBe("HeXYllo");
			expect(editor.selection).toMatchObject({
				type: "text",
				anchor: { blockId, offset: 4 },
				focus: { blockId, offset: 4 },
				isCollapsed: true,
			});
			expect(domSelectionToEditor(rootElement!)).toMatchObject({
				anchor: { blockId, offset: 4 },
				focus: { blockId, offset: 4 },
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
