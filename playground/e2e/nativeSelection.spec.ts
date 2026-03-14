import { expect, test, type Page } from "@playwright/test";

interface SelectionPointSnapshot {
	blockId: string | null;
	offset: number;
}

interface SelectionSnapshot {
	isCollapsed: boolean;
	anchor: SelectionPointSnapshot | null;
	focus: SelectionPointSnapshot | null;
	text: string;
}

test.beforeEach(async ({ page }) => {
	await page.goto("/");
	await expect(page.locator("[data-pen-inline-content]").first()).toBeVisible();
});

test("collapses an immediate follow-up click after triple-click paragraph selection", async ({
	page,
}) => {
	const firstInline = page.locator("[data-pen-inline-content]").first();
	const paragraphText = "Alpha bravo charlie delta echo";

	await firstInline.click();
	await page.keyboard.type(paragraphText);

	const blockId = await getBlockId(page, 0);
	const paragraphPoint = await getInlineOffsetPoint(page, blockId, 5);

	await page.mouse.click(paragraphPoint.x, paragraphPoint.y, { clickCount: 3 });

	await expect
		.poll(async () => getSelectionSnapshot(page))
		.toMatchObject({
			isCollapsed: false,
			text: paragraphText,
			anchor: { blockId },
			focus: { blockId },
		});

	const caretOffset = 12;
	const caretPoint = await getInlineOffsetPoint(page, blockId, caretOffset);

	await page.mouse.click(caretPoint.x, caretPoint.y);

	await expect
		.poll(async () => getSelectionSnapshot(page))
		.toMatchObject({
			isCollapsed: true,
			text: "",
			anchor: { blockId, offset: caretOffset },
			focus: { blockId, offset: caretOffset },
		});
});

async function getBlockId(page: Page, index: number): Promise<string> {
	const blockId = await page
		.locator("[data-pen-editor-block]")
		.nth(index)
		.getAttribute("data-block-id");

	expect(blockId).toBeTruthy();
	return blockId!;
}

async function getInlineOffsetPoint(
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

			const inlineElement = blockElement.querySelector("[data-pen-inline-content]");
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

async function getSelectionSnapshot(
	page: Page,
): Promise<SelectionSnapshot | null> {
	return page.evaluate(() => {
		const selection = window.getSelection();
		if (
			!selection ||
			selection.rangeCount === 0 ||
			!selection.anchorNode ||
			!selection.focusNode
		) {
			return null;
		}

		const toPoint = (
			node: Node,
			offset: number,
		): SelectionPointSnapshot | null => {
			const ownerElement =
				node.nodeType === Node.ELEMENT_NODE
					? (node as Element)
					: node.parentElement;
			const blockElement = ownerElement?.closest("[data-block-id]");
			if (!blockElement) {
				return null;
			}

			const inlineElement = blockElement.querySelector(
				"[data-pen-inline-content]",
			);
			if (!(inlineElement instanceof HTMLElement)) {
				return null;
			}

			const range = document.createRange();
			range.selectNodeContents(inlineElement);
			try {
				range.setEnd(node, offset);
			} catch {
				return null;
			}

			return {
				blockId: blockElement.getAttribute("data-block-id"),
				offset: range.toString().length,
			};
		};

		return {
			isCollapsed: selection.isCollapsed,
			anchor: toPoint(selection.anchorNode, selection.anchorOffset),
			focus: toPoint(selection.focusNode, selection.focusOffset),
			text: selection.toString(),
		};
	});
}
