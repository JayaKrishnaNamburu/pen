// @vitest-environment jsdom

import React, { act } from "react";
import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import {
	createEditor as createCoreEditor,
	DocumentRangeImpl,
	ensureInlineCompletionController,
} from "@pen/core";
import { defaultPreset } from "@pen/preset-default";
import type { FieldEditorImpl } from "../field-editor/fieldEditorImpl";
import { Pen } from "../primitives/index";
import { FIELD_EDITOR_SLOT_KEY } from "../constants/fieldEditor";
import {
	domSelectionToEditor,
	editorSelectionToDOM,
} from "../field-editor/selectionBridge";
import { FakeEditContext } from "./utils/fakeEditContext";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function createEditor(options: Parameters<typeof createCoreEditor>[0] = {}) {
	const { without: _without, ...restOptions } = options;
	return createCoreEditor({
		...restOptions,
		preset: defaultPreset({
			documentOps: false,
			deltaStream: false,
			undo: false,
		}),
	});
}

function createEscapeEvent(): KeyboardEvent {
	return new KeyboardEvent("keydown", {
		key: "Escape",
		bubbles: true,
	});
}

function createSelectAllEvent(): KeyboardEvent {
	return new KeyboardEvent("keydown", {
		key: "a",
		metaKey: true,
		bubbles: true,
		cancelable: true,
	});
}

async function flushAnimationFrames(count = 1): Promise<void> {
	for (let i = 0; i < count; i++) {
		await new Promise<void>((resolve) => {
			requestAnimationFrame(() => resolve());
		});
	}
}

function getFieldEditor(
	editor: ReturnType<typeof createEditor>,
): FieldEditorImpl {
	const fieldEditor = editor.internals.getSlot<FieldEditorImpl>(
		FIELD_EDITOR_SLOT_KEY,
	);
	if (!fieldEditor) {
		throw new Error("Missing attached field editor");
	}
	return fieldEditor;
}

function setNativeSelectionRange(
	startElement: HTMLElement,
	startOffset: number,
	endElement: HTMLElement,
	endOffset: number,
): void {
	const selection = document.getSelection();
	const range = document.createRange();
	range.setStart(startElement.firstChild ?? startElement, startOffset);
	range.setEnd(endElement.firstChild ?? endElement, endOffset);
	selection?.removeAllRanges();
	selection?.addRange(range);
}

function createMouseUpEvent(clientX = 40, clientY = 40): MouseEvent {
	return new MouseEvent("mouseup", {
		bubbles: true,
		clientX,
		clientY,
	});
}

describe("@pen/react escape key handling", () => {
	it("re-homes the active field editor when native selection moves into another block", async () => {
		const editor = createEditor();
		const firstBlockId = editor.firstBlock()!.id;
		const secondBlockId = crypto.randomUUID();

		editor.apply([
			{
				type: "insert-text",
				blockId: firstBlockId,
				offset: 0,
				text: "Hello",
			},
			{
				type: "insert-block",
				blockId: secondBlockId,
				blockType: "paragraph",
				props: {},
				position: { after: firstBlockId },
			},
			{
				type: "insert-text",
				blockId: secondBlockId,
				offset: 0,
				text: "World",
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
		const inlineElements = container.querySelectorAll(
			"[data-pen-inline-content]",
		);
		const secondInlineElement = inlineElements[1] as
			| HTMLElement
			| undefined;

		expect(rootElement).not.toBeNull();
		expect(secondInlineElement).toBeDefined();

		await act(async () => {
			fieldEditor.activate(firstBlockId);
			editor.selectTextRange(
				{ blockId: firstBlockId, offset: 0 },
				{ blockId: firstBlockId, offset: 0 },
			);
			await flushAnimationFrames(2);
		});

		await act(async () => {
			const selection = document.getSelection();
			const range = document.createRange();
			range.setStart(
				secondInlineElement!.firstChild ?? secondInlineElement!,
				1,
			);
			range.setEnd(
				secondInlineElement!.firstChild ?? secondInlineElement!,
				1,
			);
			selection?.removeAllRanges();
			selection?.addRange(range);
			document.dispatchEvent(new Event("selectionchange"));
			await flushAnimationFrames(3);
		});

		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId: secondBlockId, offset: 1 },
			focus: { blockId: secondBlockId, offset: 1 },
			isCollapsed: true,
		});
		expect(fieldEditor.getSnapshot()).toMatchObject({
			focusBlockId: secondBlockId,
			activeBlockIds: [secondBlockId],
			isEditing: true,
			mode: "single",
		});
		expect(domSelectionToEditor(rootElement!)).toMatchObject({
			anchor: { blockId: secondBlockId, offset: 1 },
			focus: { blockId: secondBlockId, offset: 1 },
		});

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

	it("maps cmd+a from block selection directly to full-document selection in flow documents", async () => {
		const editor = createEditor({
			documentProfile: "flow",
		});
		const firstBlockId = editor.firstBlock()!.id;
		const secondBlockId = crypto.randomUUID();
		const thirdBlockId = crypto.randomUUID();

		editor.apply([
			{
				type: "insert-text",
				blockId: firstBlockId,
				offset: 0,
				text: "First",
			},
			{
				type: "insert-block",
				blockId: secondBlockId,
				blockType: "paragraph",
				props: {},
				position: { after: firstBlockId },
			},
			{
				type: "insert-text",
				blockId: secondBlockId,
				offset: 0,
				text: "Second",
			},
			{
				type: "insert-block",
				blockId: thirdBlockId,
				blockType: "paragraph",
				props: {},
				position: { after: secondBlockId },
			},
			{
				type: "insert-text",
				blockId: thirdBlockId,
				offset: 0,
				text: "Third",
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
				{ blockId: firstBlockId, offset: 0 },
				{ blockId: firstBlockId, offset: 2 },
			);
			await flushAnimationFrames(2);
		});

		await act(async () => {
			document.dispatchEvent(createSelectAllEvent());
			await flushAnimationFrames(2);
		});

		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId: firstBlockId, offset: 0 },
			focus: { blockId: thirdBlockId, offset: 5 },
			isMultiBlock: true,
		});
		expect(fieldEditor.getSnapshot()).toMatchObject({
			focusBlockId: firstBlockId,
			activeBlockIds: [firstBlockId, secondBlockId, thirdBlockId],
			isEditing: true,
			mode: "expanded",
		});

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

	it("maps cmd+a from an empty block directly to full-document selection in flow documents", async () => {
		const editor = createEditor({
			documentProfile: "flow",
		});
		const firstBlockId = editor.firstBlock()!.id;
		const secondBlockId = crypto.randomUUID();
		const thirdBlockId = crypto.randomUUID();

		editor.apply([
			{
				type: "insert-block",
				blockId: secondBlockId,
				blockType: "paragraph",
				props: {},
				position: { after: firstBlockId },
			},
			{
				type: "insert-text",
				blockId: secondBlockId,
				offset: 0,
				text: "Second",
			},
			{
				type: "insert-block",
				blockId: thirdBlockId,
				blockType: "paragraph",
				props: {},
				position: { after: secondBlockId },
			},
			{
				type: "insert-text",
				blockId: thirdBlockId,
				offset: 0,
				text: "Third",
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
			await flushAnimationFrames(2);
		});

		await act(async () => {
			document.dispatchEvent(createSelectAllEvent());
			await flushAnimationFrames(2);
		});

		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId: firstBlockId, offset: 0 },
			focus: { blockId: thirdBlockId, offset: 5 },
			isMultiBlock: true,
		});
		expect(fieldEditor.getSnapshot()).toMatchObject({
			focusBlockId: firstBlockId,
			activeBlockIds: [firstBlockId, secondBlockId, thirdBlockId],
			isEditing: true,
			mode: "expanded",
		});

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});


});
