import { test } from "@playwright/test";

test("dump playground boot", async ({ page }) => {
	page.on("console", (message) => {
		console.log(`BROWSER ${message.type()}: ${message.text()}`);
	});
	page.on("pageerror", (error) => {
		console.log(`PAGEERROR: ${error.message}`);
	});
	await page.goto(`/?room=pen-e2e-debug-${Date.now()}`);
	await page.waitForTimeout(4_000);
	const nameCount = await page.getByLabel("Display name").count();
	const joinCount = await page
		.getByRole("button", { name: "Join playground" })
		.count();
	const rootCount = await page.locator("[data-pen-editor-root]").count();
	const bodyText = await page.locator("body").innerText();
	console.log(
		JSON.stringify({ nameCount, joinCount, rootCount, bodyText }, null, 2),
	);
	if (nameCount > 0) {
		await page.getByLabel("Display name").fill("Playwright");
		await page.getByRole("button", { name: "Join playground" }).click();
		await page.waitForTimeout(4_000);
		console.log(
			JSON.stringify(
				{
					rootAfterJoin: await page
						.locator("[data-pen-editor-root]")
						.count(),
					bodyAfterJoin: await page.locator("body").innerText(),
				},
				null,
				2,
			),
		);
	}
});
