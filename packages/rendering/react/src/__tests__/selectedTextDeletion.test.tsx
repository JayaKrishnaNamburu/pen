// @vitest-environment jsdom

import React, { act } from "react";
import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { createEditor } from "@pen/core";
import type { FieldEditorImpl } from "../field-editor/fieldEditorImpl.js";
import { FIELD_EDITOR_SLOT_KEY } from "../constants/fieldEditor.js";
import { domSelectionToEditor } from "../field-editor/selectionBridge.js";
import { Pen } from "../primitives/index.js";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

async function flushAnimationFrames(count = 1): Promise<void> {
	for (let i = 0; i < count; i++) {
		await new Promise<void>((resolve) => {
			requestAnimationFrame(() => resolve());
		});
	}
}

function createKeyEvent(
	key: string,
	options: KeyboardEventInit = {},
): KeyboardEvent {
	return new KeyboardEvent("keydown", {
		key,
		bubbles: true,
		...options,
	});
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

class FakeEditContext {
	text: string;
	selectionStart: number;
	selectionEnd: number;
	private listeners = new Map<string, Set<(event: any) => void>>();

	constructor(options?: {
		text?: string;
		selectionStart?: number;
		selectionEnd?: number;
	}) {
		this.text = options?.text ?? "";
		this.selectionStart = options?.selectionStart ?? 0;
		this.selectionEnd = options?.selectionEnd ?? 0;
	}

	updateText(start: number, end: number, text: string): void {
		this.text = this.text.slice(0, start) + text + this.text.slice(end);
	}

	updateSelection(start: number, end: number): void {
		this.selectionStart = start;
		this.selectionEnd = end;
	}

	updateCharacterBounds(_start: number, _rects: DOMRect[]): void {
		// no-op for tests
	}

	addEventListener(type: string, handler: (event: any) => void): void {
		let handlers = this.listeners.get(type);
		if (!handlers) {
			handlers = new Set();
			this.listeners.set(type, handlers);
		}
		handlers.add(handler);
	}

	removeEventListener(type: string, handler: (event: any) => void): void {
		this.listeners.get(type)?.delete(handler);
	}

	emit(type: string, event: any): void {
		for (const handler of this.listeners.get(type) ?? []) {
			handler(event);
		}
	}
}

describe("@pen/react selected text deletion", () => {
	it("preserves the full native selection on mouseup after a word select gesture", async () => {
		const editor = createEditor({
			without: ["document-ops", "delta-stream", "undo"],
		});
		const blockId = editor.firstBlock()!.id;

		editor.apply([
			{ type: "insert-text", blockId, offset: 0, text: "Hello world" },
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
			fieldEditor.activate(blockId);
			await flushAnimationFrames(2);
		});

		const originalCaretRangeFromPoint = (
			document as Document & {
				caretRangeFromPoint?: (x: number, y: number) => Range | null;
			}
		).caretRangeFromPoint;

		try {
			(
				document as Document & {
					caretRangeFromPoint?: (x: number, y: number) => Range | null;
				}
			).caretRangeFromPoint = () => {
				const range = document.createRange();
				range.setStart(inlineElement!.firstChild ?? inlineElement!, 2);
				range.collapse(true);
				return range;
			};

			await act(async () => {
				inlineElement!.dispatchEvent(
					new MouseEvent("mousedown", {
						bubbles: true,
						button: 0,
						clientX: 12,
						clientY: 8,
					}),
				);

				const selection = document.getSelection();
				const range = document.createRange();
				range.setStart(inlineElement!.firstChild ?? inlineElement!, 0);
				range.setEnd(inlineElement!.firstChild ?? inlineElement!, 5);
				selection?.removeAllRanges();
				selection?.addRange(range);

				document.dispatchEvent(
					new MouseEvent("mouseup", {
						bubbles: true,
						button: 0,
						clientX: 12,
						clientY: 8,
					}),
				);
				await flushAnimationFrames(3);
			});
		} finally {
			(
				document as Document & {
					caretRangeFromPoint?: (x: number, y: number) => Range | null;
				}
			).caretRangeFromPoint = originalCaretRangeFromPoint;
		}

		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId, offset: 0 },
			focus: { blockId, offset: 5 },
			isCollapsed: false,
		});
		expect(domSelectionToEditor(rootElement!)).toMatchObject({
			anchor: { blockId, offset: 0 },
			focus: { blockId, offset: 5 },
		});

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

	it("collapses backspace deletion to the normalized range start", async () => {
		const editor = createEditor({
			without: ["document-ops", "delta-stream", "undo"],
		});
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
		const rootElement = container.querySelector(
			"[data-pen-editor-root]",
		) as HTMLElement | null;
		const inlineElement = container.querySelector(
			"[data-pen-inline-content]",
		) as HTMLElement | null;

		expect(rootElement).not.toBeNull();
		expect(inlineElement).not.toBeNull();

		await act(async () => {
			fieldEditor.activate(blockId);
			await flushAnimationFrames(1);
		});

		await act(async () => {
			const selection = document.getSelection();
			const range = document.createRange();
			range.setStart(inlineElement!.firstChild ?? inlineElement!, 1);
			range.setEnd(inlineElement!.firstChild ?? inlineElement!, 4);

			selection?.removeAllRanges();
			selection?.addRange(range);
			document.dispatchEvent(new Event("selectionchange"));
			await flushAnimationFrames(1);
		});

		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId, offset: 1 },
			focus: { blockId, offset: 4 },
			isCollapsed: false,
			isMultiBlock: false,
		});

		await act(async () => {
			inlineElement!.dispatchEvent(
				new InputEvent("beforeinput", {
					bubbles: true,
					cancelable: true,
					inputType: "deleteContentBackward",
				}),
			);
			await flushAnimationFrames(2);
		});

		expect(editor.getBlock(blockId)?.textContent()).toBe("Ho");
		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId, offset: 1 },
			focus: { blockId, offset: 1 },
			isCollapsed: true,
			isMultiBlock: false,
		});
		expect(domSelectionToEditor(rootElement!)).toMatchObject({
			anchor: { blockId, offset: 1 },
			focus: { blockId, offset: 1 },
		});

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

	it("keeps advancing the caret across consecutive insertText events", async () => {
		const editor = createEditor({
			without: ["document-ops", "delta-stream", "undo"],
		});
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
			isCollapsed: true,
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
	});

	it("moves the caret into the inserted block after Enter at block end", async () => {
		const editor = createEditor({
			without: ["document-ops", "delta-stream", "undo"],
		});
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
		const rootElement = container.querySelector(
			"[data-pen-editor-root]",
		) as HTMLElement | null;
		const inlineElement = container.querySelector(
			"[data-pen-inline-content]",
		) as HTMLElement | null;

		expect(rootElement).not.toBeNull();
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

		const blockIds = editor.documentState.blockOrder;
		const newBlockId = blockIds[1];

		expect(newBlockId).toBeTruthy();
		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId: newBlockId, offset: 0 },
			focus: { blockId: newBlockId, offset: 0 },
			isCollapsed: true,
			isMultiBlock: false,
		});
		expect(domSelectionToEditor(rootElement!)).toMatchObject({
			anchor: { blockId: newBlockId, offset: 0 },
			focus: { blockId: newBlockId, offset: 0 },
		});

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

	it("deletes a promoted cross-block selection from document keydown", async () => {
		const editor = createEditor({
			without: ["document-ops", "delta-stream", "undo"],
		});
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
			document.dispatchEvent(createKeyEvent("Backspace"));
			await flushAnimationFrames(4);
		});

		expect(editor.getBlock(firstBlockId)?.textContent()).toBe("Hrld");
		expect(editor.getBlock(secondBlockId)).toBeNull();
		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId: firstBlockId, offset: 1 },
			focus: { blockId: firstBlockId, offset: 1 },
			isCollapsed: true,
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

	it("prevents native drag and drop on a single-block text selection", async () => {
		const editor = createEditor({
			without: ["document-ops", "delta-stream", "undo"],
		});
		const blockId = editor.firstBlock()!.id;

		editor.apply([
			{ type: "insert-text", blockId, offset: 0, text: "Hello world" },
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

		const editor = createEditor({
			without: ["document-ops", "delta-stream", "undo"],
		});
		const blockId = editor.firstBlock()!.id;

		editor.apply([
			{ type: "insert-text", blockId, offset: 0, text: "Hello" },
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

	it("restores logical selection on undo and redo", async () => {
		const editor = createEditor({
			without: ["document-ops", "delta-stream"],
		});
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
			await flushAnimationFrames(3);
		});

		expect(editor.getBlock(blockId)?.textContent()).toBe("HeXllo");
		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId, offset: 3 },
			focus: { blockId, offset: 3 },
		});

		await act(async () => {
			editor.undoManager.undo();
			await flushAnimationFrames(4);
		});

		expect(editor.getBlock(blockId)?.textContent()).toBe("Hello");
		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId, offset: 2 },
			focus: { blockId, offset: 2 },
		});
		expect(domSelectionToEditor(rootElement!)).toMatchObject({
			anchor: { blockId, offset: 2 },
			focus: { blockId, offset: 2 },
		});

		await act(async () => {
			editor.undoManager.redo();
			await flushAnimationFrames(4);
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
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});
});
