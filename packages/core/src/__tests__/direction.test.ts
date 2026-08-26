import { describe, expect, it } from "vitest";

import {
	createDirectionCache,
	fingerprintDirectionInput,
} from "../direction/cache";
import { resolveFirstStrong } from "../direction/firstStrong";

const LRI = "\u2066";
const RLI = "\u2067";
const PDI = "\u2069";
const LRE = "\u202a";
const PDF = "\u202c";

describe("DIR1 — first-strong P2/P3", () => {
	it("DIR1: Latin resolves ltr", () => {
		expect(resolveFirstStrong("Hello")).toBe("ltr");
	});

	it("DIR1: Arabic resolves rtl", () => {
		expect(resolveFirstStrong("مرحبا")).toBe("rtl");
	});

	it("DIR1: Hebrew resolves rtl", () => {
		expect(resolveFirstStrong("שלום")).toBe("rtl");
	});

	it("DIR1: digits-only returns base", () => {
		expect(resolveFirstStrong("12345")).toBe("ltr");
		expect(resolveFirstStrong("12345", "rtl")).toBe("rtl");
	});

	it("DIR1: neutral-only returns base", () => {
		expect(resolveFirstStrong("...!!!")).toBe("ltr");
		expect(resolveFirstStrong("...!!!", "rtl")).toBe("rtl");
	});

	it("DIR1: mixed leading neutrals use the first strong", () => {
		expect(resolveFirstStrong("... Hello")).toBe("ltr");
		expect(resolveFirstStrong("... مرحبا")).toBe("rtl");
		expect(resolveFirstStrong("() שלום")).toBe("rtl");
		expect(resolveFirstStrong("123 Hello")).toBe("ltr");
	});

	it("DIR1: default base is ltr", () => {
		expect(resolveFirstStrong("")).toBe("ltr");
		expect(resolveFirstStrong("   ")).toBe("ltr");
	});

	it("DIR1: P2 skips isolate contents", () => {
		expect(resolveFirstStrong(`${LRI}مرحبا${PDI}Hello`)).toBe("ltr");
		expect(resolveFirstStrong(`${LRI}Hello${PDI}مرحبا`)).toBe("rtl");
		expect(resolveFirstStrong(`${RLI}Hello${PDI}`)).toBe("ltr");
		expect(resolveFirstStrong(`${LRI}مرحبا Hello`)).toBe("ltr");
	});

	it("DIR1: P2 sees strong characters inside embeddings", () => {
		expect(resolveFirstStrong(`${LRE}مرحبا${PDF}Hello`)).toBe("rtl");
	});
});

describe("DIR1 — direction cache", () => {
	it("DIR1: cache hit when text and props are unchanged", () => {
		const cache = createDirectionCache();
		cache.set("b1", "Hello", { direction: "auto" }, "ltr");
		expect(cache.get("b1", "Hello", { direction: "auto" })).toBe("ltr");
	});

	it("DIR1: cache invalidates when text changes", () => {
		const cache = createDirectionCache();
		cache.set("b1", "Hello", {}, "ltr");
		expect(cache.get("b1", "مرحبا", {})).toBeUndefined();
		expect(cache.get("b1", "مرحبا", {})).toBeUndefined();
	});

	it("DIR1: cache invalidates when props change", () => {
		const cache = createDirectionCache();
		cache.set("b1", "Hello", { direction: "auto" }, "ltr");
		expect(cache.get("b1", "Hello", { direction: "rtl" })).toBeUndefined();
	});

	it("DIR1: cache invalidates when facet outputs change", () => {
		const cache = createDirectionCache();
		cache.set("b1", "Hello", {}, "ltr", 1);
		expect(cache.get("b1", "Hello", {}, 2)).toBeUndefined();
		cache.set("b2", "Hello", {}, "ltr", 1);
		cache.clear();
		expect(cache.get("b2", "Hello", {}, 1)).toBeUndefined();
	});

	it("DIR1: invalidate(blockId) drops that entry only", () => {
		const cache = createDirectionCache();
		cache.set("b1", "Hello", {}, "ltr");
		cache.set("b2", "مرحبا", {}, "rtl");
		cache.invalidate("b1");
		expect(cache.get("b1", "Hello", {})).toBeUndefined();
		expect(cache.get("b2", "مرحبا", {})).toBe("rtl");
	});

	it("DIR1: fingerprint changes when text, props, or facet epoch change", () => {
		const a = fingerprintDirectionInput("Hello", { direction: "auto" }, 1);
		const b = fingerprintDirectionInput("Hello!", { direction: "auto" }, 1);
		const c = fingerprintDirectionInput("Hello", { direction: "rtl" }, 1);
		const d = fingerprintDirectionInput("Hello", { direction: "auto" }, 2);
		expect(a).not.toBe(b);
		expect(a).not.toBe(c);
		expect(a).not.toBe(d);
		expect(a).toBe(
			fingerprintDirectionInput("Hello", { direction: "auto" }, 1),
		);
	});
});
