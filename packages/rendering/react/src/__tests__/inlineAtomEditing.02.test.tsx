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
				anchorOffset: 2,
				focusOffset: 1,
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


});
