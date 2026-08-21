import { expect, test } from "@playwright/test";

test("editor mounts and accepts typed text", async ({ page }) => {
	await page.goto("/");

	const editor = page.getByRole("textbox", { name: "Editor" });
	await expect(editor).toBeVisible();

	const inline = page.locator("[data-pen-inline-content]").first();
	await expect(inline).toBeVisible();
	await inline.click();
	await page.keyboard.type("x");
	await expect(inline).toContainText("x");
});
