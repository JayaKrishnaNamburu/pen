// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { createEditor } from "@pen/core";
import { defaultPreset } from "@pen/preset-default";
import { createDefaultSchema } from "@pen/schema-default";
import {
	moveInlineAtom,
	replaceInlineAtomWithText,
} from "@pen/dom/field-editor/inlineAtomInteraction";
import {
	getInlineAtomElementData,
	getLogicalTextContent,
	INLINE_ATOM_REPLACEMENT_TEXT,
} from "@pen/dom/field-editor/inlineAtomDom";
import {
	applyDeltaToDOM,
	fullReconcileDeltasToDOM,
} from "@pen/dom/field-editor/reconciler";
import { DATA_ATTRS } from "../utils/dataAttributes";
import { FieldEditorImpl } from "../field-editor/fieldEditorImpl";
import {
	domPointToOffset,
	domSelectionToEditor,
	editorSelectionToDOM,
	pointToEditorSelectionPoint,
} from "../field-editor/selectionBridge";
import { Pen } from "../primitives/index";

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

function createPresetEditor() {
	return createEditor({
		preset: defaultPreset({
			documentOps: false,
			deltaStream: false,
			undo: false,
		}),
	});
}

function seedInlineAtomDocument(editor: ReturnType<typeof createPresetEditor>) {
	const blockId = editor.firstBlock()!.id;
	editor.apply([
		{ type: "insert-text", blockId, offset: 0, text: "A" },
		{
			type: "insert-inline-node",
			blockId,
			offset: 1,
			nodeType: "mention",
			props: { id: "user-1", label: "Ada" },
		},
		{ type: "insert-text", blockId, offset: 2, text: "B" },
	]);
	return blockId;
}

function dispatchPointerEvent(
	target: EventTarget,
	type: string,
	options: MouseEventInit & { pointerId?: number } = {},
) {
	const PointerEventCtor = window.PointerEvent ?? MouseEvent;
	target.dispatchEvent(
		new PointerEventCtor(type, {
			bubbles: true,
			cancelable: true,
			...options,
		}) as PointerEvent,
	);
}

function createRect({
	left,
	right,
	top,
	bottom,
}: {
	left: number;
	right: number;
	top: number;
	bottom: number;
}): DOMRect {
	return {
		x: left,
		y: top,
		left,
		right,
		top,
		bottom,
		width: right - left,
		height: bottom - top,
		toJSON() {
			return {};
		},
	} as DOMRect;
}

describe("Pen inline atom editing", () => {
	it("maps atom-only pointer positions by chip geometry", () => {
		const root = document.createElement("div");
		const block = document.createElement("div");
		const inline = document.createElement("span");
		const atom = document.createElement("span");
		const originalElementFromPoint = document.elementFromPoint;

		block.setAttribute(DATA_ATTRS.editorBlock, "");
		block.setAttribute(DATA_ATTRS.blockId, "block-1");
		block.setAttribute(DATA_ATTRS.blockType, "paragraph");
		inline.setAttribute(DATA_ATTRS.inlineContent, "");
		atom.setAttribute(DATA_ATTRS.inlineAtom, "");
		atom.textContent = "Ada";
		inline.appendChild(atom);
		block.appendChild(inline);
		root.appendChild(block);
		document.body.appendChild(root);

		inline.getBoundingClientRect = () =>
			createRect({ left: 0, right: 120, top: 0, bottom: 24 });
		atom.getBoundingClientRect = () =>
			createRect({ left: 20, right: 80, top: 0, bottom: 24 });
		document.elementFromPoint = vi.fn(() => atom);

		try {
			expect(pointToEditorSelectionPoint(root, 25, 12)).toEqual({
				blockId: "block-1",
				offset: 0,
			});
			expect(pointToEditorSelectionPoint(root, 76, 12)).toEqual({
				blockId: "block-1",
				offset: 1,
			});
		} finally {
			document.elementFromPoint = originalElementFromPoint;
			root.remove();
		}
	});

	it("denies backend attachment when the focus policy rejects activation", () => {
		const editor = createPresetEditor();
		const blockId = editor.firstBlock()!.id;
		const fieldEditor = new FieldEditorImpl(editor, {
			focusPolicy: {
				decide: (request) =>
					request.action === "attach-backend"
						? { type: "deny" }
						: { type: "allow" },
			},
		});
		const root = document.createElement("div");
		const block = document.createElement("div");
		const inline = document.createElement("span");
		const focusSpy = vi.spyOn(inline, "focus");

		block.setAttribute(DATA_ATTRS.editorBlock, "");
		block.setAttribute(DATA_ATTRS.blockId, blockId);
		block.setAttribute(DATA_ATTRS.blockType, "paragraph");
		inline.setAttribute(DATA_ATTRS.inlineContent, "");
		block.appendChild(inline);
		root.appendChild(block);
		document.body.appendChild(root);
		fieldEditor.setRootElement(root);

		try {
			fieldEditor.activate(blockId);

			expect(
				(
					fieldEditor as unknown as {
						_attachedElement: HTMLElement | null;
					}
				)._attachedElement,
			).toBeNull();
			expect(focusSpy).not.toHaveBeenCalled();
		} finally {
			fieldEditor.destroy();
			root.remove();
			editor.destroy();
		}
	});

	it("uses focusPolicy decisions for passive selection projection", () => {
		const editor = createPresetEditor();
		const blockId = editor.firstBlock()!.id;
		const decide = vi.fn(() => ({ type: "allow-passive" as const }));
		const fieldEditor = new FieldEditorImpl(editor, {
			focusPolicy: {
				decide,
			},
		});
		const root = document.createElement("div");
		const block = document.createElement("div");
		const inline = document.createElement("span");
		const focusSpy = vi.spyOn(inline, "focus");

		block.setAttribute(DATA_ATTRS.editorBlock, "");
		block.setAttribute(DATA_ATTRS.blockId, blockId);
		block.setAttribute(DATA_ATTRS.blockType, "paragraph");
		inline.setAttribute(DATA_ATTRS.inlineContent, "");
		block.appendChild(inline);
		root.appendChild(block);
		document.body.appendChild(root);
		fieldEditor.setRootElement(root);

		try {
			fieldEditor.activate(blockId);
			expect(fieldEditor.requestDomFocus(inline, "selection-project")).toBe(
				true,
			);
			expect(focusSpy).not.toHaveBeenCalled();
			expect(decide).toHaveBeenCalledWith(
				expect.objectContaining({
					action: "attach-backend",
					blockId,
				}),
			);
			expect(decide).toHaveBeenCalledWith(
				expect.objectContaining({
					action: "project-selection",
					blockId,
				}),
			);
		} finally {
			fieldEditor.destroy();
			root.remove();
			editor.destroy();
		}
	});

	it("does not let a stale pending programmatic caret hide a newer user caret", async () => {
		const editor = createPresetEditor();
		const blockId = seedInlineAtomDocument(editor);
		const fieldEditor = new FieldEditorImpl(editor);
		const block = editor.getBlock(blockId)!;
		const endOffset = block.length();

		try {
			fieldEditor.commitProgrammaticTextSelection(blockId, 0, 0);
			fieldEditor.applyDomTextSelection(
				{ blockId, offset: endOffset },
				{ blockId, offset: endOffset },
			);

			expect(
				fieldEditor.shouldIgnoreDomTextSelection(
					{ blockId, offset: endOffset },
					{ blockId, offset: endOffset },
				),
			).toBe(false);
			expect(editor.selection).toMatchObject({
				type: "text",
				anchor: { blockId, offset: endOffset },
				focus: { blockId, offset: endOffset },
			});
			await flushAnimationFrames(1);
		} finally {
			fieldEditor.destroy();
			editor.destroy();
		}
	});

	it("renders inline nodes as logical atom elements", async () => {
		const editor = createPresetEditor();
		seedInlineAtomDocument(editor);
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
				await flushAnimationFrames(2);
			});

			const atom = container.querySelector(
				`[${DATA_ATTRS.inlineAtom}]`,
			) as HTMLElement | null;

			expect(atom).not.toBeNull();
			expect(atom?.getAttribute(DATA_ATTRS.inlineAtomType)).toBe(
				"mention",
			);
			expect(atom?.textContent).toBe("@Ada");
		} finally {
			await act(async () => {
				root.unmount();
			});
			container.remove();
			editor.destroy();
		}
	});

	it("renders inline atoms with configured React renderers", async () => {
		const editor = createPresetEditor();
		const blockId = seedInlineAtomDocument(editor);
		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		try {
			await act(async () => {
				root.render(
					<Pen.Editor.Root
						editor={editor}
						inlineAtomRenderers={{
							mention: ({ props, selected, text }) => (
								<span
									data-selected={selected ? "true" : "false"}
									data-testid="mention-renderer"
								>
									{props.label as string}:{text}
								</span>
							),
						}}
					>
						<Pen.Editor.Content />
					</Pen.Editor.Root>,
				);
				await flushAnimationFrames(2);
			});

			const atom = container.querySelector(
				`[${DATA_ATTRS.inlineAtom}]`,
			) as HTMLElement | null;
			const renderedAtom = container.querySelector(
				"[data-testid='mention-renderer']",
			);
			const inlineElement = container.querySelector(
				`[${DATA_ATTRS.inlineContent}]`,
			) as HTMLElement | null;

			expect(atom).not.toBeNull();
			expect(inlineElement).not.toBeNull();
			expect(renderedAtom?.textContent).toBe("Ada:@Ada");
			expect(renderedAtom?.getAttribute("data-selected")).toBe("false");
			expect(atom?.textContent).toBe("Ada:@Ada");
			expect(domPointToOffset(inlineElement!, atom!, 0)).toBe(1);
			expect(domPointToOffset(inlineElement!, atom!, 1)).toBe(2);
			expect(
				domPointToOffset(
					inlineElement!,
					renderedAtom?.firstChild ?? renderedAtom!,
					1,
				),
			).toBe(2);
			expect(getInlineAtomElementData(atom!)).toEqual({
				type: "mention",
				props: { id: "user-1", label: "Ada" },
				text: "@Ada",
			});

			await act(async () => {
				editor.selectTextRange(
					{ blockId, offset: 1 },
					{ blockId, offset: 2 },
				);
				await flushAnimationFrames(2);
			});

			expect(renderedAtom?.getAttribute("data-selected")).toBe("true");
			expect(atom?.hasAttribute(DATA_ATTRS.selected)).toBe(true);
		} finally {
			await act(async () => {
				root.unmount();
			});
			container.remove();
			editor.destroy();
		}
	});

	it("fires onAfterDestructure once after a successful wrapper double-click destructure", async () => {
		const editor = createPresetEditor();
		const blockId = seedInlineAtomDocument(editor);
		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);
		const onAfterDestructure = vi.fn();

		try {
			await act(async () => {
				root.render(
					<Pen.Editor.Root
						editor={editor}
						inlineAtomInteractions={{
							destructure: {
								mention: (atom) =>
									`${atom.props.label as string} <ada@example.com>`,
							},
							onAfterDestructure,
						}}
					>
						<Pen.Editor.Content />
					</Pen.Editor.Root>,
				);
				await flushAnimationFrames(2);
			});

			const atom = container.querySelector(
				`[${DATA_ATTRS.inlineAtom}]`,
			) as HTMLElement | null;
			expect(atom).not.toBeNull();

			await act(async () => {
				atom!.dispatchEvent(
					new MouseEvent("dblclick", {
						bubbles: true,
						cancelable: true,
					}),
				);
				await flushAnimationFrames(2);
			});

			expect(onAfterDestructure).toHaveBeenCalledTimes(1);
			expect(onAfterDestructure).toHaveBeenCalledWith({
				editor,
				atom: expect.objectContaining({
					blockId,
					offset: 1,
					type: "mention",
				}),
				blockId,
				startOffset: 1,
				endOffset: 22,
				text: "Ada <ada@example.com>",
			});
		} finally {
			await act(async () => {
				root.unmount();
			});
			container.remove();
			editor.destroy();
		}
	});

	it("destructures inline atoms from the Pen wrapper double-click handler", async () => {
		const editor = createPresetEditor();
		const blockId = seedInlineAtomDocument(editor);
		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		try {
			await act(async () => {
				root.render(
					<Pen.Editor.Root
						editor={editor}
						inlineAtomInteractions={{
							destructure: {
								mention: (atom) =>
									`${atom.props.label as string} <ada@example.com>`,
							},
						}}
					>
						<Pen.Editor.Content />
					</Pen.Editor.Root>,
				);
				await flushAnimationFrames(2);
			});

			const atom = container.querySelector(
				`[${DATA_ATTRS.inlineAtom}]`,
			) as HTMLElement | null;
			expect(atom).not.toBeNull();

			await act(async () => {
				atom!.dispatchEvent(
					new MouseEvent("dblclick", {
						bubbles: true,
						cancelable: true,
					}),
				);
				await flushAnimationFrames(2);
			});

			expect(editor.getBlock(blockId)?.inlineDeltas()).toEqual([
				{ insert: "AAda <ada@example.com>B" },
			]);
			expect(editor.selection).toMatchObject({
				type: "text",
				anchor: { blockId, offset: 22 },
				focus: { blockId, offset: 22 },
			});
		} finally {
			await act(async () => {
				root.unmount();
			});
			container.remove();
			editor.destroy();
		}
	});

	it("shows a Pen-owned preview and renderer drag state while dragging an inline atom", async () => {
		const editor = createPresetEditor();
		seedInlineAtomDocument(editor);
		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);
		const documentWithCaret = document as Document & {
			caretPositionFromPoint?: (
				x: number,
				y: number,
			) => CaretPosition | null;
			elementFromPoint?: (x: number, y: number) => Element | null;
		};
		const originalCaretPositionFromPoint =
			documentWithCaret.caretPositionFromPoint;
		const originalElementFromPoint = documentWithCaret.elementFromPoint;

		try {
			await act(async () => {
				root.render(
					<Pen.Editor.Root
						editor={editor}
						inlineAtomInteractions={{ drag: true }}
						inlineAtomRenderers={{
							mention: ({ interaction, props, text }) => (
								<span
									data-dragging={
										interaction?.dragging ? "true" : "false"
									}
									data-testid="mention-renderer"
								>
									{props.label as string}:{text}
								</span>
							),
						}}
					>
						<Pen.Editor.Content />
					</Pen.Editor.Root>,
				);
				await flushAnimationFrames(2);
			});

			const atom = container.querySelector(
				`[${DATA_ATTRS.inlineAtom}]`,
			) as HTMLElement | null;
			const inlineElement = container.querySelector(
				`[${DATA_ATTRS.inlineContent}]`,
			) as HTMLElement | null;
			const renderedAtom = container.querySelector(
				"[data-testid='mention-renderer']",
			);
			expect(atom).not.toBeNull();
			expect(inlineElement).not.toBeNull();
			expect(renderedAtom?.getAttribute("data-dragging")).toBe("false");

			Object.defineProperty(atom!, "getBoundingClientRect", {
				configurable: true,
				value: () => new DOMRect(10, 10, 80, 24),
			});
			documentWithCaret.elementFromPoint = () => inlineElement;
			documentWithCaret.caretPositionFromPoint = () => ({
				offsetNode: inlineElement!.firstChild ?? inlineElement!,
				offset: 1,
				getClientRect: () => new DOMRect(40, 10, 0, 20),
			});

			await act(async () => {
				dispatchPointerEvent(atom!, "pointerdown", {
					button: 0,
					clientX: 20,
					clientY: 20,
					pointerId: 1,
				});
				dispatchPointerEvent(document, "pointermove", {
					clientX: 50,
					clientY: 24,
					pointerId: 1,
				});
				await flushAnimationFrames(2);
			});

			expect(atom?.hasAttribute(DATA_ATTRS.inlineAtomDragging)).toBe(
				true,
			);
			expect(renderedAtom?.getAttribute("data-dragging")).toBe("true");
			expect(
				document.querySelector(
					"[data-pen-inline-atom-drag-preview-root]",
				),
			).not.toBeNull();

			await act(async () => {
				dispatchPointerEvent(document, "pointercancel", {
					pointerId: 1,
				});
				await flushAnimationFrames(2);
			});

			expect(atom?.hasAttribute(DATA_ATTRS.inlineAtomDragging)).toBe(
				false,
			);
			expect(renderedAtom?.getAttribute("data-dragging")).toBe("false");
			expect(
				document.querySelector(
					"[data-pen-inline-atom-drag-preview-root]",
				),
			).toBeNull();
		} finally {
			documentWithCaret.caretPositionFromPoint =
				originalCaretPositionFromPoint;
			documentWithCaret.elementFromPoint = originalElementFromPoint;
			await act(async () => {
				root.unmount();
			});
			container.remove();
			editor.destroy();
		}
	});

	it("applies text deltas around inline atoms at logical boundaries", () => {
		const editor = createPresetEditor();
		const element = document.createElement("span");

		fullReconcileDeltasToDOM(
			[
				{ insert: "A" },
				{
					insert: {
						type: "mention",
						props: { id: "user-1", label: "Ada" },
					},
				},
				{ insert: "B" },
			],
			element,
			editor.schema,
		);

		const atom = element.querySelector(
			`[${DATA_ATTRS.inlineAtom}]`,
		) as HTMLElement | null;
		expect(atom).not.toBeNull();

		expect(
			applyDeltaToDOM(
				[{ retain: 2 }, { insert: "C" }],
				element,
				editor.schema,
			),
		).toBe(true);
		expect(getLogicalTextContent(element)).toBe(
			`A${INLINE_ATOM_REPLACEMENT_TEXT}CB`,
		);
		expect(getInlineAtomElementData(atom!)).toEqual({
			type: "mention",
			props: { id: "user-1", label: "Ada" },
			text: "@Ada",
		});
		expect(atom?.textContent).toBe("@Ada");

		expect(
			applyDeltaToDOM(
				[{ retain: 1 }, { delete: 1 }],
				element,
				editor.schema,
			),
		).toBe(true);
		expect(getLogicalTextContent(element)).toBe("ACB");
		expect(atom?.isConnected).toBe(false);

		editor.destroy();
	});

	it("resolves inline-container tail clicks after an atom to the logical end", () => {
		const blockId = "atom-block";
		const container = document.createElement("div");
		container.setAttribute(DATA_ATTRS.editorRoot, "");
		const block = document.createElement("div");
		block.setAttribute(DATA_ATTRS.editorBlock, "");
		block.setAttribute(DATA_ATTRS.blockId, blockId);
		block.setAttribute(DATA_ATTRS.blockType, "paragraph");
		const inlineElement = document.createElement("span");
		inlineElement.setAttribute(DATA_ATTRS.inlineContent, "");
		const atom = document.createElement("span");
		atom.setAttribute(DATA_ATTRS.inlineAtom, "");
		atom.setAttribute(DATA_ATTRS.inlineAtomType, "mention");
		atom.contentEditable = "false";
		atom.textContent = "Ada";

		inlineElement.appendChild(atom);
		block.appendChild(inlineElement);
		container.appendChild(block);
		document.body.appendChild(container);

		Object.defineProperty(inlineElement, "getBoundingClientRect", {
			configurable: true,
			value: () => new DOMRect(0, 0, 200, 20),
		});

		const documentWithCaret = document as Document & {
			caretPositionFromPoint?: (
				x: number,
				y: number,
			) => CaretPosition | null;
		};
		const originalCaretPositionFromPoint =
			documentWithCaret.caretPositionFromPoint;
		const originalCreateRange = document.createRange.bind(document);

		documentWithCaret.caretPositionFromPoint = () => ({
			offsetNode: inlineElement,
			offset: 0,
			getClientRect: () => new DOMRect(0, 0, 0, 20),
		});
		document.createRange = () => {
			const range = originalCreateRange();
			const originalSetStart = range.setStart.bind(range);
			let startContainer: Node | null = null;
			let startOffset = 0;
			range.setStart = (node: Node, offset: number) => {
				startContainer = node;
				startOffset = offset;
				originalSetStart(node, offset);
			};
			(
				range as Range & { getBoundingClientRect: () => DOMRect }
			).getBoundingClientRect = () => {
				if (startContainer === inlineElement && startOffset === 0) {
					return new DOMRect(0, 0, 80, 20);
				}
				return new DOMRect(80, 0, 0, 20);
			};
			return range;
		};

		try {
			expect(pointToEditorSelectionPoint(container, 160, 10)).toEqual({
				blockId,
				offset: 1,
			});
		} finally {
			documentWithCaret.caretPositionFromPoint =
				originalCaretPositionFromPoint;
			document.createRange = originalCreateRange;
			container.remove();
		}
	});

	it("resolves inline-wrapper tail clicks after an atom to the logical end", () => {
		const blockId = "atom-block";
		const container = document.createElement("div");
		container.setAttribute(DATA_ATTRS.editorRoot, "");
		const block = document.createElement("div");
		block.setAttribute(DATA_ATTRS.editorBlock, "");
		block.setAttribute(DATA_ATTRS.blockId, blockId);
		block.setAttribute(DATA_ATTRS.blockType, "paragraph");
		const wrapper = document.createElement("div");
		wrapper.setAttribute(DATA_ATTRS.blockType, "paragraph");
		const inlineElement = document.createElement("span");
		inlineElement.setAttribute(DATA_ATTRS.inlineContent, "");
		const atom = document.createElement("span");
		atom.setAttribute(DATA_ATTRS.inlineAtom, "");
		atom.setAttribute(DATA_ATTRS.inlineAtomType, "mention");
		atom.contentEditable = "false";
		atom.textContent = "Ada";

		inlineElement.appendChild(atom);
		wrapper.appendChild(inlineElement);
		block.appendChild(wrapper);
		container.appendChild(block);
		document.body.appendChild(container);

		Object.defineProperty(inlineElement, "getBoundingClientRect", {
			configurable: true,
			value: () => new DOMRect(0, 0, 200, 20),
		});

		const documentWithCaret = document as Document & {
			caretPositionFromPoint?: (
				x: number,
				y: number,
			) => CaretPosition | null;
		};
		const originalCaretPositionFromPoint =
			documentWithCaret.caretPositionFromPoint;
		const originalCreateRange = document.createRange.bind(document);

		documentWithCaret.caretPositionFromPoint = () => ({
			offsetNode: wrapper,
			offset: 0,
			getClientRect: () => new DOMRect(0, 0, 0, 20),
		});
		document.createRange = () => {
			const range = originalCreateRange();
			const originalSetStart = range.setStart.bind(range);
			let startContainer: Node | null = null;
			let startOffset = 0;
			range.setStart = (node: Node, offset: number) => {
				startContainer = node;
				startOffset = offset;
				originalSetStart(node, offset);
			};
			(
				range as Range & { getBoundingClientRect: () => DOMRect }
			).getBoundingClientRect = () => {
				if (startContainer === inlineElement && startOffset === 0) {
					return new DOMRect(0, 0, 80, 20);
				}
				return new DOMRect(80, 0, 0, 20);
			};
			return range;
		};

		try {
			expect(pointToEditorSelectionPoint(container, 160, 10)).toEqual({
				blockId,
				offset: 1,
			});
		} finally {
			documentWithCaret.caretPositionFromPoint =
				originalCaretPositionFromPoint;
			document.createRange = originalCreateRange;
			container.remove();
		}
	});

	it("moves an inline atom within one editor", () => {
		const editor = createPresetEditor();
		const blockId = seedInlineAtomDocument(editor);

		try {
			expect(
				moveInlineAtom({
					source: { editor, blockId, offset: 1 },
					target: { editor, blockId, offset: 3 },
				}),
			).toBe(true);
			expect(editor.getBlock(blockId)?.inlineDeltas()).toEqual([
				{ insert: "AB" },
				{
					insert: {
						type: "mention",
						props: { id: "user-1", label: "Ada" },
					},
				},
			]);
			expect(editor.selection).toMatchObject({
				type: "text",
				anchor: { blockId, offset: 3 },
			});
		} finally {
			editor.destroy();
		}
	});

	it("moves an inline atom between compatible editors", () => {
		const sourceEditor = createPresetEditor();
		const targetEditor = createPresetEditor();
		const sourceBlockId = seedInlineAtomDocument(sourceEditor);
		const targetBlockId = targetEditor.firstBlock()!.id;
		targetEditor.apply([
			{
				type: "insert-text",
				blockId: targetBlockId,
				offset: 0,
				text: "Z",
			},
		]);

		try {
			expect(
				moveInlineAtom({
					source: {
						editor: sourceEditor,
						blockId: sourceBlockId,
						offset: 1,
					},
					target: {
						editor: targetEditor,
						blockId: targetBlockId,
						offset: 1,
					},
				}),
			).toBe(true);
			expect(
				sourceEditor.getBlock(sourceBlockId)?.inlineDeltas(),
			).toEqual([{ insert: "AB" }]);
			expect(
				targetEditor.getBlock(targetBlockId)?.inlineDeltas(),
			).toEqual([
				{ insert: "Z" },
				{
					insert: {
						type: "mention",
						props: { id: "user-1", label: "Ada" },
					},
				},
			]);
			expect(targetEditor.selection).toMatchObject({
				type: "text",
				anchor: { blockId: targetBlockId, offset: 2 },
			});
		} finally {
			sourceEditor.destroy();
			targetEditor.destroy();
		}
	});

	it("rejects cross-editor moves when the target schema does not support the atom", () => {
		const sourceEditor = createPresetEditor();
		const targetEditor = createEditor({
			schema: createDefaultSchema().without(["mention"]),
			preset: defaultPreset({
				documentOps: false,
				deltaStream: false,
				undo: false,
			}),
		});
		const sourceBlockId = seedInlineAtomDocument(sourceEditor);
		const targetBlockId = targetEditor.firstBlock()!.id;

		try {
			expect(
				moveInlineAtom({
					source: {
						editor: sourceEditor,
						blockId: sourceBlockId,
						offset: 1,
					},
					target: {
						editor: targetEditor,
						blockId: targetBlockId,
						offset: 0,
					},
				}),
			).toBe(false);
			expect(
				sourceEditor.getBlock(sourceBlockId)?.inlineDeltas(),
			).toEqual([
				{ insert: "A" },
				{
					insert: {
						type: "mention",
						props: { id: "user-1", label: "Ada" },
					},
				},
				{ insert: "B" },
			]);
			expect(
				targetEditor.getBlock(targetBlockId)?.inlineDeltas(),
			).toEqual([{ insert: "\u200B" }]);
		} finally {
			sourceEditor.destroy();
			targetEditor.destroy();
		}
	});

	it("destructures an inline atom into selected editable text", () => {
		const editor = createPresetEditor();
		const blockId = seedInlineAtomDocument(editor);

		try {
			expect(
				replaceInlineAtomWithText({
					source: { editor, blockId, offset: 1 },
					text: "Ada Lovelace <ada@example.com>",
					selection: "all",
				}),
			).toBe(true);
			expect(editor.getBlock(blockId)?.inlineDeltas()).toEqual([
				{ insert: "AAda Lovelace <ada@example.com>B" },
			]);
			expect(editor.selection).toMatchObject({
				type: "text",
				anchor: { blockId, offset: 1 },
				focus: { blockId, offset: 31 },
			});
		} finally {
			editor.destroy();
		}
	});

	it("refreshes inline atom metadata when reconciliation changes atom props", () => {
		const editor = createPresetEditor();
		const element = document.createElement("span");
		const firstDelta = [
			{ insert: "A" },
			{
				insert: {
					type: "mention",
					props: { id: "user-1", label: "Ada" },
				},
			},
			{ insert: "B" },
		];
		const secondDelta = [
			{ insert: "A" },
			{
				insert: {
					type: "mention",
					props: { id: "user-2", label: "Ada" },
				},
			},
			{ insert: "B" },
		];

		fullReconcileDeltasToDOM(firstDelta, element, editor.schema);
		const firstAtom = element.querySelector(
			`[${DATA_ATTRS.inlineAtom}]`,
		) as HTMLElement | null;
		expect(getInlineAtomElementData(firstAtom!)).toEqual({
			type: "mention",
			props: { id: "user-1", label: "Ada" },
			text: "@Ada",
		});

		fullReconcileDeltasToDOM(secondDelta, element, editor.schema);
		const secondAtom = element.querySelector(
			`[${DATA_ATTRS.inlineAtom}]`,
		) as HTMLElement | null;

		expect(secondAtom).not.toBe(firstAtom);
		expect(firstAtom?.isConnected).toBe(false);
		expect(getInlineAtomElementData(secondAtom!)).toEqual({
			type: "mention",
			props: { id: "user-2", label: "Ada" },
			text: "@Ada",
		});

		editor.destroy();
	});

	it("round-trips DOM selection offsets around inline atoms", async () => {
		const editor = createPresetEditor();
		const blockId = seedInlineAtomDocument(editor);
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
				await flushAnimationFrames(2);
			});

			const rootElement = container.querySelector(
				`[${DATA_ATTRS.editorRoot}]`,
			) as HTMLElement | null;
			const inlineElement = container.querySelector(
				`[${DATA_ATTRS.inlineContent}]`,
			) as HTMLElement | null;
			expect(rootElement).not.toBeNull();
			expect(inlineElement).not.toBeNull();
			expect(domPointToOffset(inlineElement!, inlineElement!, 1)).toBe(1);
			expect(domPointToOffset(inlineElement!, inlineElement!, 2)).toBe(2);

			editorSelectionToDOM(
				rootElement!,
				{ blockId, offset: 2 },
				{ blockId, offset: 2 },
			);

			expect(domSelectionToEditor(rootElement!)).toEqual({
				anchor: { blockId, offset: 2 },
				focus: { blockId, offset: 2 },
			});
		} finally {
			await act(async () => {
				root.unmount();
			});
			container.remove();
			editor.destroy();
		}
	});
});
