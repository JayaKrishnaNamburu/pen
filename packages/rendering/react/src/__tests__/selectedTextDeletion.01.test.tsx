// @vitest-environment jsdom

import React, { act } from "react";
import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { createDecorationSet } from "@input/pen-core";
import { defineExtension } from "@input/pen-core";
import { domSelectionToEditor } from "../field-editor/selectionBridge";
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
describe("@input/pen-react selected text deletion", () => {
	it("keeps the active inline DOM synchronized after direct text input", async () => {
		const editor = createEditor({ schema: defaultSchema });
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
		const editor = createEditor({ schema: defaultSchema });
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
			schema: defaultSchema,extensions: [
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
