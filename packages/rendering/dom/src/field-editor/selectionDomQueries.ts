import { DATA_ATTRS } from "../utils/dataAttributes";

/**
 * Safely query a block element by ID, escaping special characters to prevent
 * selector injection from untrusted CRDT data.
 */
export function queryBlockElement(
	root: HTMLElement,
	blockId: string,
): HTMLElement | null {
	const escaped =
		typeof CSS !== "undefined" && CSS.escape
			? CSS.escape(blockId)
			: blockId.replace(/(["\]\\])/g, "\\$1");
	return root.querySelector(
		`[${DATA_ATTRS.blockId}="${escaped}"]`,
	) as HTMLElement | null;
}

/**
 * Find the inline content element for a given block.
 */
export function queryInlineElement(
	root: HTMLElement,
	blockId: string,
): HTMLElement | null {
	const blockEl = queryBlockElement(root, blockId);
	return blockEl?.querySelector(
		`[${DATA_ATTRS.inlineContent}]`,
	) as HTMLElement | null;
}

/**
 * Find the ancestor block element for a given DOM node.
 */
export function findBlockElement(
	node: Node,
	root: HTMLElement,
): HTMLElement | null {
	let current: Node | null = node;
	while (current && current !== root) {
		if (
			current instanceof HTMLElement &&
			current.hasAttribute(DATA_ATTRS.editorBlock)
		) {
			return current;
		}
		current = current.parentNode;
	}
	return null;
}

/**
 * Find the inline content element inside a block.
 */
export function findInlineContentElement(
	blockEl: HTMLElement,
): HTMLElement | null {
	return blockEl.querySelector(`[${DATA_ATTRS.inlineContent}]`);
}
