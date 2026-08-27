// @vitest-environment jsdom

import React, { act } from "react";
import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { createDecorationSet } from "@input/pen-core";
import { defineExtension } from "@input/pen-core";
import { domSelectionToEditor } from "@input/pen-dom/field-editor/selectionBridge";
import { Pen } from "../primitives/index";
import { FakeEditContext } from "./utils/fakeEditContext";
import { defaultSchema } from "@input/pen-schema";
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
describe("@input/pen-react Enter: block selections and list continuation", () => {
	it("inserts a paragraph on Enter from a selected content-first flow paragraph", async () => {
		const editor = createEditor({
			schema: defaultSchema,
			documentProfile: "flow",
		});
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
					<Pen.Editor.Root editor={editor} editorViewMode="flow">
						<Pen.Editor.Content />
					</Pen.Editor.Root>,
				);
			});

			const rootElement = container.querySelector(
				"[data-pen-editor-root]",
			) as HTMLElement | null;
			expect(rootElement).not.toBeNull();

			await act(async () => {
				editor.selectBlock(blockId);
				rootElement!.focus();
				rootElement!.dispatchEvent(
					createKeyEvent("Enter", { cancelable: true }),
				);
				await flushAnimationFrames(4);
			});

			const blockIds = editor.documentState.blockOrder;
			const newBlockId = blockIds[1];

			expect(blockIds).toHaveLength(2);
			expect(blockIds[0]).toBe(blockId);
			expect(editor.getBlock(blockId)?.textContent()).toBe("Hello");
			expect(editor.getBlock(newBlockId!)?.textContent()).toBe("");
			expect(editor.selection).toMatchObject({
				type: "text",
				anchor: { blockId: newBlockId, offset: 0 },
				focus: { blockId: newBlockId, offset: 0 },
			});
		} finally {
			await act(async () => {
				root.unmount();
			});
			container.remove();
			editor.destroy();
		}
	});

	it("re-enters text editing on Enter from a single selected block-first flow paragraph", async () => {
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

		const editor = createEditor({
			schema: defaultSchema,
			documentProfile: "flow",
		});
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
					<Pen.Editor.Root
						editor={editor}
						editorViewMode="flow"
						interactionModel="block-first"
					>
						<Pen.Editor.Content />
					</Pen.Editor.Root>,
				);
			});

			const rootElement = container.querySelector(
				"[data-pen-editor-root]",
			) as HTMLElement | null;
			const inlineElement = container.querySelector(
				"[data-pen-inline-content]",
			) as HTMLElement | null;

			expect(rootElement).not.toBeNull();
			expect(inlineElement).not.toBeNull();

			await act(async () => {
				editor.selectBlock(blockId);
				rootElement!.focus();
				rootElement!.dispatchEvent(
					createKeyEvent("Enter", { cancelable: true }),
				);
				await flushAnimationFrames(4);
			});

			expect(editor.documentState.blockOrder).toEqual([blockId]);
			expect(editor.selection).toMatchObject({
				type: "text",
				anchor: { blockId, offset: 5 },
				focus: { blockId, offset: 5 },
			});

			const activeInlineElement = container.querySelector(
				"[data-pen-inline-content][data-pen-field-editor-active-surface]",
			) as HTMLElement | null;
			expect(activeInlineElement).not.toBeNull();

			await act(async () => {
				document.dispatchEvent(
					createKeyEvent("Backspace", { cancelable: true }),
				);
				await flushAnimationFrames(2);
			});

			expect(editor.documentState.blockOrder).toEqual([blockId]);
			expect(editor.getBlock(blockId)?.textContent()).toBe("Hello");
		} finally {
			(
				globalThis as typeof globalThis & {
					EditContext?: typeof FakeEditContext;
				}
			).EditContext = originalEditContext;
			await act(async () => {
				root.unmount();
			});
			container.remove();
			editor.destroy();
		}
	});

	it("shows the next ordered-list marker after Enter continues a numbered list", async () => {
		const editor = createEditor({ schema: defaultSchema });
		const blockId = editor.firstBlock()!.id;

		editor.apply([
			{
				type: "set-props",
				blockId,
				props: { type: "numberedListItem", start: 3 },
			},
			{ type: "splice-text", blockId, from: 0, to: 0, insert: "Third" },
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
			fieldEditor.activateTextSelection(blockId, 5, 5);
			await flushAnimationFrames(4);
		});

		await act(async () => {
			inlineElement!.dispatchEvent(
				new InputEvent("beforeinput", {
					bubbles: true,
					cancelable: true,
					inputType: "insertParagraph",
				}),
			);
			await flushAnimationFrames(4);
		});

		const markerTexts = Array.from(
			container.querySelectorAll(
				"[data-pen-list-item-layout][data-block-type='numberedListItem'] [data-pen-list-marker]",
			),
		).map((marker) => marker.textContent ?? "");

		expect(markerTexts).toEqual(["3.", "4."]);

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

	it("deletes a promoted cross-block selection from document keydown", async () => {
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
		const rootElement = container.querySelector(
			"[data-pen-editor-root]",
		) as HTMLElement | null;

		expect(rootElement).not.toBeNull();

		await act(async () => {
			fieldEditor.activate(firstBlockId);
			editor.selectTextRange(
				{ blockId: firstBlockId, offset: 1 },
				{ blockId: secondBlockId, offset: 2 },
			);
			await flushAnimationFrames(4);
		});

		await act(async () => {
			document.getSelection()?.removeAllRanges();
			rootElement!.focus();
			await flushAnimationFrames(1);
		});

		await act(async () => {
			document.dispatchEvent(createKeyEvent("Backspace"));
			await flushAnimationFrames(4);
		});

		expect(editor.getBlock(firstBlockId)?.textContent()).toBe("Hrld");
		expect(editor.getBlock(secondBlockId)).toBeNull();
		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId: firstBlockId, offset: 1 },
			focus: { blockId: firstBlockId, offset: 1 },
		});
		expect(domSelectionToEditor(rootElement!)).toMatchObject({
			anchor: { blockId: firstBlockId, offset: 1 },
			focus: { blockId: firstBlockId, offset: 1 },
		});

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});
});
