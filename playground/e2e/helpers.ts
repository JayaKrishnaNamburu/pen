import { expect, type Page } from "@playwright/test";
import { generateId, type Editor } from "@input/pen-types";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

declare global {
	interface Window {
		penPlayground?: {
			editor?: Editor;
		};
	}
}

const EDITOR_ROOT = "[data-pen-editor-root]";
const INLINE_CONTENT = "[data-pen-inline-content]";
const EVIDENCE_DIR = join(dirname(fileURLToPath(import.meta.url)), "artifacts");

export function writeEvidence(name: string, payload: unknown): void {
	mkdirSync(EVIDENCE_DIR, { recursive: true });
	writeFileSync(
		join(EVIDENCE_DIR, name),
		`${JSON.stringify(payload, null, 2)}\n`,
	);
}

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

export interface NativeSelectionPoint {
	blockId: string | null;
	offset: number;
	nodePath: string;
	domOffset: number;
}

export interface SelectionEvidence {
	editorSelection: unknown;
	editorFocusBlockId: string | null;
	activeElement: {
		tag: string;
		blockId: string | null;
		className: string;
	} | null;
	attachedInlineBlockId: string | null;
	native: {
		isCollapsed: boolean | null;
		text: string;
		rangeCount: number;
		anchor: NativeSelectionPoint | null;
		focus: NativeSelectionPoint | null;
	};
	blocks: Array<{
		id: string;
		text: string;
		active: boolean;
	}>;
}

export interface OverlayEvidence {
	toolbar: { top: number; left: number; bottom: number; right: number } | null;
	session: {
		top: number;
		left: number;
		bottom: number;
		right: number;
		cssTop: string;
		cssLeft: string;
		layoutReady: boolean;
	} | null;
	prompt: { top: number; left: number; bottom: number; right: number } | null;
	viewport: { top: number; left: number; bottom: number; right: number } | null;
	overlapToolbar: boolean;
}

export interface EditorDocumentSnapshot {
	editorBlockCount: number;
	editorBlocks: Array<{
		id: string;
		type: string;
		text: string;
		length: number;
	}>;
	editorSelection: { type: string } | null;
	selectedText: string;
	domTexts: string[];
	nativeText: string;
	nativeCollapsed: boolean | null;
}

export async function getEditorDocumentSnapshot(
	page: Page,
): Promise<EditorDocumentSnapshot> {
	return page.evaluate(() => {
		const editor = window.penPlayground?.editor;
		if (!editor) {
			throw new Error("Missing playground editor debug handle.");
		}

		const selection = editor.selection;
		let editorSelection: unknown = null;
		if (selection?.type === "text") {
			editorSelection = {
				type: selection.type,
				isCollapsed: selection.isCollapsed,
				isMultiBlock: selection.isMultiBlock,
				anchor: selection.anchor,
				focus: selection.focus,
			};
		} else if (selection?.type === "block") {
			editorSelection = {
				type: selection.type,
				blockIds: [...selection.blockIds],
			};
		} else if (selection) {
			editorSelection = { type: selection.type };
		}

		const native = window.getSelection();
		return {
			editorBlockCount: editor.blockCount(),
			editorBlocks: [...editor.blocks()].map((block) => ({
				id: block.id,
				type: block.type,
				text: block.textContent(),
				length: block.length(),
			})),
			editorSelection,
			selectedText: editor.getSelectedText(),
			domTexts: [...document.querySelectorAll("[data-pen-inline-content]")].map(
				(element) => element.textContent ?? "",
			),
			nativeText: native?.toString() ?? "",
			nativeCollapsed: native?.isCollapsed ?? null,
		};
	});
}

export async function captureSelectionEvidence(
	page: Page,
): Promise<SelectionEvidence> {
	return page.evaluate(() => {
		const editor = window.penPlayground?.editor;
		if (!editor) {
			throw new Error("Missing playground editor debug handle.");
		}

		const describeNode = (node: Node | null): string => {
			if (!node) return "null";
			if (node.nodeType === Node.TEXT_NODE) {
				const parent = node.parentElement;
				return `text:${JSON.stringify(node.textContent)}@${parent?.tagName ?? "?"}.${parent?.className ?? ""}`;
			}
			if (node instanceof Element) {
				return `${node.tagName}#${node.id}.${node.className}`;
			}
			return node.nodeName;
		};

		const toPoint = (
			node: Node | null,
			offset: number,
		): NativeSelectionPoint | null => {
			if (!node) return null;
			const ownerElement =
				node.nodeType === Node.ELEMENT_NODE
					? (node as Element)
					: node.parentElement;
			const blockElement = ownerElement?.closest("[data-block-id]");
			const inlineElement = blockElement?.querySelector(
				"[data-pen-inline-content]",
			);
			let logicalOffset = -1;
			if (inlineElement instanceof HTMLElement) {
				const range = document.createRange();
				range.selectNodeContents(inlineElement);
				try {
					range.setEnd(node, offset);
					logicalOffset = range.toString().replaceAll("\u200B", "").length;
				} catch {
					logicalOffset = -1;
				}
			}
			return {
				blockId: blockElement?.getAttribute("data-block-id") ?? null,
				offset: logicalOffset,
				nodePath: describeNode(node),
				domOffset: offset,
			};
		};

		const native = window.getSelection();
		const active = document.activeElement;
		const activeBlock = active?.closest("[data-block-id]");
		const attached = document.querySelector(
			"[data-pen-inline-content]:focus, [data-pen-editor-block] [contenteditable]:focus",
		);
		const attachedBlock = attached?.closest("[data-block-id]");

		return {
			editorSelection: editor.selection,
			editorFocusBlockId:
				editor.selection?.type === "text"
					? editor.selection.focus.blockId
					: editor.selection?.type === "block"
						? (editor.selection.blockIds[0] ?? null)
						: null,
			activeElement: active
				? {
						tag: active.tagName,
						blockId: activeBlock?.getAttribute("data-block-id") ?? null,
						className: active.className,
					}
				: null,
			attachedInlineBlockId:
				attachedBlock?.getAttribute("data-block-id") ?? null,
			native: {
				isCollapsed: native?.isCollapsed ?? null,
				text: native?.toString() ?? "",
				rangeCount: native?.rangeCount ?? 0,
				anchor: toPoint(native?.anchorNode ?? null, native?.anchorOffset ?? 0),
				focus: toPoint(native?.focusNode ?? null, native?.focusOffset ?? 0),
			},
			blocks: [...document.querySelectorAll("[data-pen-editor-block]")].map(
				(element) => ({
					id: element.getAttribute("data-block-id") ?? "",
					text:
						element.querySelector("[data-pen-inline-content]")
							?.textContent ?? "",
					active: element.contains(document.activeElement),
				}),
			),
		};
	});
}

export async function captureOverlayEvidence(
	page: Page,
): Promise<OverlayEvidence> {
	return page.evaluate(() => {
		const box = (element: Element | null) => {
			if (!element) return null;
			const rect = element.getBoundingClientRect();
			return {
				top: rect.top,
				left: rect.left,
				bottom: rect.bottom,
				right: rect.right,
			};
		};
		const toolbar = document.querySelector("header.toolbar");
		const session = document.querySelector(".playground-inline-session");
		const prompt = document.querySelector(
			".playground-inline-session [data-pen-ai-inline-session-input]",
		);
		const viewport = document.querySelector(".playground-editor-viewport");
		const toolbarBox = box(toolbar);
		const promptBox = box(prompt);
		const overlapToolbar = Boolean(
			toolbarBox &&
				promptBox &&
				promptBox.top < toolbarBox.bottom &&
				promptBox.bottom > toolbarBox.top &&
				promptBox.left < toolbarBox.right &&
				promptBox.right > toolbarBox.left,
		);
		return {
			toolbar: toolbarBox,
			session: session
				? {
						...box(session)!,
						cssTop: getComputedStyle(session).top,
						cssLeft: getComputedStyle(session).left,
						layoutReady: session.hasAttribute("data-layout-ready"),
					}
				: null,
			prompt: promptBox,
			viewport: box(viewport),
			overlapToolbar,
		};
	});
}

export async function seedParagraphs(
	page: Page,
	paragraphs: readonly string[],
): Promise<string[]> {
	const splitIds = paragraphs.slice(1).map(() => generateId());
	return page.evaluate(
		({ texts, nextIds }) => {
			const editor = window.penPlayground?.editor;
			if (!editor) {
				throw new Error("Missing playground editor debug handle.");
			}

			const first = editor.firstBlock();
			if (!first) {
				throw new Error("Missing first playground block.");
			}

			const blockIds = [first.id];
			if (texts[0]) {
				editor.apply(
					[
						{
							type: "insert-text",
							blockId: first.id,
							offset: 0,
							text: texts[0],
						},
					],
					{ origin: "user" },
				);
			}

			let currentId = first.id;
			for (let index = 1; index < texts.length; index += 1) {
				const current = editor.getBlock(currentId);
				if (!current) {
					throw new Error(`Missing block ${currentId}`);
				}

				const newBlockId = nextIds[index - 1];
				if (!newBlockId) {
					throw new Error(`Missing split id for paragraph ${index}`);
				}
				editor.apply(
					[
						{
							type: "split-block",
							blockId: currentId,
							offset: current.length(),
							newBlockId,
						},
					],
					{ origin: "user" },
				);
				if (texts[index]) {
					editor.apply(
						[
							{
								type: "insert-text",
								blockId: newBlockId,
								offset: 0,
								text: texts[index],
							},
						],
						{ origin: "user" },
					);
				}
				blockIds.push(newBlockId);
				currentId = newBlockId;
			}

			return blockIds;
		},
		{ texts: paragraphs, nextIds: splitIds },
	);
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
