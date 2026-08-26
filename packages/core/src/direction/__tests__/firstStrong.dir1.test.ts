import { describe, expect, it } from "vitest";

import { resolveFirstStrong } from "../firstStrong";

describe("resolveFirstStrong DIR1", () => {
	it("DIR1: Latin first-strong is ltr", () => {
		expect(resolveFirstStrong("Hello")).toBe("ltr");
		expect(resolveFirstStrong("Hello", "rtl")).toBe("ltr");
	});

	it("DIR1: Arabic first-strong is rtl", () => {
		expect(resolveFirstStrong("مرحبا")).toBe("rtl");
		expect(resolveFirstStrong("مرحبا", "ltr")).toBe("rtl");
	});

	it("DIR1: Hebrew first-strong is rtl", () => {
		expect(resolveFirstStrong("שלום")).toBe("rtl");
		expect(resolveFirstStrong("שלום", "ltr")).toBe("rtl");
	});

	it("DIR1: digits-only falls through to base", () => {
		expect(resolveFirstStrong("12345")).toBe("ltr");
		expect(resolveFirstStrong("12345", "rtl")).toBe("rtl");
	});

	it("DIR1: neutrals-only falls through to base", () => {
		expect(resolveFirstStrong("...")).toBe("ltr");
		expect(resolveFirstStrong("!!!", "rtl")).toBe("rtl");
	});

	it("DIR1: mixed leading neutrals yield the first strong", () => {
		expect(resolveFirstStrong("...Hello")).toBe("ltr");
		expect(resolveFirstStrong("...مرحبا")).toBe("rtl");
		expect(resolveFirstStrong("  42 שלום")).toBe("rtl");
	});
});
