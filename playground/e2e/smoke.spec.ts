import { expect, test } from "@playwright/test";

test("playground boots with an editor", async ({ page }) => {
	await page.goto("/");
	await expect(page.locator(".editor-pane")).toBeVisible();
	await expect
		.poll(async () =>
			page.evaluate(() => Boolean(window.penPlayground?.editor)),
		)
		.toBe(true);
});
