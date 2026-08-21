import { describe, expect, it } from "vitest";

import {
	createDirectionCache,
	fingerprintDirectionInput,
} from "../cache";

describe("direction cache DIR1", () => {
	it("DIR1: fingerprint changes when text, props, or facet key change", () => {
		const base = fingerprintDirectionInput("Hello", { direction: "auto" }, "ltr:0");
		expect(
			fingerprintDirectionInput("Hallo", { direction: "auto" }, "ltr:0"),
		).not.toBe(base);
		expect(
			fingerprintDirectionInput("Hello", { direction: "rtl" }, "ltr:0"),
		).not.toBe(base);
		expect(
			fingerprintDirectionInput("Hello", { direction: "auto" }, "rtl:0"),
		).not.toBe(base);
	});

	it("DIR1: get misses after text/props change, invalidate, or clear", () => {
		const cache = createDirectionCache();
		cache.set("b1", "Hello", { direction: "auto" }, "ltr", "ltr:0");
		expect(cache.get("b1", "Hello", { direction: "auto" }, "ltr:0")).toBe("ltr");
		expect(cache.get("b1", "مرحبا", { direction: "auto" }, "ltr:0")).toBeUndefined();

		cache.set("b1", "مرحبا", { direction: "auto" }, "rtl", "ltr:0");
		cache.invalidate("b1");
		expect(cache.get("b1", "مرحبا", { direction: "auto" }, "ltr:0")).toBeUndefined();

		cache.set("b2", "Hello", {}, "ltr", "ltr:0");
		cache.clear();
		expect(cache.get("b2", "Hello", {}, "ltr:0")).toBeUndefined();
	});
});
