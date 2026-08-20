import { expect, type Page } from "@playwright/test";
import type { Editor } from "@input/pen-types";

declare global {
	interface Window {
		penPlayground?: {
			editor?: Editor;
		};
	}
}

const EDITOR_ROOT = "[data-pen-editor-root]";
const INLINE_CONTENT = "[data-pen-inline-content]";

export async function openPlayground(page: Page, path?: string): Promise<void> {
	await page.goto(path ?? `/?room=${createPlaygroundRoomId()}`);
	await joinPlaygroundIfNeeded(page);
	await expect(page.locator(EDITOR_ROOT)).toBeVisible();
	await expect(page.locator(INLINE_CONTENT).first()).toBeVisible();
}

export async function clickInlineOffset(
	page: Page,
	blockId: string,
	offset: number,
): Promise<void> {
	const point = await getInlineOffsetPoint(page, blockId, offset);
	await page.mouse.click(point.x, point.y);
}

export async function selectEditorTextRange(
	page: Page,
	anchor: { blockId: string; offset: number },
	focus: { blockId: string; offset: number } = anchor,
): Promise<void> {
	await page.evaluate(
		({ nextAnchor, nextFocus }) => {
			const editor = window.penPlayground?.editor;
			if (!editor) {
				throw new Error("Missing playground editor debug handle.");
			}
			editor.selectTextRange(nextAnchor, nextFocus);
		},
		{ nextAnchor: anchor, nextFocus: focus },
	);
}

export async function selectNativeInlineRange(
	page: Page,
	blockId: string,
	startOffset: number,
	endOffset: number,
): Promise<void> {
	await page.evaluate(
		({ targetBlockId, nextStart, nextEnd }) => {
			const blockElement = document.querySelector(
				`[data-block-id="${targetBlockId}"]`,
			);
			if (!(blockElement instanceof HTMLElement)) {
				throw new Error(`Missing block element for ${targetBlockId}`);
			}
			const inlineElement = blockElement.querySelector(
				"[data-pen-inline-content]",
			);
			if (!(inlineElement instanceof HTMLElement)) {
				throw new Error(`Missing inline element for ${targetBlockId}`);
			}

			const resolve = (
				targetOffset: number,
			): { node: Text; offset: number } | null => {
				const walker = document.createTreeWalker(
					inlineElement,
					NodeFilter.SHOW_TEXT,
				);
				let remaining = targetOffset;
				let lastTextNode: Text | null = null;

				while (walker.nextNode()) {
					const textNode = walker.currentNode;
					if (!(textNode instanceof Text)) {
						continue;
					}
					lastTextNode = textNode;
					if (remaining <= textNode.data.length) {
						return { node: textNode, offset: remaining };
					}
					remaining -= textNode.data.length;
				}

				if (!lastTextNode) {
					return null;
				}
				return { node: lastTextNode, offset: lastTextNode.data.length };
			};

			const start = resolve(nextStart);
			const end = resolve(nextEnd);
			if (!start || !end) {
				throw new Error(`Missing text nodes for ${targetBlockId}`);
			}

			const range = document.createRange();
			range.setStart(start.node, start.offset);
			range.setEnd(end.node, end.offset);
			const selection = window.getSelection();
			if (!selection) {
				throw new Error("Missing window selection.");
			}
			selection.removeAllRanges();
			selection.addRange(range);
		},
		{
			targetBlockId: blockId,
			nextStart: startOffset,
			nextEnd: endOffset,
		},
	);
}

export async function getInlineOffsetPoint(
	page: Page,
	blockId: string,
	offset: number,
): Promise<{ x: number; y: number }> {
	return page.evaluate(
		({ targetBlockId, targetOffset }) => {
			const blockElement = document.querySelector(
				`[data-block-id="${targetBlockId}"]`,
			);
			if (!(blockElement instanceof HTMLElement)) {
				throw new Error(`Missing block element for ${targetBlockId}`);
			}
			const inlineElement = blockElement.querySelector(
				"[data-pen-inline-content]",
			);
			if (!(inlineElement instanceof HTMLElement)) {
				throw new Error(`Missing inline element for ${targetBlockId}`);
			}

			const walker = document.createTreeWalker(
				inlineElement,
				NodeFilter.SHOW_TEXT,
			);
			let remaining = targetOffset;
			let targetNode: Text | null = null;
			let offsetInNode = 0;
			let lastTextNode: Text | null = null;

			while (walker.nextNode()) {
				const textNode = walker.currentNode;
				if (!(textNode instanceof Text)) {
					continue;
				}

				lastTextNode = textNode;
				const length = textNode.data.length;
				if (remaining <= length) {
					targetNode = textNode;
					offsetInNode = remaining;
					break;
				}
				remaining -= length;
			}

			if (!targetNode) {
				targetNode = lastTextNode;
				offsetInNode = targetNode?.data.length ?? 0;
			}

			if (!targetNode) {
				const rect = inlineElement.getBoundingClientRect();
				return {
					x: rect.left + 4,
					y: rect.top + rect.height / 2,
				};
			}

			const range = document.createRange();
			if (offsetInNode < targetNode.data.length) {
				range.setStart(targetNode, offsetInNode);
				range.setEnd(targetNode, offsetInNode + 1);
				const rect = range.getBoundingClientRect();
				return {
					x: rect.left + 1,
					y: rect.top + rect.height / 2,
				};
			}

			if (offsetInNode > 0) {
				range.setStart(targetNode, offsetInNode - 1);
				range.setEnd(targetNode, offsetInNode);
				const rect = range.getBoundingClientRect();
				return {
					x: rect.right - 1,
					y: rect.top + rect.height / 2,
				};
			}

			const rect = inlineElement.getBoundingClientRect();
			return {
				x: rect.left + 4,
				y: rect.top + rect.height / 2,
			};
		},
		{ targetBlockId: blockId, targetOffset: offset },
	);
}

function createPlaygroundRoomId(): string {
	return `pen-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function joinPlaygroundIfNeeded(page: Page): Promise<void> {
	const nameInput = page.getByLabel("Display name");
	const editorRoot = page.locator(EDITOR_ROOT);
	await expect(nameInput.or(editorRoot)).toBeVisible();
	if (await editorRoot.isVisible()) {
		return;
	}

	await nameInput.fill("Playwright");
	const joinButton = page.getByRole("button", { name: "Join playground" });
	await expect(joinButton).toBeEnabled();
	await joinButton.click();
}
