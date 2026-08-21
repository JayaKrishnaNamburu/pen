import { describe, expect, it } from "vitest";
import { urlPolicy } from "../security/urlPolicy";

const CONTEXTS = ["link", "image", "media", "download"] as const;

describe("SEC1 url policy", () => {
	it("SEC1: allows http, https, mailto, tel, protocol-relative, and relative URLs", () => {
		for (const context of CONTEXTS) {
			expect(urlPolicy.resolve("http://example.com/a", context)).toBe(
				"http://example.com/a",
			);
			expect(urlPolicy.resolve("https://example.com/a", context)).toBe(
				"https://example.com/a",
			);
			expect(urlPolicy.resolve("mailto:user@example.com", context)).toBe(
				"mailto:user@example.com",
			);
			expect(urlPolicy.resolve("tel:+15551212", context)).toBe(
				"tel:+15551212",
			);
			expect(urlPolicy.resolve("//cdn.example.com/a.png", context)).toBe(
				"//cdn.example.com/a.png",
			);
			expect(urlPolicy.resolve("/images/a.png", context)).toBe(
				"/images/a.png",
			);
			expect(urlPolicy.resolve("./a.png", context)).toBe("./a.png");
			expect(urlPolicy.resolve("../a.png", context)).toBe("../a.png");
		}
	});

	it("SEC1: allows mixed-case http(s) and rejects mixed-case javascript", () => {
		expect(urlPolicy.resolve("HTTP://Example.COM/x", "link")).toBe(
			"HTTP://Example.COM/x",
		);
		expect(urlPolicy.resolve("Https://example.com/x", "image")).toBe(
			"Https://example.com/x",
		);
		expect(urlPolicy.resolve("JaVaScRiPt:alert(1)", "link")).toBe(null);
		expect(urlPolicy.resolve("JAVASCRIPT:void(0)", "image")).toBe(null);
		expect(urlPolicy.resolve("  javascript:alert(1)", "link")).toBe(null);
	});

	it("SEC1: allows data:image types in image context only", () => {
		const png = "data:image/png;base64,aaa";
		const jpeg = "data:image/jpeg;base64,aaa";
		const gif = "data:image/gif;base64,aaa";
		const webp = "data:image/webp;base64,aaa";
		const avif = "data:image/avif;base64,aaa";
		const mixed = "DATA:IMAGE/PNG;base64,aaa";

		expect(urlPolicy.resolve(png, "image")).toBe(png);
		expect(urlPolicy.resolve(jpeg, "image")).toBe(jpeg);
		expect(urlPolicy.resolve(gif, "image")).toBe(gif);
		expect(urlPolicy.resolve(webp, "image")).toBe(webp);
		expect(urlPolicy.resolve(avif, "image")).toBe(avif);
		expect(urlPolicy.resolve(mixed, "image")).toBe(mixed);

		expect(urlPolicy.resolve(png, "link")).toBe(null);
		expect(urlPolicy.resolve(png, "media")).toBe(null);
		expect(urlPolicy.resolve(png, "download")).toBe(null);
		expect(urlPolicy.resolve("data:image/svg+xml,<svg></svg>", "image")).toBe(
			null,
		);
	});

	it("SEC1: rejects data:text/html", () => {
		const html = "data:text/html,<script>alert(1)</script>";
		expect(urlPolicy.resolve(html, "image")).toBe(null);
		expect(urlPolicy.resolve(html, "link")).toBe(null);
		expect(urlPolicy.resolve("DATA:TEXT/HTML,hi", "image")).toBe(null);
	});

	it("SEC1: rejects non-string input and unparsable values", () => {
		expect(urlPolicy.resolve(undefined, "image")).toBe(null);
		expect(urlPolicy.resolve(null, "link")).toBe(null);
		expect(urlPolicy.resolve(123, "image")).toBe(null);
		expect(urlPolicy.resolve(true, "link")).toBe(null);
		expect(urlPolicy.resolve({ href: "https://example.com" }, "link")).toBe(
			null,
		);
		expect(urlPolicy.resolve(["https://example.com"], "image")).toBe(null);
		expect(urlPolicy.resolve("http://[", "link")).toBe(null);
	});

	it("SEC1: rejects javascript, vbscript, and file schemes without echoing them", () => {
		const blocked = [
			"javascript:alert(1)",
			"vbscript:msgbox(1)",
			"file:///etc/passwd",
		];
		for (const value of blocked) {
			for (const context of CONTEXTS) {
				expect(urlPolicy.resolve(value, context)).toBe(null);
			}
		}
	});
});
