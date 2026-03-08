import { expect, test, type Page } from "@playwright/test";

const HISTORY_GROUP_SETTLE_MS = 450;

interface SelectionPointSnapshot {
	blockId: string | null;
	offset: number;
}

interface SelectionSnapshot {
	isCollapsed: boolean;
	anchor: SelectionPointSnapshot | null;
	focus: SelectionPointSnapshot | null;
}

test.beforeEach(async ({ page }) => {
	await page.goto("/");
	await expect(page.locator("[data-pen-inline-content]").first()).toBeVisible();
});

test("restores same-block caret offsets through undo and redo", async ({
	page,
}) => {
	const firstInline = page.locator("[data-pen-inline-content]").first();

	await firstInline.click();
	const firstBlockId = await getBlockId(page, 0);

	await page.keyboard.type("Hello");
	await page.waitForTimeout(HISTORY_GROUP_SETTLE_MS);
	await page.keyboard.press("ArrowLeft");
	await page.keyboard.type("X");
	await page.waitForTimeout(HISTORY_GROUP_SETTLE_MS);

	await expect(firstInline).toHaveText("HellXo");
	await expectCaretPosition(page, { blockId: firstBlockId, offset: 5 });

	await page.getByRole("button", { name: "Undo" }).click();

	await expect(firstInline).toHaveText("Hello");
	await expectCaretPosition(page, { blockId: firstBlockId, offset: 4 });

	await page.getByRole("button", { name: "Redo" }).click();

	await expect(firstInline).toHaveText("HellXo");
	await expectCaretPosition(page, { blockId: firstBlockId, offset: 5 });
});

test("keeps content visible and moves the caret across blocks via topbar history", async ({
	page,
}) => {
	const firstInline = page.locator("[data-pen-inline-content]").first();

	await firstInline.click();
	const firstBlockId = await getBlockId(page, 0);

	await page.keyboard.type("Hello");
	await page.waitForTimeout(HISTORY_GROUP_SETTLE_MS);
	await page.keyboard.press("Enter");

	await expect(page.locator("[data-pen-editor-block]")).toHaveCount(2);

	const insertedBlockId = await getBlockId(page, 1);
	await expectCaretPosition(page, { blockId: insertedBlockId, offset: 0 });

	await page.getByRole("button", { name: "Undo" }).click();

	await expect(page.locator("[data-pen-editor-block]")).toHaveCount(1);
	await expect(firstInline).toHaveText("Hello");
	await expectCaretPosition(page, { blockId: firstBlockId, offset: 5 });

	await page.getByRole("button", { name: "Redo" }).click();

	await expect(page.locator("[data-pen-editor-block]")).toHaveCount(2);
	await expect(firstInline).toHaveText("Hello");

	const redoneBlockId = await getBlockId(page, 1);
	await expectCaretPosition(page, { blockId: redoneBlockId, offset: 0 });
});

test("restores history through keyboard shortcuts", async ({ page }) => {
	const firstInline = page.locator("[data-pen-inline-content]").first();

	await firstInline.click();
	const firstBlockId = await getBlockId(page, 0);

	await page.keyboard.type("Hello");
	await page.waitForTimeout(HISTORY_GROUP_SETTLE_MS);
	await page.keyboard.press("Enter");

	await expect(page.locator("[data-pen-editor-block]")).toHaveCount(2);

	const insertedBlockId = await getBlockId(page, 1);
	await expectCaretPosition(page, { blockId: insertedBlockId, offset: 0 });

	await page.keyboard.press("ControlOrMeta+Z");

	await expect(page.locator("[data-pen-editor-block]")).toHaveCount(1);
	await expect(firstInline).toHaveText("Hello");
	await expectCaretPosition(page, { blockId: firstBlockId, offset: 5 });

	await page.keyboard.press("ControlOrMeta+Shift+Z");

	await expect(page.locator("[data-pen-editor-block]")).toHaveCount(2);
	const redoneBlockId = await getBlockId(page, 1);
	await expect(redoneBlockId).toBe(insertedBlockId);
	await expectCaretPosition(page, { blockId: insertedBlockId, offset: 0 });
});

async function getBlockId(page: Page, index: number): Promise<string> {
	const blockId = await page
		.locator("[data-pen-editor-block]")
		.nth(index)
		.getAttribute("data-block-id");

	expect(blockId).toBeTruthy();
	return blockId!;
}

async function expectCaretPosition(
	page: Page,
	expected: { blockId: string; offset: number },
): Promise<void> {
	await expect
		.poll(async () => getSelectionSnapshot(page))
		.toMatchObject({
			isCollapsed: true,
			anchor: expected,
			focus: expected,
		});
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
		};
	});
}
