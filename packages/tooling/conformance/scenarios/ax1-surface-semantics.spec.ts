import { expect } from "@playwright/test";
import { analyzeEditorSurface, formatAxeViolations } from "../src/axeSurface";
import { FIXTURE_NAMES } from "../fixtures/catalog";
import { scenario } from "../src/scenario";

for (const fixture of FIXTURE_NAMES) {
	scenario(`AX1: axe surface semantics on ${fixture}`, async (s, page) => {
		await s.load(fixture);
		const results = await analyzeEditorSurface(page);
		expect(
			results.violations,
			formatAxeViolations(results.violations),
		).toEqual([]);
	});
}
