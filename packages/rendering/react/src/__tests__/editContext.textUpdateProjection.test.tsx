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
describe("@input/pen-react EditContext: textupdate selection projection", () => {
	it("updates EditContext text before projecting the post-insert selection", async () => {
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

		const editor = createEditor({ schema: defaultSchema });
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

			expect(inlineElement).not.toBeNull();

			await act(async () => {
				fieldEditor.activateTextSelection(blockId, 0, 0);
				await flushAnimationFrames(2);
			});

			const editContext = inlineElement?.editContext;
			expect(editContext).toBeTruthy();
			const calls: string[] = [];
			const originalUpdateText =
				editContext!.updateText.bind(editContext);
			const originalUpdateSelection =
				editContext!.updateSelection.bind(editContext);
			editContext!.updateText = (start, end, text) => {
				calls.push(
					`dom-before-text:${inlineElement!.textContent ?? ""}`,
				);
				calls.push(`text:${start}:${end}:${text}`);
				originalUpdateText(start, end, text);
			};
			editContext!.updateSelection = (start, end) => {
				calls.push(`selection:${start}:${end}`);
				originalUpdateSelection(start, end);
			};

			await act(async () => {
				editContext!.emit("textupdate", {
					updateRangeStart: 0,
					updateRangeEnd: 0,
					text: "H",
					selectionStart: 0,
					selectionEnd: 0,
				});
				await flushAnimationFrames(2);
			});

			const textUpdateIndex = calls.indexOf("text:0:0:H");
			const postInsertSelectionIndex = calls.indexOf("selection:1:1");
			expect(calls).toContain("dom-before-text:H");
			expect(textUpdateIndex).toBeGreaterThanOrEqual(0);
			expect(postInsertSelectionIndex).toBeGreaterThan(textUpdateIndex);
			expect(editor.getBlock(blockId)?.textContent()).toBe("H");
			expect(editor.selection).toMatchObject({
				type: "text",
				anchor: { blockId, offset: 1 },
				focus: { blockId, offset: 1 },
			});
			expect(editContext?.selectionStart).toBe(1);
			expect(editContext?.selectionEnd).toBe(1);

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

	it("ignores stale native selectionchange while projecting the EditContext caret", async () => {
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

		const editor = createEditor({ schema: defaultSchema });
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

			expect(inlineElement).not.toBeNull();

			await act(async () => {
				fieldEditor.activateTextSelection(blockId, 0, 0);
				await flushAnimationFrames(2);
			});

			const editContext = inlineElement?.editContext;
			expect(editContext).toBeTruthy();

			await act(async () => {
				editContext!.emit("textupdate", {
					updateRangeStart: 0,
					updateRangeEnd: 0,
					text: "H",
					selectionStart: 0,
					selectionEnd: 0,
				});
				setNativeSelectionRange(inlineElement!, 0, inlineElement!, 0);
				document.dispatchEvent(new Event("selectionchange"));
				await flushAnimationFrames(2);
			});

			expect(editor.getBlock(blockId)?.textContent()).toBe("H");
			expect(editor.selection).toMatchObject({
				type: "text",
				anchor: { blockId, offset: 1 },
				focus: { blockId, offset: 1 },
			});
			expect(editContext?.selectionStart).toBe(1);
			expect(editContext?.selectionEnd).toBe(1);

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

	it("applies inline markdown input rules for EditContext textupdate events", async () => {
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

		const editor = createEditor({ schema: defaultSchema });
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

			expect(inlineElement).not.toBeNull();

			await act(async () => {
				fieldEditor.activateTextSelection(blockId, 0, 0);
				await flushAnimationFrames(3);
			});

			const editContext = inlineElement?.editContext;
			expect(editContext).toBeTruthy();

			const updates = ["*", "*", "h", "e", "y", "*", "*"];
			for (const [index, text] of updates.entries()) {
				await act(async () => {
					editContext!.emit("textupdate", {
						updateRangeStart: index,
						updateRangeEnd: index,
						text,
						selectionStart: index + 1,
						selectionEnd: index + 1,
					});
					await flushAnimationFrames(2);
					await Promise.resolve();
					await Promise.resolve();
				});
			}

			expect(editor.getBlock(blockId)?.textContent()).toBe("hey");
			expect(editor.getBlock(blockId)?.textDeltas()).toEqual([
				{
					insert: "hey",
					attributes: { bold: true },
				},
			]);

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
});
