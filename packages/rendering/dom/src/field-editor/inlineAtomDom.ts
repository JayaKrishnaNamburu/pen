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

function getInlineAtomHostElement(node: Node): HTMLElement | null {
	if (node instanceof HTMLElement && isInlineAtomHostNode(node)) {
		return node;
	}

	if (node instanceof HTMLElement && isInlineAtomChipNode(node)) {
		const parent = node.parentElement;
		return parent && isInlineAtomHostNode(parent) ? parent : null;
	}

	if (isInlineAtomCaretBoundaryNode(node)) {
		const parent = node.parentElement;
		return parent && isInlineAtomHostNode(parent) ? parent : null;
	}

	return null;
}

function getInlineAtomCaretBoundaryElement(
	host: HTMLElement,
	side: InlineAtomCaretBoundarySide,
): HTMLElement | null {
	for (const child of Array.from(host.childNodes)) {
		if (
			isInlineAtomCaretBoundaryNode(child) &&
			child.getAttribute(DATA_ATTRS.inlineAtomCaretSide) === side
		) {
			return child;
		}
	}
	return null;
}

function getInlineAtomCaretBoundaryTextPoint(
	host: HTMLElement,
	side: InlineAtomCaretBoundarySide,
): { node: Node; offset: number } | null {
	const boundary = getInlineAtomCaretBoundaryElement(host, side);
	if (!boundary) {
		return null;
	}

	const textNode = boundary.firstChild;
	if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
		return null;
	}

	return {
		node: textNode,
		offset: side === "before" ? 0 : (textNode.textContent?.length ?? 0),
	};
}

function resolveLogicalInlineAtomUnit(node: HTMLElement): HTMLElement {
	const host = getInlineAtomHostElement(node);
	if (host) {
		return host;
	}
	return node;
}

export function getLogicalNodeLength(node: Node): number {
	if (
		isInlineAtomCaretBoundaryNode(node) ||
		hasInlineAtomCaretBoundaryAncestor(node)
	) {
		return 0;
	}

	if (isInlineAtomHostNode(node)) {
		return 1;
	}

	if (isInlineAtomChipNode(node)) {
		return getInlineAtomHostElement(node) ? 0 : 1;
	}

	if (node.nodeType === Node.TEXT_NODE) {
		return node.textContent?.length ?? 0;
	}

	let length = 0;
	for (const child of Array.from(node.childNodes)) {
		length += getLogicalNodeLength(child);
	}
	return length;
}

export function getLogicalTextContent(root: HTMLElement): string {
	let text = "";
	for (const child of Array.from(root.childNodes)) {
		text += getLogicalNodeText(child);
	}
	return text;
}

export function getInlineAtomPointerOffset(
	container: HTMLElement,
	clientX: number,
	clientY: number,
): number | null {
	const atomElements = Array.from(
		container.querySelectorAll(`[${DATA_ATTRS.inlineAtom}]`),
	).filter(
		(element): element is HTMLElement => element instanceof HTMLElement,
	);
	if (atomElements.length === 0) {
		return null;
	}

	let bestOffset: number | null = null;
	let bestScore = Number.POSITIVE_INFINITY;

	for (const atomElement of atomElements) {
		const rect = atomElement.getBoundingClientRect();
		const dx =
			clientX < rect.left
				? rect.left - clientX
				: clientX > rect.right
					? clientX - rect.right
					: 0;
		const dy =
			clientY < rect.top
				? rect.top - clientY
				: clientY > rect.bottom
					? clientY - rect.bottom
					: 0;
		const score = dy * 1000 + dx;
		if (score >= bestScore) {
			continue;
		}

		const logicalAtom = resolveLogicalInlineAtomUnit(atomElement);
		const atomOffset = getOffsetBeforeNode(container, logicalAtom);
		bestOffset =
			clientX <= rect.left + rect.width / 2 ? atomOffset : atomOffset + 1;
		bestScore = score;
	}

	return bestOffset;
}

export function domPointToLogicalOffset(
	container: HTMLElement,
	targetNode: Node,
	targetOffset: number,
): number {
	const boundaryAncestor = findInlineAtomCaretBoundaryAncestor(
		targetNode,
		container,
	);
	if (boundaryAncestor) {
		const side = boundaryAncestor.getAttribute(
			DATA_ATTRS.inlineAtomCaretSide,
		) as InlineAtomCaretBoundarySide | null;
		const host = getInlineAtomHostElement(boundaryAncestor);
		if (host && (side === "before" || side === "after")) {
			const hostOffset = getOffsetBeforeNode(container, host);
			return side === "before" ? hostOffset : hostOffset + 1;
		}
	}

	const atomAncestor = findInlineAtomAncestor(targetNode, container);
	if (atomAncestor) {
		const logicalAtom = resolveLogicalInlineAtomUnit(atomAncestor);
		const atomOffset = getOffsetBeforeNode(container, logicalAtom);
		if (logicalAtom === targetNode || isInlineAtomChipNode(atomAncestor)) {
			return targetOffset <= 0 ? atomOffset : atomOffset + 1;
		}
		return atomOffset + 1;
	}

	const resolved = resolveLogicalOffset(container, targetNode, targetOffset);
	return resolved ?? getLogicalNodeLength(container);
}

export function findLogicalDOMPoint(
	container: HTMLElement,
	offset: number,
): { node: Node; offset: number } {
	return findLogicalDOMPointInElement(container, Math.max(0, offset));
}

function getLogicalNodeText(node: Node): string {
	if (
		isInlineAtomCaretBoundaryNode(node) ||
		hasInlineAtomCaretBoundaryAncestor(node)
	) {
		return "";
	}

	if (isInlineAtomHostNode(node)) {
		return INLINE_ATOM_REPLACEMENT_TEXT;
	}

	if (isInlineAtomChipNode(node)) {
		return getInlineAtomHostElement(node)
			? ""
			: INLINE_ATOM_REPLACEMENT_TEXT;
	}

	if (node.nodeType === Node.TEXT_NODE) {
		return node.textContent ?? "";
	}

	let text = "";
	for (const child of Array.from(node.childNodes)) {
		text += getLogicalNodeText(child);
	}
	return text;
}

function findInlineAtomCaretBoundaryAncestor(
	node: Node,
	container: HTMLElement,
): HTMLElement | null {
	let current: Node | null = node;
	while (current && current !== container) {
		if (isInlineAtomCaretBoundaryNode(current)) {
			return current;
		}
		current = current.parentNode;
	}
	return null;
}

function hasInlineAtomCaretBoundaryAncestor(node: Node): boolean {
	let current: Node | null = node.parentNode;
	while (current) {
		if (isInlineAtomCaretBoundaryNode(current)) {
			return true;
		}
		if (isInlineAtomHostNode(current)) {
			return false;
		}
		current = current.parentNode;
	}
	return false;
}

function findInlineAtomAncestor(
	node: Node,
	container: HTMLElement,
): HTMLElement | null {
	let current: Node | null = node;
	while (current && current !== container) {
		if (isInlineAtomNode(current)) {
			return current;
		}
		current = current.parentNode;
	}
	return null;
}

function getOffsetBeforeNode(container: HTMLElement, target: Node): number {
	let offset = 0;
	let found = false;

	const visit = (node: Node) => {
		if (found) {
			return;
		}
		if (node === target) {
			found = true;
			return;
		}
		if (node !== container) {
			offset += getLogicalNodeLength(node);
			return;
		}
		for (const child of Array.from(node.childNodes)) {
			visit(child);
			if (found) {
				return;
			}
		}
	};

	visit(container);
	return offset;
}

function resolveLogicalOffset(
	current: Node,
	targetNode: Node,
	targetOffset: number,
): number | null {
	if (current === targetNode) {
		if (isInlineAtomHostNode(current)) {
			return targetOffset <= 0 ? 0 : 1;
		}

		if (isInlineAtomChipNode(current)) {
			return getInlineAtomHostElement(current)
				? null
				: targetOffset <= 0
					? 0
					: 1;
		}

		if (isInlineAtomCaretBoundaryNode(current)) {
			return 0;
		}

		if (current.nodeType === Node.TEXT_NODE) {
			return Math.min(targetOffset, current.textContent?.length ?? 0);
		}

		let offset = 0;
		const children = Array.from(current.childNodes);
		for (
			let index = 0;
			index < targetOffset && index < children.length;
			index += 1
		) {
			offset += getLogicalNodeLength(children[index]);
		}
		return offset;
	}

	if (
		current.nodeType === Node.TEXT_NODE ||
		isInlineAtomHostNode(current) ||
		isInlineAtomChipNode(current) ||
		isInlineAtomCaretBoundaryNode(current)
	) {
		return null;
	}

	let offset = 0;
	for (const child of Array.from(current.childNodes)) {
		const childOffset = resolveLogicalOffset(
			child,
			targetNode,
			targetOffset,
		);
		if (childOffset !== null) {
			return offset + childOffset;
		}
		offset += getLogicalNodeLength(child);
	}

	return null;
}

function findLogicalDOMPointInElement(
	element: HTMLElement,
	offset: number,
): { node: Node; offset: number } {
	let remaining = offset;
	const children = Array.from(element.childNodes);

	for (let index = 0; index < children.length; index += 1) {
		const child = children[index];
		const length = getLogicalNodeLength(child);

		if (remaining === 0) {
			if (isInlineAtomHostNode(child)) {
				const boundaryPoint = getInlineAtomCaretBoundaryTextPoint(
					child,
					"before",
				);
				if (boundaryPoint) {
					return boundaryPoint;
				}
			}
			return { node: element, offset: index };
		}

		if (child.nodeType === Node.TEXT_NODE) {
			if (remaining <= length) {
				return { node: child, offset: remaining };
			}
			remaining -= length;
			continue;
		}

		if (isInlineAtomHostNode(child)) {
			if (remaining <= 1) {
				const boundaryPoint = getInlineAtomCaretBoundaryTextPoint(
					child,
					remaining === 0 ? "before" : "after",
				);
				if (boundaryPoint) {
					return boundaryPoint;
				}
				return { node: element, offset: index + 1 };
			}
			remaining -= 1;
			continue;
		}

		if (isInlineAtomChipNode(child)) {
			if (remaining <= 1) {
				return { node: element, offset: index + 1 };
			}
			remaining -= 1;
			continue;
		}

		if (isInlineAtomCaretBoundaryNode(child)) {
			continue;
		}

		if (remaining <= length && child instanceof HTMLElement) {
			return findLogicalDOMPointInElement(child, remaining);
		}

		remaining -= length;
	}

	return { node: element, offset: children.length };
}
