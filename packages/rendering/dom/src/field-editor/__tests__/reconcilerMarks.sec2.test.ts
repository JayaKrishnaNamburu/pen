// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { applyElementAttributes } from "../reconcilerMarks";

describe("applyElementAttributes SEC2 URL keys", () => {
	it("SEC2: case-folded href/src and xlink:href go through urlPolicy", () => {
		const hostile = "javascript:alert(1)";

		for (const key of [
			"HREF",
			"Href",
			"SRC",
			"Src",
			"xlink:href",
		] as const) {
			const element = document.createElement("span");
			applyElementAttributes(element, {
				[key]: hostile,
				"data-ok": "yes",
			});

			expect(
				element.outerHTML,
				`${key} must not write an unsanitized javascript: URL`,
			).not.toContain("javascript:");
			expect(element.hasAttribute(key)).toBe(false);
			expect(element.hasAttribute(key.toLowerCase())).toBe(false);
			expect(element.getAttribute("data-pen-blocked-url")).toBe("");
			expect(element.getAttribute("data-ok")).toBe("yes");
		}
	});
});
