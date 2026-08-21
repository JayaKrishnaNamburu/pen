// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { DATA_ATTRS } from "../../utils/dataAttributes";
import { findLogicalDOMPoint } from "../inlineAtomLogicalDom";
import { editorSelectionToDOM } from "../selectionBridgeOffsets";

function mountParagraph(text: string): {
	root: HTMLElement;
	inline: HTMLElement;
	blockId: string;
} {
	const root = document.createElement("div");
	root.setAttribute(DATA_ATTRS.editorRoot, "");
	const block = document.createElement("div");
	block.setAttribute(DATA_ATTRS.editorBlock, "");
	const blockId = "block-1";
	block.setAttribute(DATA_ATTRS.blockId, blockId);
	const inline = document.createElement("span");
	inline.setAttribute(DATA_ATTRS.inlineContent, "");
	inline.textContent = text;
	block.append(inline);
	root.append(block);
	document.body.append(root);
	return { root, inline, blockId };
}

describe("editorSelectionToDOM range write", () => {
	it("resolves offset 0 to a text node, not the inline element", () => {
		const { root, inline } = mountParagraph(
			"Alpha bravo charlie delta echo",
		);
		try {
			const start = findLogicalDOMPoint(inline, 0);
			expect(start.node.nodeType).toBe(Node.TEXT_NODE);
			expect(start.offset).toBe(0);
			expect(root.contains(start.node)).toBe(true);
		} finally {
			root.remove();
		}
	});

	it("projects a same-block authority range into window.getSelection", () => {
		const paragraph = "Alpha bravo charlie delta echo";
		const { root, blockId } = mountParagraph(paragraph);
		try {
			editorSelectionToDOM(
				root,
				{ blockId, offset: 0 },
				{ blockId, offset: paragraph.length },
			);
			const selection = window.getSelection();
			expect(selection?.isCollapsed).toBe(false);
			expect(selection?.toString()).toBe(paragraph);
		} finally {
			root.remove();
		}
	});
});
