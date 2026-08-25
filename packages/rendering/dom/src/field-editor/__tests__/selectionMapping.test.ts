// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { DATA_ATTRS } from "../../utils/dataAttributes";
import * as selectionBridge from "../selectionBridge";
import {
	domPointToOffset,
	domSelectionToEditor,
	getBlockBoundaryPoint,
} from "../selectionMapping";

const BRIDGE_VALUE_EXPORTS = [
	"computeTextDiff",
	"domPointToOffset",
	"domSelectionToEditor",
	"editorSelectionToDOM",
	"extractTextFromDOM",
	"findBlockElement",
	"findInlineContentElement",
	"getBlockBoundaryPoint",
	"getCaretOffset",
	"getClosestBlockElementFromPoint",
	"getDirectionalSelectionOffsets",
	"getSelectionOffsets",
	"getSelectionPointForBlockAtPointer",
	"getTextSelectionClientRects",
	"pointToEditorSelectionPoint",
	"queryBlockElement",
	"queryInlineElement",
] as const;

const SELECTION_POINT_RECT = ["get", "Selection", "Point", "Rect"].join("");

function mountBlock(options: {
	blockId: string;
	text?: string;
	blockType?: string;
	surfaceRole?: string;
	includeInline?: boolean;
}): {
	root: HTMLElement;
	block: HTMLElement;
	inline: HTMLElement | null;
} {
	const root = document.createElement("div");
	root.setAttribute(DATA_ATTRS.editorRoot, "");
	const block = document.createElement("div");
	block.setAttribute(DATA_ATTRS.editorBlock, "");
	block.setAttribute(DATA_ATTRS.blockId, options.blockId);
	if (options.blockType) {
		block.setAttribute(DATA_ATTRS.blockType, options.blockType);
	}
	if (options.surfaceRole) {
		block.setAttribute(DATA_ATTRS.surfaceRole, options.surfaceRole);
	}
	let inline: HTMLElement | null = null;
	if (options.includeInline !== false) {
		inline = document.createElement("span");
		inline.setAttribute(DATA_ATTRS.inlineContent, "");
		inline.textContent = options.text ?? "";
		block.append(inline);
	} else if (options.text) {
		block.textContent = options.text;
	}
	root.append(block);
	document.body.append(root);
	return { root, block, inline };
}

describe("selectionBridge published value exports", () => {
	it("keeps the same value-export names and re-exports mapping by identity", () => {
		expect(Object.keys(selectionBridge).sort()).toEqual(
			[...BRIDGE_VALUE_EXPORTS, SELECTION_POINT_RECT].sort(),
		);
		expect(selectionBridge.domPointToOffset).toBe(domPointToOffset);
		expect(selectionBridge.getBlockBoundaryPoint).toBe(
			getBlockBoundaryPoint,
		);
		expect(selectionBridge.domSelectionToEditor).toBe(domSelectionToEditor);
	});
});

describe("domPointToOffset", () => {
	it("maps a text-node endpoint to a character offset", () => {
		const { root, inline } = mountBlock({
			blockId: "p1",
			text: "Hello",
		});
		try {
			const text = inline!.firstChild as Text;
			expect(domPointToOffset(inline!, text, 0)).toBe(0);
			expect(domPointToOffset(inline!, text, 5)).toBe(5);
			expect(domPointToOffset(inline!, text, 2)).toBe(2);
		} finally {
			root.remove();
		}
	});

	it("maps a child-index point on the inline container", () => {
		const { root, inline } = mountBlock({
			blockId: "p1",
			text: "Hi",
		});
		try {
			expect(domPointToOffset(inline!, inline!, 0)).toBe(0);
			expect(domPointToOffset(inline!, inline!, 1)).toBe(2);
		} finally {
			root.remove();
		}
	});

	it("still resolves when the target node is outside the container", () => {
		const { root, inline } = mountBlock({
			blockId: "p1",
			text: "Hello",
		});
		const outsider = document.createTextNode("x");
		document.body.append(outsider);
		try {
			expect(domPointToOffset(inline!, outsider, 0)).toBe(
				inline!.textContent?.length ?? 0,
			);
		} finally {
			outsider.remove();
			root.remove();
		}
	});

	it("maps a mark-wrapper endpoint the same as the enclosed text node", () => {
		const { root, inline } = mountBlock({
			blockId: "p1",
			text: "",
		});
		try {
			const mark = document.createElement("strong");
			const text = document.createTextNode("ab");
			mark.append(text);
			inline!.append(mark);
			expect(domPointToOffset(inline!, mark, 0)).toBe(0);
			expect(domPointToOffset(inline!, mark, 1)).toBe(2);
			expect(domPointToOffset(inline!, text, 1)).toBe(1);
		} finally {
			root.remove();
		}
	});
});

describe("getBlockBoundaryPoint", () => {
	it("returns start and end offsets for an editable-inline block", () => {
		const { root } = mountBlock({
			blockId: "p1",
			text: "Hello",
			blockType: "paragraph",
		});
		try {
			expect(getBlockBoundaryPoint(root, "p1", "start")).toEqual({
				blockId: "p1",
				offset: 0,
			});
			expect(getBlockBoundaryPoint(root, "p1", "end")).toEqual({
				blockId: "p1",
				offset: 5,
			});
		} finally {
			root.remove();
		}
	});

	it("returns null when the block is missing", () => {
		const { root } = mountBlock({
			blockId: "p1",
			text: "Hello",
		});
		try {
			expect(getBlockBoundaryPoint(root, "missing", "start")).toBeNull();
		} finally {
			root.remove();
		}
	});

	it("clamps structural blocks to the 0..1 selection length", () => {
		const { root } = mountBlock({
			blockId: "d1",
			blockType: "divider",
			includeInline: false,
		});
		try {
			expect(getBlockBoundaryPoint(root, "d1", "start")).toEqual({
				blockId: "d1",
				offset: 0,
			});
			expect(getBlockBoundaryPoint(root, "d1", "end")).toEqual({
				blockId: "d1",
				offset: 1,
			});
		} finally {
			root.remove();
		}
	});

	it("does not treat a DOM U+200B as the empty-block sentinel", () => {
		const { root } = mountBlock({
			blockId: "p1",
			text: "\u200B",
			blockType: "paragraph",
		});
		try {
			expect(getBlockBoundaryPoint(root, "p1", "end")).toEqual({
				blockId: "p1",
				offset: 1,
			});
		} finally {
			root.remove();
		}
	});
});
