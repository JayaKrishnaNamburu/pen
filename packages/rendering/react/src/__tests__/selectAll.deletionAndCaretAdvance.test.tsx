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
describe("@input/pen-react cmd+a: deletion and caret advance", () => {
	it(
		"resets an empty heading to paragraph on backspace keydown",
		async () => {
			const editor = createEditor({ schema: defaultSchema });
			const blockId = editor.firstBlock()!.id;

			editor.apply([
				{ type: "set-props", blockId, props: { type: "heading" } },
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
			const inlineElement = container.querySelector(
				"[data-pen-inline-content]",
			) as HTMLElement | null;

			expect(rootElement).not.toBeNull();
			expect(inlineElement).not.toBeNull();

			await act(async () => {
				fieldEditor.activateTextSelection(blockId, 0, 0);
				await flushAnimationFrames(3);
			});

			await act(async () => {
				inlineElement!.dispatchEvent(
					createKeyEvent("Backspace", { cancelable: true }),
				);
				await flushAnimationFrames(2);
			});

			expect(editor.getBlock(blockId)?.type).toBe("paragraph");
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
		},
		SLOW_BEFOREINPUT_TEST_TIMEOUT_MS,
	);

	it("deletes every top-level block after two cmd+a presses in flow documents", async () => {
		const editor = createEditor({
			schema: defaultSchema,
			documentProfile: "flow",
		});
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
		const inlineElement = container.querySelector(
			"[data-pen-inline-content]",
		) as HTMLElement | null;
		const rootElement = container.querySelector(
			"[data-pen-editor-root]",
		) as HTMLElement | null;

		expect(inlineElement).not.toBeNull();
		expect(rootElement).not.toBeNull();

		await act(async () => {
			fieldEditor.activateTextSelection(firstBlockId, 2, 2);
			await flushAnimationFrames(2);
		});

		await act(async () => {
			inlineElement!.dispatchEvent(createSelectAllEvent());
			await flushAnimationFrames(2);
		});

		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId: firstBlockId, offset: 0 },
			focus: { blockId: secondBlockId, offset: 5 },
		});

		await act(async () => {
			inlineElement!.dispatchEvent(createSelectAllEvent());
			await flushAnimationFrames(2);
		});

		expect(editor.selection).toEqual({
			type: "block",
			blockIds: [firstBlockId, secondBlockId],
			head: secondBlockId,
		});

		await act(async () => {
			inlineElement!.dispatchEvent(
				createKeyEvent("Backspace", { cancelable: true }),
			);
			await flushAnimationFrames(4);
		});

		expect(editor.blockCount()).toBe(0);
		expect(editor.getBlock(firstBlockId)).toBeNull();
		expect(editor.selection).toBeNull();

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

	it("keeps an editable expanded surface after one content-first cmd+a", async () => {
		const editor = createEditor({
			schema: defaultSchema,
			documentProfile: "flow",
		});
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
		const inlineElement = container.querySelector(
			"[data-pen-inline-content]",
		) as HTMLElement | null;
		expect(inlineElement).not.toBeNull();

		await act(async () => {
			fieldEditor.activateTextSelection(firstBlockId, 2, 2);
			await flushAnimationFrames(2);
		});

		await act(async () => {
			inlineElement!.dispatchEvent(createSelectAllEvent());
			await flushAnimationFrames(2);
		});

		expect(fieldEditor.getSnapshot()).toMatchObject({
			activeBlockIds: [firstBlockId, secondBlockId],
			isEditing: true,
			inputMode: "richtext",
			mode: "expanded",
		});

		await act(async () => {
			inlineElement!.dispatchEvent(
				createKeyEvent("Backspace", { cancelable: true }),
			);
			await flushAnimationFrames(4);
		});

		expect(editor.getBlock(firstBlockId)?.textContent()).toBe("");
		expect(editor.getBlock(secondBlockId)).toBeNull();

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

	it("keeps advancing the caret across consecutive insertText events", async () => {
		const editor = createEditor({ schema: defaultSchema });
		const blockId = editor.firstBlock()!.id;

		editor.apply([
			{ type: "splice-text", blockId, from: 0, to: 0, insert: "Hello" },
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
		const inlineElement = container.querySelector(
			"[data-pen-inline-content]",
		) as HTMLElement | null;

		expect(rootElement).not.toBeNull();
		expect(inlineElement).not.toBeNull();

		await act(async () => {
			fieldEditor.activateTextSelection(blockId, 2, 2);
			await flushAnimationFrames(3);
		});

		await act(async () => {
			inlineElement!.dispatchEvent(
				new InputEvent("beforeinput", {
					bubbles: true,
					cancelable: true,
					inputType: "insertText",
					data: "X",
				}),
			);
			await flushAnimationFrames(2);
		});

		expect(editor.getBlock(blockId)?.textContent()).toBe("HeXllo");
		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId, offset: 3 },
			focus: { blockId, offset: 3 },
		});
		expect(domSelectionToEditor(rootElement!)).toMatchObject({
			anchor: { blockId, offset: 3 },
			focus: { blockId, offset: 3 },
		});

		await act(async () => {
			inlineElement!.dispatchEvent(
				new InputEvent("beforeinput", {
					bubbles: true,
					cancelable: true,
					inputType: "insertText",
					data: "Y",
				}),
			);
			await flushAnimationFrames(2);
		});

		expect(editor.getBlock(blockId)?.textContent()).toBe("HeXYllo");
		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId, offset: 4 },
			focus: { blockId, offset: 4 },
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
	});
});
