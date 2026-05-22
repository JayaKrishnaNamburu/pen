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
	getLogicalNodeLength,
	INLINE_ATOM_CARET_BOUNDARY_TEXT,
	INLINE_ATOM_REPLACEMENT_TEXT,
	findLogicalDOMPoint,
	isInlineAtomCaretBoundaryNode,
	isInlineAtomHostNode,
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
	getSelectionOffsets,
	pointToEditorSelectionPoint,
} from "../field-editor/selectionBridge";
import { handleFieldEditorKeyDown } from "../field-editor/keyHandling";
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
			expect(
				fieldEditor.requestDomFocus(inline, "selection-project"),
			).toBe(true);
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

	it("projects activated text selections before the next input event can use a stale DOM range", () => {
		const editor = createPresetEditor();
		const blockId = seedInlineAtomDocument(editor);
		const fieldEditor = new FieldEditorImpl(editor);
		const block = editor.getBlock(blockId)!;
		const endOffset = block.length();
		const root = document.createElement("div");
		const blockElement = document.createElement("div");
		const inlineElement = document.createElement("span");

		root.setAttribute(DATA_ATTRS.editorRoot, "");
		blockElement.setAttribute(DATA_ATTRS.editorBlock, "");
		blockElement.setAttribute(DATA_ATTRS.blockId, blockId);
		blockElement.setAttribute(DATA_ATTRS.blockType, "paragraph");
		inlineElement.setAttribute(DATA_ATTRS.inlineContent, "");
		fullReconcileDeltasToDOM(
			block.inlineDeltas() as unknown as Parameters<
				typeof fullReconcileDeltasToDOM
			>[0],
			inlineElement,
			editor.schema,
		);
		blockElement.appendChild(inlineElement);
		root.appendChild(blockElement);
		document.body.appendChild(root);
		fieldEditor.setRootElement(root);

		try {
			fieldEditor.activate(blockId);
			editorSelectionToDOM(
				root,
				{ blockId, offset: 0 },
				{ blockId, offset: 0 },
			);
			expect(getSelectionOffsets(inlineElement)).toEqual({
				start: 0,
				end: 0,
			});

			fieldEditor.activateTextSelection(blockId, endOffset, endOffset);

			expect(getSelectionOffsets(inlineElement)).toEqual({
				start: endOffset,
				end: endOffset,
			});
		} finally {
			fieldEditor.destroy();
			root.remove();
			editor.destroy();
		}
	});

	it("projects activated inline atom range selections synchronously", () => {
		const editor = createPresetEditor();
		const blockId = seedInlineAtomDocument(editor);
		const fieldEditor = new FieldEditorImpl(editor);
		const block = editor.getBlock(blockId)!;
		const root = document.createElement("div");
		const blockElement = document.createElement("div");
		const inlineElement = document.createElement("span");

		root.setAttribute(DATA_ATTRS.editorRoot, "");
		blockElement.setAttribute(DATA_ATTRS.editorBlock, "");
		blockElement.setAttribute(DATA_ATTRS.blockId, blockId);
		blockElement.setAttribute(DATA_ATTRS.blockType, "paragraph");
		inlineElement.setAttribute(DATA_ATTRS.inlineContent, "");
		fullReconcileDeltasToDOM(
			block.inlineDeltas() as unknown as Parameters<
				typeof fullReconcileDeltasToDOM
			>[0],
			inlineElement,
			editor.schema,
		);
		blockElement.appendChild(inlineElement);
		root.appendChild(blockElement);
		document.body.appendChild(root);
		fieldEditor.setRootElement(root);

		try {
			fieldEditor.activate(blockId);
			fieldEditor.activateTextSelection(blockId, 1, 2);

			expect(getSelectionOffsets(inlineElement)).toEqual({
				start: 1,
				end: 2,
			});
		} finally {
			fieldEditor.destroy();
			root.remove();
			editor.destroy();
		}
	});

	it("keeps programmatic focus after native focus reports a start caret", async () => {
		const editor = createPresetEditor();
		const blockId = seedInlineAtomDocument(editor);
		const fieldEditor = new FieldEditorImpl(editor);
		const block = editor.getBlock(blockId)!;
		const root = document.createElement("div");
		const blockElement = document.createElement("div");
		const inlineElement = document.createElement("span");

		root.setAttribute(DATA_ATTRS.editorRoot, "");
		blockElement.setAttribute(DATA_ATTRS.editorBlock, "");
		blockElement.setAttribute(DATA_ATTRS.blockId, blockId);
		blockElement.setAttribute(DATA_ATTRS.blockType, "paragraph");
		inlineElement.setAttribute(DATA_ATTRS.inlineContent, "");
		fullReconcileDeltasToDOM(
			block.inlineDeltas() as unknown as Parameters<
				typeof fullReconcileDeltasToDOM
			>[0],
			inlineElement,
			editor.schema,
		);
		blockElement.appendChild(inlineElement);
		root.appendChild(blockElement);
		document.body.appendChild(root);
		fieldEditor.setRootElement(root);

		try {
			await fieldEditor.focusTextSelection(blockId, 2, 2);
			editorSelectionToDOM(
				root,
				{ blockId, offset: 0 },
				{ blockId, offset: 0 },
			);
			document.dispatchEvent(new Event("selectionchange"));
			await flushAnimationFrames(2);

			expect(editor.selection).toMatchObject({
				type: "text",
				anchor: { blockId, offset: 2 },
				focus: { blockId, offset: 2 },
			});
			expect(getSelectionOffsets(inlineElement)).toEqual({
				start: 2,
				end: 2,
			});
		} finally {
			fieldEditor.destroy();
			root.remove();
			editor.destroy();
		}
	});

	it("selects an inline atom with ArrowLeft and then collapses before it", () => {
		const editor = createPresetEditor();
		const blockId = seedInlineAtomDocument(editor);
		const activations: Array<{
			blockId: string;
			anchorOffset: number;
			focusOffset: number;
		}> = [];
		const fieldEditor = {
			focusBlockId: blockId,
			inputMode: "richtext" as const,
			activeCellCoord: null,
			activateCell: vi.fn(),
			activateTextSelection: (
				nextBlockId: string,
				anchorOffset: number,
				focusOffset: number,
			) => {
				activations.push({
					blockId: nextBlockId,
					anchorOffset,
					focusOffset,
				});
			},
			deactivate: vi.fn(),
			selectAll: vi.fn(() => false),
		};
		const ytext = {
			length: 3,
			toString: () => `A${INLINE_ATOM_REPLACEMENT_TEXT}B`,
			toDelta: () => [
				{ insert: "A" },
				{
					insert: {
						type: "mention",
						props: { id: "user-1", label: "Ada" },
					},
				},
				{ insert: "B" },
			],
			insert: vi.fn(),
			delete: vi.fn(),
		};

		try {
			expect(
				handleFieldEditorKeyDown({
					editor,
					fieldEditor,
					ytext,
					range: { start: 2, end: 2 },
					event: new KeyboardEvent("keydown", {
						key: "ArrowLeft",
						bubbles: true,
						cancelable: true,
					}),
				}),
			).toBe(true);

			expect(activations.at(-1)).toEqual({
				blockId,
				anchorOffset: 1,
				focusOffset: 2,
			});

			expect(
				handleFieldEditorKeyDown({
					editor,
					fieldEditor,
					ytext,
					range: { start: 1, end: 2 },
					event: new KeyboardEvent("keydown", {
						key: "ArrowLeft",
						bubbles: true,
						cancelable: true,
					}),
				}),
			).toBe(true);

			expect(activations.at(-1)).toEqual({
				blockId,
				anchorOffset: 1,
				focusOffset: 1,
			});

			expect(
				handleFieldEditorKeyDown({
					editor,
					fieldEditor,
					ytext,
					range: { start: 2, end: 2 },
					event: new KeyboardEvent("keydown", {
						key: "ArrowLeft",
						shiftKey: true,
						bubbles: true,
						cancelable: true,
					}),
				}),
			).toBe(true);

			expect(activations.at(-1)).toEqual({
				blockId,
				anchorOffset: 1,
				focusOffset: 2,
			});
		} finally {
			editor.destroy();
		}
	});

	it("projects caret selections into inline atom boundary text nodes", () => {
		const editor = createPresetEditor();
		const blockId = seedInlineAtomDocument(editor);
		const block = editor.getBlock(blockId)!;
		const inlineElement = document.createElement("span");
		inlineElement.setAttribute(DATA_ATTRS.inlineContent, "");
		fullReconcileDeltasToDOM(
			block.inlineDeltas() as unknown as Parameters<
				typeof fullReconcileDeltasToDOM
			>[0],
			inlineElement,
			editor.schema,
		);
		document.body.appendChild(inlineElement);

		try {
			const host = inlineElement.querySelector(
				`[${DATA_ATTRS.inlineAtomHost}]`,
			) as HTMLElement | null;
			expect(host).not.toBeNull();
			expect(isInlineAtomHostNode(host)).toBe(true);

			const afterAtomPoint = findLogicalDOMPoint(inlineElement, 2);
			expect(
				isInlineAtomCaretBoundaryNode(
					afterAtomPoint.node.parentElement,
				),
			).toBe(true);
			expect(afterAtomPoint.node.textContent).toBe(
				INLINE_ATOM_CARET_BOUNDARY_TEXT,
			);
			expect(getLogicalNodeLength(afterAtomPoint.node)).toBe(0);
			expect(getLogicalTextContent(inlineElement)).toBe(
				`A${INLINE_ATOM_REPLACEMENT_TEXT}B`,
			);

			const selection = window.getSelection();
			expect(selection).not.toBeNull();
			selection!.removeAllRanges();
			const range = document.createRange();
			range.setStart(afterAtomPoint.node, afterAtomPoint.offset);
			range.collapse(true);
			selection!.addRange(range);

			expect(getSelectionOffsets(inlineElement)).toEqual({
				start: 2,
				end: 2,
			});
		} finally {
			inlineElement.remove();
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

});
