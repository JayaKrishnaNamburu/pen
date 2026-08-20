import { expect, test } from "@playwright/test";
import { openPlayground } from "./helpers";

test.beforeEach(async ({ page }) => {
	await openPlayground(page);
});

test("selects the full structured document on first cmd+a", async ({ page }) => {
	const firstInline = page.locator("[data-pen-inline-content]").first();

	await firstInline.click();
	await page.keyboard.type("First");
	await page.keyboard.press("Enter");
	await page.keyboard.type("Second");
	await page.keyboard.press("Enter");
	await page.keyboard.type("Third");

	await firstInline.click({ position: { x: 10, y: 10 } });

	await page.keyboard.press("ControlOrMeta+A");

	await expect
		.poll(async () => page.evaluate(() => window.getSelection()?.toString() ?? ""))
		.toMatch(/^First\n+Second\n+Third$/);
});

test("keeps table available in the structured playground slash menu", async ({
	page,
}) => {
	const firstInline = page.locator("[data-pen-inline-content]").first();

	await firstInline.click();
	await page.keyboard.press("/");

	const slashMenu = page.locator("[data-pen-slash-menu]");
	await expect(slashMenu).toHaveAttribute("data-open", "true");
	await expect(slashMenu).toContainText("Table");
});
