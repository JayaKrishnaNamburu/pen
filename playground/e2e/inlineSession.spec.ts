import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
	await page.goto("/");
	await expect(page.locator("[data-pen-inline-content]").first()).toBeVisible();
});

test("clears and restores the playground inline session with keyboard history", async ({
	page,
	browserName: _browserName,
}) => {
	const firstInline = page.locator("[data-pen-inline-content]").first();
	await firstInline.click();
	await page.keyboard.type("Alpha bravo charlie delta echo");

	const blockId = await getBlockId(page, 0);

	await dragSelect(page, {
		blockId,
		startOffset: 6,
		endOffset: 11,
	});
	await page.locator("[data-pen-ai-selection-trigger]").click();

	const promptInput = page.locator(
		".playground-inline-session [data-pen-ai-inline-session-input]",
	);
	await expect(promptInput).toBeVisible();
	await expect
		.poll(async () =>
			page.locator("[data-pen-ai-inline-session-selection-segment]").count(),
		)
		.toBeGreaterThan(0);

	await dragSelect(page, {
		blockId,
		startOffset: 0,
		endOffset: 5,
	});
	await expect(promptInput).toHaveCount(0);

	await page.keyboard.press("ControlOrMeta+Z");
	await expect(promptInput).toBeVisible();
	await expect
		.poll(async () =>
			page.locator("[data-pen-ai-inline-session-selection-segment]").count(),
		)
		.toBeGreaterThan(0);

	await page.keyboard.press("ControlOrMeta+Shift+Z");
	await expect(promptInput).toHaveCount(0);
});

async function getBlockId(page: Page, index: number): Promise<string> {
	const blockId = await page
		.locator("[data-pen-editor-block]")
		.nth(index)
		.getAttribute("data-block-id");

	expect(blockId).toBeTruthy();
	return blockId!;
}

async function dragSelect(
	page: Page,
	input: {
		blockId: string;
		startOffset: number;
		endOffset: number;
	},
): Promise<void> {
	const start = await getInlineOffsetPoint(page, input.blockId, input.startOffset);
	const end = await getInlineOffsetPoint(page, input.blockId, input.endOffset);
	await page.mouse.move(start.x, start.y);
	await page.mouse.down();
	await page.mouse.move(end.x, end.y, { steps: 8 });
	await page.mouse.up();
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
