import { expect, test } from "@playwright/test";
import {
	MODIFIER,
	clickParagraphText,
	openPlayground,
	readNativeSelectionPaint,
	readSelection,
	replaceWithParagraphThenNonText,
} from "./penPlayground.utils";

test.describe("T1 / O4 select-all across a non-text block", () => {
	test("the content rung paints the native selection over a divider tail", async ({
		page,
	}) => {
		await openPlayground(page);
		const { paragraphId, nonTextId } =
			await replaceWithParagraphThenNonText(page, {
				blockId: "e2e-divider",
				blockType: "divider",
			});

		await clickParagraphText(page, paragraphId);
		await page.keyboard.press(`${MODIFIER}+a`);

		await expect
			.poll(async () => readSelection(page))
			.toMatchObject({
				type: "text",
				anchor: { blockId: paragraphId, offset: 0 },
				focus: { blockId: nonTextId, offset: 1 },
			});

		await expect
			.poll(async () => readNativeSelectionPaint(page, nonTextId))
			.toEqual({
				isCollapsed: false,
				hasPaintedRects: true,
				coversBlock: true,
			});
	});
});
