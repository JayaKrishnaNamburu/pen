import { expect, test } from "@playwright/test";
import {
	clickParagraphText,
	openPlayground,
	readFocusSinkOwnsDocumentFocus,
	readSelection,
	replaceWithParagraphThenNonText,
} from "./penPlayground.utils";

test.describe("N2 / G5 / HOST9 vertical caret onto non-text", () => {
	test("ArrowDown onto an image writes BlockSelection and parks focus on the sink", async ({
		page,
	}) => {
		await openPlayground(page);
		const { paragraphId, nonTextId } = await replaceWithParagraphThenNonText(
			page,
			{ blockId: "e2e-image", blockType: "image" },
		);

		await clickParagraphText(page, paragraphId);
		await page.keyboard.press("ArrowDown");

		await expect
			.poll(async () => readSelection(page))
			.toEqual({
				type: "block",
				blockIds: [nonTextId],
				head: nonTextId,
			});
		await expect
			.poll(async () => readFocusSinkOwnsDocumentFocus(page))
			.toBe(true);
	});

	test("ArrowDown onto a table keeps a collapsed text caret", async ({
		page,
	}) => {
		await openPlayground(page);
		const { paragraphId, nonTextId } = await replaceWithParagraphThenNonText(
			page,
			{ blockId: "e2e-table", blockType: "table" },
		);

		await clickParagraphText(page, paragraphId);
		await page.keyboard.press("ArrowDown");

		await expect
			.poll(async () => {
				const selection = await readSelection(page);
				if (selection?.type !== "text") {
					return selection;
				}
				return {
					type: selection.type,
					blockId: selection.focus.blockId,
					offset: selection.focus.offset,
					collapsed:
						selection.anchor.blockId === selection.focus.blockId &&
						selection.anchor.offset === selection.focus.offset,
				};
			})
			.toEqual({
				type: "text",
				blockId: nonTextId,
				offset: 0,
				collapsed: true,
			});
	});
});
