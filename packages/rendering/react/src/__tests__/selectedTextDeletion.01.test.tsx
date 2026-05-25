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
	it("keeps the active inline DOM synchronized after direct text input", async () => {
		const editor = createEditor();
		const blockId = editor.firstBlock()!.id;
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
			fieldEditor.activate(blockId);
			await flushAnimationFrames(2);
		});

		setNativeSelectionRange(inlineElement!, 0, inlineElement!, 0);

		await act(async () => {
			for (const character of "Hello") {
				inlineElement!.dispatchEvent(
					new InputEvent("beforeinput", {
						bubbles: true,
						cancelable: true,
						inputType: "insertText",
						data: character,
					}),
				);
			}
			await flushAnimationFrames(2);
		});

		expect(editor.getBlock(blockId)?.textContent()).toBe("Hello");
		expect(inlineElement!.textContent).toBe("Hello");

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

	it("keeps active inline text visible after a parent rerender", async () => {
		const editor = createEditor();
		const blockId = editor.firstBlock()!.id;
		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		function RerenderingEditor() {
			const [, setCommitCount] = React.useState(0);

			React.useEffect(
				() =>
					editor.onDocumentCommit(() =>
						setCommitCount((count) => count + 1),
					),
				[],
			);

			return (
				<Pen.Editor.Root editor={editor}>
					<Pen.Editor.Content />
				</Pen.Editor.Root>
			);
		}

		await act(async () => {
			root.render(<RerenderingEditor />);
		});

		const fieldEditor = getFieldEditor(editor);
		const inlineElement = container.querySelector(
			"[data-pen-inline-content]",
		) as HTMLElement | null;

		expect(inlineElement).not.toBeNull();

		await act(async () => {
			fieldEditor.activate(blockId);
			await flushAnimationFrames(2);
		});

		setNativeSelectionRange(inlineElement!, 0, inlineElement!, 0);

		await act(async () => {
			for (const character of "Hello") {
				inlineElement!.dispatchEvent(
					new InputEvent("beforeinput", {
						bubbles: true,
						cancelable: true,
						inputType: "insertText",
						data: character,
					}),
				);
				await flushAnimationFrames(1);
			}
			await flushAnimationFrames(2);
		});

		expect(editor.getBlock(blockId)?.textContent()).toBe("Hello");
		expect(inlineElement!.textContent).toBe("Hello");

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

	it("reconciles active inline decorations when text is unchanged", async () => {
		let decorationState = "initial";
		const editor = createEditor({
			extensions: [
				defineExtension({
					name: "active-inline-decoration-test",
					decorations(_state, currentEditor) {
						const firstBlock = currentEditor.firstBlock();
						if (!firstBlock || firstBlock.length() === 0) {
							return createDecorationSet([]);
						}

						return createDecorationSet([
							{
								type: "inline",
								blockId: firstBlock.id,
								from: 0,
								to: firstBlock.length(),
								attributes: {
									"data-decoration-state": decorationState,
								},
							},
						]);
					},
				}),
			],
		});
		const blockId = editor.firstBlock()!.id;
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
			fieldEditor.activate(blockId);
			await flushAnimationFrames(2);
		});

		setNativeSelectionRange(inlineElement!, 0, inlineElement!, 0);

		await act(async () => {
			for (const character of "Hello") {
				inlineElement!.dispatchEvent(
					new InputEvent("beforeinput", {
						bubbles: true,
						cancelable: true,
						inputType: "insertText",
						data: character,
					}),
				);
			}
			await flushAnimationFrames(2);
		});

		expect(
			inlineElement!.querySelector('[data-decoration-state="initial"]'),
		).not.toBeNull();

		decorationState = "updated";
		await act(async () => {
			editor.requestDecorationUpdate();
			await flushAnimationFrames(2);
		});

		expect(inlineElement!.textContent).toBe("Hello");
		expect(
			inlineElement!.querySelector('[data-decoration-state="updated"]'),
		).not.toBeNull();

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

	it("falls back to contenteditable when EditContext is unavailable", async () => {
		const originalEditContext = (
			globalThis as typeof globalThis & {
				EditContext?: typeof FakeEditContext;
			}
		).EditContext;
		(
			globalThis as typeof globalThis & {
				EditContext?: typeof FakeEditContext;
			}
		).EditContext = undefined;

		const editor = createEditor();
		const blockId = editor.firstBlock()!.id;
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
			const inlineElement = container.querySelector(
				"[data-pen-inline-content]",
			) as
				| (HTMLElement & { editContext?: FakeEditContext | null })
				| null;
			const rootElement = container.querySelector(
				"[data-pen-editor-root]",
			) as HTMLElement | null;

			expect(inlineElement).not.toBeNull();
			expect(rootElement).not.toBeNull();

			await act(async () => {
				fieldEditor.activate(blockId);
				await flushAnimationFrames(2);
			});

			expect(inlineElement!.editContext).toBeFalsy();
			expect(inlineElement!.contentEditable).toBe("true");

			setNativeSelectionRange(inlineElement!, 0, inlineElement!, 0);

			await act(async () => {
				for (const character of "Hey") {
					inlineElement!.dispatchEvent(
						new InputEvent("beforeinput", {
							bubbles: true,
							cancelable: true,
							inputType: "insertText",
							data: character,
						}),
					);
				}
				await flushAnimationFrames(2);
			});

			expect(editor.getBlock(blockId)?.textContent()).toBe("Hey");
			expect(inlineElement!.textContent).toBe("Hey");
			expect(editor.selection).toMatchObject({
				type: "text",
				anchor: { blockId, offset: 3 },
				focus: { blockId, offset: 3 },
			});
		} finally {
			await act(async () => {
				root.unmount();
			});
			container.remove();
			editor.destroy();
			(
				globalThis as typeof globalThis & {
					EditContext?: typeof FakeEditContext;
				}
			).EditContext = originalEditContext;
		}
	});


});
