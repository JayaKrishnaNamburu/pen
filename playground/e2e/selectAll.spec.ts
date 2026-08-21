import { expect, test } from "@playwright/test";
import {
	getEditorDocumentSnapshot,
	openPlayground,
	seedParagraphs,
} from "./helpers";

test.beforeEach(async ({ page }) => {
	await openPlayground(page);
});

test("selects the full structured document on first cmd+a", async ({ page }) => {
	await seedParagraphs(page, ["First", "Second", "Third"]);

	const inlines = page.locator("[data-pen-inline-content]");
	await expect(inlines).toHaveCount(3);
	await expect(inlines.nth(0)).toHaveText("First");
	await expect(inlines.nth(1)).toHaveText("Second");
	await expect(inlines.nth(2)).toHaveText("Third");

	await inlines.first().click({ position: { x: 10, y: 10 } });
	await expect
		.poll(async () => (await getEditorDocumentSnapshot(page)).editorSelection?.type)
		.toBe("text");

	await page.keyboard.press("ControlOrMeta+A");

	const afterSelectAll = await getEditorDocumentSnapshot(page);
	await test.info().attach("selectAll-after-cmd-a", {
		body: JSON.stringify(afterSelectAll, null, 2),
		contentType: "application/json",
	});

	await expect
		.poll(async () => (await getEditorDocumentSnapshot(page)).selectedText)
		.toBe("First\nSecond\nThird");
});

test("keeps table available in the structured playground slash menu", async ({
	page,
}) => {
	const firstInline = page.locator("[data-pen-inline-content]").first();

	await firstInline.click();
	await page.keyboard.press("/");

	const slashMenu = page.locator("[data-pen-slash-menu]");
	await expect(slashMenu).toHaveAttribute("data-open", "");
	await expect(slashMenu).toContainText("Table");
});
