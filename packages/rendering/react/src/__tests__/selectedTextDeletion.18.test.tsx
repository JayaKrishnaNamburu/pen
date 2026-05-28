// @vitest-environment jsdom

import React, { act } from "react";
import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import {
	createDecorationSet,
	createEditor as createCoreEditor,
} from "@pen/core";
import { defaultPreset } from "@pen/preset-default";
import { defineExtension } from "@pen/types";
import type { FieldEditorImpl } from "../field-editor/fieldEditorImpl";
import { FIELD_EDITOR_SLOT_KEY } from "../constants/fieldEditor";
import { domSelectionToEditor } from "../field-editor/selectionBridge";
import { Pen } from "../primitives/index";
import { FakeEditContext } from "./utils/fakeEditContext";

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

const SLOW_BEFOREINPUT_TEST_TIMEOUT_MS = 60_000;

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

function createSelectAllEvent(): KeyboardEvent {
	return createKeyEvent("a", {
		metaKey: true,
		cancelable: true,
	});
}

function createEditor(
	options: Parameters<typeof createCoreEditor>[0] = {},
): ReturnType<typeof createCoreEditor> {
	if (shouldUseSelectionDeletionPreset(options)) {
		const { without: _without, ...rest } = options;
		return createCoreEditor({
			...rest,
			preset: defaultPreset({
				documentOps: false,
				deltaStream: false,
				undo: false,
			}),
		});
	}

	if (usesLegacySelectionDeletionDefaults(options.without)) {
		const { without: _without, ...rest } = options;
		return createCoreEditor({
			...rest,
			preset: defaultPreset({
				documentOps: false,
				deltaStream: false,
				undo: false,
			}),
		});
	}

	return createCoreEditor(options);
}

function createUndoSelectionDeletionEditor(
	options: Parameters<typeof createCoreEditor>[0] = {},
): ReturnType<typeof createCoreEditor> {
	return createCoreEditor({
		...options,
		preset: defaultPreset({
			documentOps: false,
			deltaStream: false,
			undo: true,
		}),
	});
}

function shouldUseSelectionDeletionPreset(
	options: NonNullable<Parameters<typeof createCoreEditor>[0]>,
): boolean {
	return (
		options.without == null &&
		options.preset == null &&
		options.extensions == null
	);
}

function usesLegacySelectionDeletionDefaults(
	without: NonNullable<Parameters<typeof createCoreEditor>[0]>["without"],
): boolean {
	return (
		without?.length === 3 &&
		without[0] === "document-ops" &&
		without[1] === "delta-stream" &&
		without[2] === "undo"
	);
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

describe("@pen/react selected text deletion", () => {
	it("moves the DOM caret across blocks on undo and redo", async () => {
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

		const insertedBlockId =
			editor.selection?.type === "text"
				? editor.selection.focus.blockId
				: null;
		expect(insertedBlockId).toBeTruthy();
		expect(domSelectionToEditor(rootElement!)).toMatchObject({
			anchor: { blockId: insertedBlockId, offset: 0 },
			focus: { blockId: insertedBlockId, offset: 0 },
		});

		await act(async () => {
			editor.undoManager.undo();
			await flushAnimationFrames(4);
		});

		expect(editor.documentState.blockOrder).toEqual([blockId]);
		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId, offset: 5 },
			focus: { blockId, offset: 5 },
		});
		expect(domSelectionToEditor(rootElement!)).toMatchObject({
			anchor: { blockId, offset: 5 },
			focus: { blockId, offset: 5 },
		});

		await act(async () => {
			editor.undoManager.redo();
			await flushAnimationFrames(4);
		});

		const redoneBlockId =
			editor.selection?.type === "text"
				? editor.selection.focus.blockId
				: null;
		expect(redoneBlockId).toBeTruthy();
		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId: redoneBlockId, offset: 0 },
			focus: { blockId: redoneBlockId, offset: 0 },
		});
		expect(domSelectionToEditor(rootElement!)).toMatchObject({
			anchor: { blockId: redoneBlockId, offset: 0 },
			focus: { blockId: redoneBlockId, offset: 0 },
		});

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

	it("reconciles blurred active blocks during undo and redo", async () => {
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
		) as HTMLElement | null;

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
		expect(inlineElement?.textContent).toBe("HeXllo");

		await act(async () => {
			fieldEditor.setFocused(false);
			editor.undoManager.undo();
			await flushAnimationFrames(4);
		});

		expect(editor.getBlock(blockId)?.textContent()).toBe("Hello");
		expect(inlineElement?.textContent).toBe("Hello");

		await act(async () => {
			editor.undoManager.redo();
			await flushAnimationFrames(4);
		});

		expect(editor.getBlock(blockId)?.textContent()).toBe("HeXllo");
		expect(inlineElement?.textContent).toBe("HeXllo");

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

	it("reconciles repeated undo steps while focus is on a toolbar button", async () => {
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
		) as HTMLElement | null;
		const toolbarButton = container.querySelector(
			"button",
		) as HTMLButtonElement | null;

		expect(inlineElement).not.toBeNull();
		expect(toolbarButton).not.toBeNull();

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

		await act(async () => {
			editor.undoManager.stopCapturing();
			inlineElement!.dispatchEvent(
				new InputEvent("beforeinput", {
					bubbles: true,
					cancelable: true,
					inputType: "insertText",
					data: "Y",
				}),
			);
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
	});


});
