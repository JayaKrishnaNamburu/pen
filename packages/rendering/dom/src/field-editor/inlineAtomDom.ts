import type { SchemaRegistry } from "@pen/types";
import { DATA_ATTRS } from "../utils/dataAttributes";
import {
	INLINE_ATOM_CARET_BOUNDARY_TEXT,
	INLINE_ATOM_REPLACEMENT_TEXT,
	resolveInlineAtomDisplayText,
	resolveInlineAtomInsert,
	type InlineAtomInsert,
} from "./inlineAtomModel";
export {
	INLINE_ATOM_CARET_BOUNDARY_TEXT,
	INLINE_ATOM_REPLACEMENT_TEXT,
	resolveInlineAtomInsert,
} from "./inlineAtomModel";

export type InlineAtomCaretBoundarySide = "before" | "after";

export interface InlineAtomElementData extends InlineAtomInsert {
	text: string;
}

const inlineAtomElementData = new WeakMap<HTMLElement, InlineAtomElementData>();

export function createInlineAtomCaretBoundaryElement(
	side: InlineAtomCaretBoundarySide,
): HTMLElement {
	const element = document.createElement("span");
	element.setAttribute(DATA_ATTRS.inlineAtomCaretBoundary, "");
	element.setAttribute(DATA_ATTRS.inlineAtomCaretSide, side);
	element.appendChild(
		document.createTextNode(INLINE_ATOM_CARET_BOUNDARY_TEXT),
	);
	return element;
}

function createInlineAtomChipElement(
	insert: unknown,
	registry: SchemaRegistry,
): HTMLElement {
	const atom = resolveInlineAtomInsert(insert);
	const element = document.createElement("span");
	element.setAttribute(DATA_ATTRS.inlineAtom, "");
	element.contentEditable = "false";

	if (!atom) {
		element.textContent = INLINE_ATOM_REPLACEMENT_TEXT;
		return element;
	}

	element.setAttribute(DATA_ATTRS.inlineAtomType, atom.type);
	element.setAttribute(DATA_ATTRS.inlineAtomProps, serializeInlineAtomProps(atom.props));
	const text = resolveInlineAtomDisplayText(atom, registry);
	element.setAttribute("aria-label", text);
	element.textContent = text;
	inlineAtomElementData.set(element, {
		...atom,
		text,
	});
	return element;
}

export function createInlineAtomElement(
	insert: unknown,
	registry: SchemaRegistry,
): HTMLElement {
	const host = document.createElement("span");
	host.setAttribute(DATA_ATTRS.inlineAtomHost, "");
	host.appendChild(createInlineAtomCaretBoundaryElement("before"));
	host.appendChild(createInlineAtomChipElement(insert, registry));
	host.appendChild(createInlineAtomCaretBoundaryElement("after"));
	return host;
}

export function getInlineAtomElementData(
	element: Element,
): InlineAtomElementData | null {
	const chip = getInlineAtomChipElement(element);
	if (!chip) {
		return null;
	}
	return inlineAtomElementData.get(chip) ?? deserializeInlineAtomElementData(chip);
}

export function copyInlineAtomElementData(
	source: Element,
	target: Element,
): void {
	const sourceChip = getInlineAtomChipElement(source);
	const targetChip = getInlineAtomChipElement(target);
	if (!sourceChip || !targetChip) {
		return;
	}

	const data = getInlineAtomElementData(sourceChip);
	if (!data) {
		return;
	}

	inlineAtomElementData.set(targetChip, {
		type: data.type,
		props: { ...data.props },
		text: data.text,
	});
	targetChip.setAttribute(DATA_ATTRS.inlineAtomType, data.type);
	targetChip.setAttribute(DATA_ATTRS.inlineAtomProps, serializeInlineAtomProps(data.props));
	targetChip.setAttribute("aria-label", data.text);
}

function serializeInlineAtomProps(props: Record<string, unknown>): string {
	try {
		return JSON.stringify(props);
	} catch {
		return "{}";
	}
}

function deserializeInlineAtomElementData(
	element: HTMLElement,
): InlineAtomElementData | null {
	const type = element.getAttribute(DATA_ATTRS.inlineAtomType);
	if (!type) {
		return null;
	}
	return {
		type,
		props: parseInlineAtomProps(element.getAttribute(DATA_ATTRS.inlineAtomProps)),
		text: element.getAttribute("aria-label") ?? element.textContent ?? "",
	};
}

function parseInlineAtomProps(value: string | null): Record<string, unknown> {
	if (!value) {
		return {};
	}
	try {
		const props = JSON.parse(value);
		return props && typeof props === "object" && !Array.isArray(props)
			? (props as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

export function areInlineAtomElementDataEqual(
	left: Element,
	right: Element,
): boolean {
	const leftData = getInlineAtomElementData(left);
	const rightData = getInlineAtomElementData(right);
	if (!leftData || !rightData) {
		return leftData === rightData;
	}

	return (
		leftData.type === rightData.type &&
		leftData.text === rightData.text &&
		shallowEqualRecords(leftData.props, rightData.props)
	);
}

export function isInlineAtomCaretBoundaryNode(
	node: Node | null,
): node is HTMLElement {
	return (
		node instanceof HTMLElement &&
		node.hasAttribute(DATA_ATTRS.inlineAtomCaretBoundary)
	);
}

export function isInlineAtomHostNode(node: Node | null): node is HTMLElement {
	return (
		node instanceof HTMLElement &&
		node.hasAttribute(DATA_ATTRS.inlineAtomHost)
	);
}

export function isInlineAtomChipNode(node: Node | null): node is HTMLElement {
	return (
		node instanceof HTMLElement &&
		node.hasAttribute(DATA_ATTRS.inlineAtom) &&
		!isInlineAtomHostNode(node)
	);
}

export function isInlineAtomNode(node: Node | null): node is HTMLElement {
	return isInlineAtomHostNode(node) || isInlineAtomChipNode(node);
}

function shallowEqualRecords(
	left: Record<string, unknown>,
	right: Record<string, unknown>,
): boolean {
	if (left === right) {
		return true;
	}

	const leftKeys = Object.keys(left);
	const rightKeys = Object.keys(right);
	if (leftKeys.length !== rightKeys.length) {
		return false;
	}

	return leftKeys.every((key) => Object.is(left[key], right[key]));
}

function getInlineAtomChipElement(element: Element): HTMLElement | null {
	if (element instanceof HTMLElement && isInlineAtomChipNode(element)) {
		return element;
	}

	if (element instanceof HTMLElement && isInlineAtomHostNode(element)) {
		for (const child of Array.from(element.childNodes)) {
			if (isInlineAtomChipNode(child)) {
				return child;
			}
		}
	}

	return null;
}


export {
	domPointToLogicalOffset,
	findLogicalDOMPoint,
	getInlineAtomPointerOffset,
	getLogicalNodeLength,
	getLogicalTextContent,
} from "./inlineAtomLogicalDom";
