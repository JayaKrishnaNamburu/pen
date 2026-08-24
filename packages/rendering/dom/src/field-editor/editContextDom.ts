import type { FieldEditorTextChangeEvent } from "./crdt";
import {
	findEmptyBlockPlaceholder,
	isEmptyBlockPlaceholder,
} from "./emptyBlockPlaceholder";
import { findLogicalDOMPoint } from "./inlineAtomDom";
import { logicalLength } from "./offsetDomain";

export type EditContextTextFormat = {
	rangeStart: number;
	rangeEnd: number;
	underlineStyle?: string;
	underlineThickness?: string;
};

export function applyEditContextTextFormats(
	element: HTMLElement,
	ranges: readonly EditContextTextFormat[],
): void {
	for (const fmt of ranges) {
		const { rangeStart, rangeEnd, underlineStyle, underlineThickness } =
			fmt;
		if (!underlineStyle) continue;

		const inlineEls = element.querySelectorAll("[data-pen-inline-content]");
		for (const el of inlineEls) {
			const walker = document.createTreeWalker(
				el,
				NodeFilter.SHOW_TEXT,
				null,
			);
			let offset = 0;
			let textNode: Text | null;
			while ((textNode = walker.nextNode() as Text | null)) {
				const len = textNode.textContent?.length ?? 0;
				const segStart = offset;
				const segEnd = offset + len;
				if (segEnd > rangeStart && segStart < rangeEnd) {
					const parentEl = textNode.parentElement;
					if (parentEl) {
						parentEl.style.textDecoration = underlineStyle;
						if (underlineThickness) {
							parentEl.style.textDecorationThickness =
								underlineThickness;
						}
					}
				}
				offset += len;
			}
		}
	}
}

export function buildEditContextCharacterBounds(
	element: HTMLElement,
	rangeStart: number,
	rangeEnd: number,
): DOMRect[] {
	const rects: DOMRect[] = [];
	for (let index = rangeStart; index < rangeEnd; index += 1) {
		rects.push(getCharacterRect(element, index));
	}
	return rects;
}

export function findTextPosition(
	container: HTMLElement,
	charOffset: number,
): { node: Node; offset: number } | null {
	const walker = document.createTreeWalker(
		container,
		NodeFilter.SHOW_TEXT,
		null,
	);
	let remaining = charOffset;
	let textNode: Text | null;

	while ((textNode = walker.nextNode() as Text | null)) {
		const len = textNode.textContent?.length ?? 0;
		if (remaining <= len) {
			return { node: textNode, offset: remaining };
		}
		remaining -= len;
	}

	if (isEmptyBlockPlaceholder(container.lastChild)) {
		return findLogicalDOMPoint(container, 0);
	}

	const last = container.lastChild;
	if (last) {
		return { node: last, offset: last.textContent?.length ?? 0 };
	}
	return { node: container, offset: 0 };
}

export function isLogicallyEmptyText(text: string): boolean {
	return logicalLength(text) === 0;
}

export function toEditContextText(text: string): string {
	return text;
}

export function shouldReplaceEditContextText(
	delta: FieldEditorTextChangeEvent["delta"],
	editContextTextLength: number,
): boolean {
	let offset = 0;
	for (const entry of delta) {
		if (entry.retain != null) {
			offset += entry.retain;
			if (offset > editContextTextLength) return true;
		} else if (typeof entry.insert === "string") {
			if (logicalLength(entry.insert) === 0 && entry.insert.length > 0) {
				return true;
			}
			if (offset > editContextTextLength) return true;
			offset += entry.insert.length;
		} else if (entry.delete != null) {
			if (offset + entry.delete > editContextTextLength) return true;
		}
	}
	return false;
}

export function isNavigationSelectionKey(event: KeyboardEvent): boolean {
	switch (event.key) {
		case "ArrowLeft":
		case "ArrowRight":
		case "ArrowUp":
		case "ArrowDown":
		case "Home":
		case "End":
		case "PageUp":
		case "PageDown":
			return true;
		default:
			return false;
	}
}

function getCharacterRect(element: HTMLElement, charOffset: number): DOMRect {
	const walker = document.createTreeWalker(
		element,
		NodeFilter.SHOW_TEXT,
		null,
	);
	let remaining = charOffset;
	let textNode: Text | null;

	while ((textNode = walker.nextNode() as Text | null)) {
		const len = textNode.textContent?.length ?? 0;
		if (remaining < len) {
			const range = document.createRange();
			range.setStart(textNode, remaining);
			range.setEnd(textNode, remaining + 1);
			return range.getBoundingClientRect();
		}
		remaining -= len;
	}

	const placeholder = findEmptyBlockPlaceholder(element);
	if (placeholder) {
		return placeholder.getBoundingClientRect();
	}
	return element.getBoundingClientRect();
}
