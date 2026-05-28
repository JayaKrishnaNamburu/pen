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
	it("maps cmd+a from a collapsed EditContext selection via the root handler", async () => {
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
				fieldEditor.activateTextSelection(firstBlockId, 1, 1);
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

	it("uses document-first cmd+a by default for content-first structured documents", async () => {
		const editor = createEditor();
		const firstBlockId = editor.firstBlock()!.id;
		const secondBlockId = crypto.randomUUID();

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
			fieldEditor.activateTextSelection(firstBlockId, 0, 5);
			await flushAnimationFrames(2);
		});

		await act(async () => {
			document.dispatchEvent(createSelectAllEvent());
			await flushAnimationFrames(2);
		});

		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId: firstBlockId, offset: 0 },
			focus: { blockId: secondBlockId, offset: 6 },
			isMultiBlock: true,
		});

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

	it("uses block-first cmd+a when block-first interaction is enabled", async () => {
		const editor = createEditor();
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
				<Pen.Editor.Root editor={editor} interactionModel="block-first">
					<Pen.Editor.Content />
				</Pen.Editor.Root>,
			);
		});

		const fieldEditor = getFieldEditor(editor);
		await act(async () => {
			fieldEditor.activateTextSelection(firstBlockId, 1, 1);
			await flushAnimationFrames(2);
		});

		await act(async () => {
			document.dispatchEvent(createSelectAllEvent());
			await flushAnimationFrames(2);
		});

		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId: firstBlockId, offset: 0 },
			focus: { blockId: firstBlockId, offset: 5 },
			isMultiBlock: false,
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

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

	it("keeps cmd+a block-scoped before selecting the document when a block is selected in block-first mode", async () => {
		const editor = createEditor();
		const firstBlockId = editor.firstBlock()!.id;
		const secondBlockId = crypto.randomUUID();

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
		]);

		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		await act(async () => {
			root.render(
				<Pen.Editor.Root editor={editor} interactionModel="block-first">
					<Pen.Editor.Content />
				</Pen.Editor.Root>,
			);
		});

		const editorRoot = container.querySelector(
			"[data-pen-editor-root]",
		) as HTMLElement | null;
		expect(editorRoot).not.toBeNull();

		await act(async () => {
			editor.selectBlock(firstBlockId);
			editorRoot?.focus();
			await flushAnimationFrames(2);
		});

		await act(async () => {
			document.dispatchEvent(createSelectAllEvent());
			await flushAnimationFrames(2);
		});

		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId: firstBlockId, offset: 0 },
			focus: { blockId: firstBlockId, offset: 5 },
			isMultiBlock: false,
		});

		await act(async () => {
			document.dispatchEvent(createSelectAllEvent());
			await flushAnimationFrames(2);
		});

		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId: firstBlockId, offset: 0 },
			focus: { blockId: secondBlockId, offset: 6 },
			isMultiBlock: true,
		});

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});


});
