import { describe, expect, it } from "vitest";
import { urlPolicy, type UrlContext } from "../security/urlPolicy";

const CONTEXTS: UrlContext[] = ["link", "image", "media", "download"];

describe("SEC1 urlPolicy", () => {
	it("SEC1: javascript: is inert", () => {
		const blocked = [
			"javascript:alert(1)",
			"JaVaScRiPt:alert(1)",
			"JAVASCRIPT:void(0)",
			"  javascript:alert(1)",
			"\tjavascript:alert(1)",
		];

		for (const value of blocked) {
			for (const context of CONTEXTS) {
				expect(urlPolicy.resolve(value, context)).toBe(null);
			}
		}
	});

	it("SEC1: https is allowed", () => {
		const href = "https://example.com/docs";
		for (const context of CONTEXTS) {
			expect(urlPolicy.resolve(href, context)).toBe(href);
		}

		expect(urlPolicy.resolve("HTTPS://Example.COM/x", "link")).toBe(
			"HTTPS://Example.COM/x",
		);
		expect(
			urlPolicy.resolve("https://example.com/a?q=1#hash", "download"),
		).toBe("https://example.com/a?q=1#hash");
	});

	it("SEC1: data: is rejected except documented image types", () => {
		const html = "data:text/html,<script>alert(1)</script>";
		const svg = "data:image/svg+xml,<svg></svg>";
		const png = "data:image/png;base64,aaa";

		for (const context of CONTEXTS) {
			expect(urlPolicy.resolve(html, context)).toBe(null);
			expect(urlPolicy.resolve(svg, context)).toBe(null);
			expect(urlPolicy.resolve("DATA:TEXT/HTML,hi", context)).toBe(null);
		}

		expect(urlPolicy.resolve(png, "image")).toBe(png);
		expect(urlPolicy.resolve(png, "link")).toBe(null);
		expect(urlPolicy.resolve(png, "media")).toBe(null);
		expect(urlPolicy.resolve(png, "download")).toBe(null);
	});
});
