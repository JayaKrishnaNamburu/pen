// @vitest-environment jsdom

import React, { act } from "react";
import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import {
	createEditor as createCoreEditor,
	DocumentRangeImpl,
} from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";
import type { FieldEditorImpl } from "@input/pen-dom/field-editor/fieldEditorImpl";
import { Pen } from "../primitives/index";
import { FIELD_EDITOR_SLOT_KEY } from "../constants/fieldEditor";
import {
	domSelectionToEditor,
	editorSelectionToDOM,
} from "@input/pen-dom/field-editor/selectionBridge";
import { defaultSchema } from "@input/pen-schema-default";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function createEditor(options: Parameters<typeof createCoreEditor>[0] = {}) {
	return createCoreEditor({
		schema: defaultSchema,
		...options,
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

describe("@input/pen-react escape key handling", () => {
	it("preserves backwards same-block selection direction when collapsing", async () => {
		const editor = createEditor();
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
		expect(
			inlineElement?.hasAttribute("data-pen-field-editor-active-surface"),
		).toBe(false);

		await act(async () => {
			fieldEditor.activate(blockId);
			editor.setSelection(
				new DocumentRangeImpl(
					{ blockId, offset: 5 },
					{ blockId, offset: 2 },
					editor.internals.doc,
				).toTextSelection(),
			);
			editorSelectionToDOM(
				rootElement!,
				{ blockId, offset: 5 },
				{ blockId, offset: 2 },
			);
		});

		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId, offset: 5 },
			focus: { blockId, offset: 2 },
			isCollapsed: false,
		});
		expect(domSelectionToEditor(rootElement!)).toMatchObject({
			anchor: { blockId, offset: 5 },
			focus: { blockId, offset: 2 },
		});
		expect(
			inlineElement?.hasAttribute("data-pen-field-editor-active-surface"),
		).toBe(true);

		await act(async () => {
			rootElement?.dispatchEvent(createEscapeEvent());
			await flushAnimationFrames(2);
		});

		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId, offset: 2 },
			focus: { blockId, offset: 2 },
			isCollapsed: true,
		});
		expect(domSelectionToEditor(rootElement!)).toMatchObject({
			anchor: { blockId, offset: 2 },
			focus: { blockId, offset: 2 },
		});

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

	it("walks the selection ladder from range to caret to block to clear", async () => {
		const editor = createEditor();
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
		const blockElement = container.querySelector(
			`[data-block-id="${blockId}"]`,
		) as HTMLElement | null;
		const inlineElement = container.querySelector(
			"[data-pen-inline-content]",
		) as HTMLElement | null;

		expect(rootElement).not.toBeNull();
		expect(blockElement).not.toBeNull();
		expect(inlineElement).not.toBeNull();

		await act(async () => {
			fieldEditor.activate(blockId);
			editor.selectTextRange(
				{ blockId, offset: 0 },
				{ blockId, offset: 5 },
			);
		});

		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId, offset: 0 },
			focus: { blockId, offset: 5 },
			isCollapsed: false,
		});

		await act(async () => {
			rootElement?.dispatchEvent(createEscapeEvent());
			await flushAnimationFrames(2);
		});

		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId, offset: 5 },
			focus: { blockId, offset: 5 },
			isCollapsed: true,
		});
		expect(domSelectionToEditor(rootElement!)).toMatchObject({
			anchor: { blockId, offset: 5 },
			focus: { blockId, offset: 5 },
		});
		expect(fieldEditor.getSnapshot()).toMatchObject({
			focusBlockId: blockId,
			isEditing: true,
			mode: "single",
		});

		await act(async () => {
			rootElement?.dispatchEvent(createEscapeEvent());
		});

		expect(editor.selection).toEqual({
			type: "block",
			blockIds: [blockId],
			head: blockId,
		});
		expect(fieldEditor.getSnapshot()).toMatchObject({
			focusBlockId: null,
			isEditing: false,
			mode: "inactive",
		});
		expect(document.activeElement).toBe(blockElement);

		await act(async () => {
			blockElement?.dispatchEvent(createEscapeEvent());
		});

		expect(editor.selection).toBeNull();
		expect(document.activeElement).toBe(blockElement);

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

	it("ignores Escape while composition is active", async () => {
		const editor = createEditor();
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
			fieldEditor.activateTextSelection(blockId, 0, 5);
			await flushAnimationFrames(2);
		});

		await act(async () => {
			inlineElement?.dispatchEvent(
				new CompositionEvent("compositionstart", { bubbles: true }),
			);
		});

		expect(fieldEditor.getSnapshot()).toMatchObject({
			focusBlockId: blockId,
			isComposing: true,
			isEditing: true,
			mode: "single",
		});

		await act(async () => {
			rootElement?.dispatchEvent(createEscapeEvent());
			await flushAnimationFrames(2);
		});

		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId, offset: 0 },
			focus: { blockId, offset: 5 },
			isCollapsed: false,
		});
		expect(fieldEditor.getSnapshot()).toMatchObject({
			focusBlockId: blockId,
			isComposing: true,
			isEditing: true,
			mode: "single",
		});

		await act(async () => {
			inlineElement?.dispatchEvent(
				new CompositionEvent("compositionend", { bubbles: true }),
			);
			await flushAnimationFrames(2);
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});
});
