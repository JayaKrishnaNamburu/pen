import { expect, test } from "@playwright/test";
import { analyzeEditorWcag22Aa, formatAxeViolations } from "../src/axeSurface";
import { FIXTURE_NAMES } from "../fixtures/catalog";

for (const fixture of FIXTURE_NAMES) {
	test(`AX8: axe WCAG 2.2 AA on ${fixture}`, async ({ page }) => {
		await page.goto("/");
		await expect(page.locator("[data-pen-inline-content]").first()).toBeVisible();
		await page.evaluate((fixtureName) => {
			window.__penConformance.load(fixtureName);
		}, fixture);
		await expect(page.locator(`[data-fixture="${fixture}"]`)).toBeVisible();
		const results = await analyzeEditorWcag22Aa(page);
		expect(
			results.violations,
			formatAxeViolations(results.violations),
		).toEqual([]);
	});
}
