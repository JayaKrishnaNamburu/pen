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
	it("reconciles history changes for passive blocks outside activeBlockIds", async () => {
		const editor = createUndoSelectionDeletionEditor();
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
					<button type="button">Undo</button>
					<Pen.Editor.Content />
				</Pen.Editor.Root>,
			);
		});

		const fieldEditor = getFieldEditor(editor);
		const inlineElements = Array.from(
			container.querySelectorAll("[data-pen-inline-content]"),
		) as HTMLElement[];
		const secondInlineElement = inlineElements[1] ?? null;
		const toolbarButton = container.querySelector(
			"button",
		) as HTMLButtonElement | null;

		expect(secondInlineElement).not.toBeNull();
		expect(toolbarButton).not.toBeNull();

		await act(async () => {
			fieldEditor.activateTextSelection(firstBlockId, 5, 5);
			await flushAnimationFrames(3);
		});

		expect(fieldEditor.getSnapshot()).toMatchObject({
			focusBlockId: firstBlockId,
			activeBlockIds: [firstBlockId],
			mode: "single",
		});

		await act(async () => {
			editor.apply(
				[
					{
						type: "insert-text",
						blockId: secondBlockId,
						offset: 6,
						text: "!",
					},
				],
				{ origin: "user" },
			);
			await flushAnimationFrames(3);
		});

		expect(editor.getBlock(secondBlockId)?.textContent()).toBe("Second!");
		expect(secondInlineElement?.textContent).toBe("Second!");

		await act(async () => {
			toolbarButton!.focus();
			fieldEditor.setFocused(true);
			await flushAnimationFrames(1);
		});

		await act(async () => {
			editor.undoManager.undo();
			await flushAnimationFrames(4);
		});

		expect(fieldEditor.getSnapshot()).toMatchObject({
			focusBlockId: firstBlockId,
			activeBlockIds: [firstBlockId],
			mode: "single",
		});
		expect(editor.getBlock(secondBlockId)?.textContent()).toBe("Second");
		expect(secondInlineElement?.textContent).toBe("Second");

		await act(async () => {
			editor.undoManager.redo();
			await flushAnimationFrames(4);
		});

		expect(fieldEditor.getSnapshot()).toMatchObject({
			focusBlockId: firstBlockId,
			activeBlockIds: [firstBlockId],
			mode: "single",
		});
		expect(editor.getBlock(secondBlockId)?.textContent()).toBe("Second!");
		expect(secondInlineElement?.textContent).toBe("Second!");

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

	it("reconciles repeated history changes outside activeBlockIds during expanded editing", async () => {
		const editor = createUndoSelectionDeletionEditor();
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
					<button type="button">Undo</button>
					<Pen.Editor.Content />
				</Pen.Editor.Root>,
			);
		});

		const fieldEditor = getFieldEditor(editor);
		const inlineElements = Array.from(
			container.querySelectorAll("[data-pen-inline-content]"),
		) as HTMLElement[];
		const thirdInlineElement = inlineElements[2] ?? null;
		const toolbarButton = container.querySelector(
			"button",
		) as HTMLButtonElement | null;

		expect(thirdInlineElement).not.toBeNull();
		expect(toolbarButton).not.toBeNull();

		await act(async () => {
			fieldEditor.activate(firstBlockId);
			editor.selectTextRange(
				{ blockId: firstBlockId, offset: 0 },
				{ blockId: secondBlockId, offset: 6 },
			);
			await flushAnimationFrames(4);
		});

		expect(fieldEditor.getSnapshot()).toMatchObject({
			focusBlockId: firstBlockId,
			activeBlockIds: [firstBlockId, secondBlockId],
			mode: "expanded",
		});

		await act(async () => {
			editor.apply(
				[
					{
						type: "insert-text",
						blockId: thirdBlockId,
						offset: 5,
						text: "!",
					},
				],
				{ origin: "user" },
			);
			await flushAnimationFrames(3);
		});

		await act(async () => {
			editor.undoManager.stopCapturing();
			editor.apply(
				[
					{
						type: "insert-text",
						blockId: thirdBlockId,
						offset: 6,
						text: "?",
					},
				],
				{ origin: "user" },
			);
			await flushAnimationFrames(3);
		});

		expect(editor.getBlock(thirdBlockId)?.textContent()).toBe("Third!?");
		expect(thirdInlineElement?.textContent).toBe("Third!?");

		await act(async () => {
			toolbarButton!.focus();
			fieldEditor.setFocused(true);
			await flushAnimationFrames(1);
		});

		await act(async () => {
			editor.undoManager.undo();
			await flushAnimationFrames(4);
		});

		expect(fieldEditor.getSnapshot()).toMatchObject({
			focusBlockId: firstBlockId,
			activeBlockIds: [firstBlockId, secondBlockId],
			mode: "expanded",
		});
		expect(editor.getBlock(thirdBlockId)?.textContent()).toBe("Third!");
		expect(thirdInlineElement?.textContent).toBe("Third!");

		await act(async () => {
			editor.undoManager.undo();
			await flushAnimationFrames(4);
		});

		expect(editor.getBlock(thirdBlockId)?.textContent()).toBe("Third");
		expect(thirdInlineElement?.textContent).toBe("Third");

		await act(async () => {
			editor.undoManager.redo();
			await flushAnimationFrames(4);
		});

		expect(editor.getBlock(thirdBlockId)?.textContent()).toBe("Third!");
		expect(thirdInlineElement?.textContent).toBe("Third!");

		await act(async () => {
			editor.undoManager.redo();
			await flushAnimationFrames(4);
		});

		expect(editor.getBlock(thirdBlockId)?.textContent()).toBe("Third!?");
		expect(thirdInlineElement?.textContent).toBe("Third!?");

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

});
