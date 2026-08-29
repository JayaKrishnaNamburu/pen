import { expect, test } from "@playwright/test";
import {
	MODIFIER,
	clickParagraphText,
	openPlayground,
	readFirstBlockInlineDeltas,
	readInlineDeltas,
	replaceWithMentionParagraph,
} from "./penPlayground.utils";

test.describe("IOP7 / IOP8 clipboard inline atom", () => {
	test("copy and paste keep a mention through the real clipboard", async ({
		page,
	}, testInfo) => {
		test.skip(
			testInfo.project.name !== "chromium",
			"grantPermissions(clipboard-read) is Chromium-only in Playwright",
		);

		await page
			.context()
			.grantPermissions(["clipboard-read", "clipboard-write"]);
		await openPlayground(page);
		const { blockId } = await replaceWithMentionParagraph(page);

		await clickParagraphText(page, blockId);
		await page.keyboard.press(`${MODIFIER}+a`);
		await page.keyboard.press(`${MODIFIER}+c`);

		await expect
			.poll(async () => page.evaluate(() => navigator.clipboard.readText()))
			.toBe("hello @Ada world");

		await page.keyboard.press("Backspace");
		await expect
			.poll(async () => readInlineDeltas(page, blockId))
			.toEqual([]);

		await page.keyboard.press(`${MODIFIER}+v`);
		await expect
			.poll(async () => readFirstBlockInlineDeltas(page))
			.toEqual([
				{ insert: "hello " },
				{
					insert: {
						type: "mention",
						props: { id: "user-1", label: "Ada" },
					},
				},
				{ insert: " world" },
			]);
	});
});
