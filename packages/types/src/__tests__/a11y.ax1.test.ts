import { describe, expect, it } from "vitest";

import { isA11yLabelledBy, type A11yLabel } from "../types/a11y";

describe("A11yLabel (AX1)", () => {
	it("AX1: distinguishes aria-label strings from labelledBy objects", () => {
		const label: A11yLabel = "Compose email";
		const labelledBy: A11yLabel = { labelledBy: "page-title" };
		expect(isA11yLabelledBy(label)).toBe(false);
		expect(isA11yLabelledBy(labelledBy)).toBe(true);
	});
});
