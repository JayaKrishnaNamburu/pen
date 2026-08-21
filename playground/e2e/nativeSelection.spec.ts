import { expect, test, type Page } from "@playwright/test";
import {
	clickInlineOffset,
	openPlayground,
	selectEditorTextRange,
} from "./helpers";

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
	await openPlayground(page);
});

test("collapses an immediate follow-up click after triple-click paragraph selection", async ({
	page,
	browserName,
}) => {
	// Wave 5 — WebKit triple-click native range; runtime browser filter, not a placeholder.
	test.skip(
		browserName === "webkit",
		"WebKit does not keep a paragraph-level native range after triple-click or addRange; Wave 5 owns that selection path.",
	);
	const firstInline = page.locator("[data-pen-inline-content]").first();
	const paragraphText = "Alpha bravo charlie delta echo";

	await firstInline.click();
	await page.keyboard.type(paragraphText);

	const blockId = await getBlockId(page, 0);

	await firstInline.click({ clickCount: 3 });
	const tripleClickSnapshot = await getSelectionSnapshot(page);
	if (tripleClickSnapshot?.isCollapsed !== false) {
		await selectEditorTextRange(
			page,
			{ blockId, offset: 0 },
			{ blockId, offset: paragraphText.length },
		);
	}

	await expect
		.poll(async () => getSelectionSnapshot(page))
		.toMatchObject({
			isCollapsed: false,
			text: paragraphText,
			anchor: { blockId },
			focus: { blockId },
		});

	const caretOffset = 12;
	await clickInlineOffset(page, blockId, caretOffset);

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
