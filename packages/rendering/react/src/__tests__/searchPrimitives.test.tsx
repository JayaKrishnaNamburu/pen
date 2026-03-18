// @vitest-environment jsdom

import React, { act } from "react";
import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { createEditor } from "@pen/core";
import { defaultPreset } from "@pen/preset-default";
import { searchExtension } from "@pen/search";
import { Pen } from "../primitives/index";
import type { FieldEditorImpl } from "../field-editor/fieldEditorImpl";
import { FIELD_EDITOR_SLOT_KEY } from "../constants/fieldEditor";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

async function flushAnimationFrames(count = 1): Promise<void> {
	for (let index = 0; index < count; index++) {
		await new Promise<void>((resolve) => {
			requestAnimationFrame(() => resolve());
		});
	}
}

function getFieldEditor(editor: ReturnType<typeof createEditor>): FieldEditorImpl {
	const fieldEditor = editor.internals.getSlot<FieldEditorImpl>(FIELD_EDITOR_SLOT_KEY);
	if (!fieldEditor) {
		throw new Error("Missing attached field editor");
	}
	return fieldEditor;
}

describe("@pen/react search primitives", () => {
	it("updates search state from the input and renders results", async () => {
		const editor = createEditor({
			extensions: [searchExtension()],
		});
		const blockId = editor.firstBlock()!.id;

		editor.apply(
			[
				{
					type: "insert-text",
					blockId,
					offset: 0,
					text: "alpha beta alpha",
				},
			],
			{ origin: "user" },
		);

		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		await act(async () => {
			root.render(
				<Pen.Search.Root editor={editor}>
					<Pen.Search.Input />
					<Pen.Search.Results />
					<Pen.Search.Next>Next</Pen.Search.Next>
				</Pen.Search.Root>,
			);
		});

		const input = container.querySelector(
			"[data-pen-search-input]",
		) as HTMLInputElement | null;
		expect(input).not.toBeNull();

		await act(async () => {
			const setter = Object.getOwnPropertyDescriptor(
				HTMLInputElement.prototype,
				"value",
			)?.set;
			setter?.call(input, "alpha");
			input?.dispatchEvent(
				new InputEvent("input", {
					bubbles: true,
					cancelable: true,
					data: "alpha",
					inputType: "insertText",
				}),
			);
		});

		const results = container.querySelector("[data-pen-search-results]");
		expect(results?.textContent).toBe("1 of 2 matches");

		const nextButton = container.querySelector(
			"[data-pen-search-navigation][data-option='next']",
		) as HTMLButtonElement | null;
		await act(async () => {
			nextButton?.click();
		});

		expect(results?.getAttribute("data-active-index")).toBe("1");

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

	it("keeps focus on the search input while query updates refresh decorations", async () => {
		const editor = createEditor({
			preset: defaultPreset({
				documentOps: false,
				deltaStream: false,
				undo: false,
			}),
			extensions: [searchExtension()],
		});
		const blockId = editor.firstBlock()!.id;

		editor.apply(
			[
				{
					type: "insert-text",
					blockId,
					offset: 0,
					text: "alpha beta alpha",
				},
			],
			{ origin: "user" },
		);

		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		await act(async () => {
			root.render(
				<Pen.Editor.Root editor={editor}>
					<div>
						<Pen.Search.Root editor={editor}>
							<Pen.Search.Input />
							<Pen.Search.Results />
						</Pen.Search.Root>
						<Pen.Editor.Content />
					</div>
				</Pen.Editor.Root>,
			);
		});

		const fieldEditor = getFieldEditor(editor);
		const input = container.querySelector(
			"[data-pen-search-input]",
		) as HTMLInputElement | null;
		expect(input).not.toBeNull();

		await act(async () => {
			fieldEditor.activateTextSelection(blockId, 0, 0);
			await flushAnimationFrames(2);
		});

		await act(async () => {
			input?.focus();
		});
		expect(document.activeElement).toBe(input);

		await act(async () => {
			const setter = Object.getOwnPropertyDescriptor(
				HTMLInputElement.prototype,
				"value",
			)?.set;
			setter?.call(input, "alpha");
			input?.dispatchEvent(
				new InputEvent("input", {
					bubbles: true,
					cancelable: true,
					data: "alpha",
					inputType: "insertText",
				}),
			);
			await flushAnimationFrames(2);
		});

		expect(document.activeElement).toBe(input);

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});
});
