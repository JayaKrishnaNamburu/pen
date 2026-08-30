import { describe, it, expect } from "vitest";
import { ALLOWED_DATA_PEN_ATTRS, sanitizeHTML } from "../sanitize";
import { parseInlineContent } from "../inlineParser";
import type { DOMNode } from "../domAdapter";

describe("sanitizeHTML", () => {
	it("strips <script> tags (AC 29, 42)", () => {
		const result = sanitizeHTML('<p>safe</p><script>alert("xss")</script>');
		expect(result).not.toContain("script");
		expect(result).toContain("safe");
	});

	it("strips <style> tags (AC 42)", () => {
		const result = sanitizeHTML("<p>text</p><style>body{color:red}</style>");
		expect(result).not.toContain("style>");
		expect(result).toContain("text");
	});

	it("strips <iframe> tags (AC 42)", () => {
		const result = sanitizeHTML('<iframe src="evil.com"></iframe><p>ok</p>');
		expect(result).not.toContain("iframe");
		expect(result).toContain("ok");
	});

	it("strips event handler attributes (AC 42)", () => {
		const result = sanitizeHTML('<div onclick="alert(1)">text</div>');
		expect(result).not.toContain("onclick");
		expect(result).toContain("text");
	});

	it("handles javascript: URLs (AC 31)", () => {
		const result = sanitizeHTML('<a href="javascript:void(0)">link</a>');
		expect(result).not.toContain("javascript:");
	});

	it("preserves allowed tags", () => {
		const result = sanitizeHTML("<p><strong>bold</strong></p>");
		expect(result).toContain("<strong>");
		expect(result).toContain("bold");
	});

	it("preserves img with allowed attributes", () => {
		const result = sanitizeHTML('<img src="photo.jpg" alt="photo" />');
		expect(result).toContain("src");
		expect(result).toContain("alt");
	});

	it("SEC3: hook-based style filter keeps color, background-color, and enumerated text-align", () => {
		const result = sanitizeHTML(
			'<p style="color: red; position: fixed; background-color: blue; text-align: center; z-index: 1">styled</p>',
		);
		expect(result).toContain(
			'style="color: red; background-color: blue; text-align: center"',
		);
		expect(result).not.toContain("position:");
		expect(result).not.toContain("z-index:");
	});

	it("SEC3: admits each enumerated text-align keyword and drops inherit", () => {
		for (const value of ["left", "right", "center", "justify", "start", "end"]) {
			const result = sanitizeHTML(
				`<p style="text-align: ${value}">aligned</p>`,
			);
			expect(result).toContain(`text-align: ${value}`);
		}
		const inherit = sanitizeHTML('<p style="text-align: inherit">plain</p>');
		expect(inherit).not.toContain("text-align");
		expect(inherit).toContain("plain");
	});

	it("SEC3: canonicalizes text-align case and strips !important", () => {
		const result = sanitizeHTML(
			'<p style="text-align: CENTER !important">aligned</p>',
		);
		expect(result).toContain("text-align: center");
		expect(result).not.toContain("important");
	});

	it("SEC3: validated HTML align survives; other values are dropped", () => {
		expect(sanitizeHTML('<p align="right">aligned</p>')).toContain(
			'align="right"',
		);
		expect(sanitizeHTML('<p align="CENTER">aligned</p>')).toContain(
			'align="center"',
		);
		const hostile = sanitizeHTML('<p align="javascript:alert(1)">plain</p>');
		expect(hostile).toContain("plain");
		expect(hostile.toLowerCase()).not.toMatch(/\balign\s*=/);
	});

	it("SEC3: hostile text-align values stay blocked", () => {
		const payloads = [
			'<p style="text-align: expression(alert(1))">plain</p>',
			'<p style="text-align: url(https://evil.example/x)">plain</p>',
			'<p style="text-align: /**/center">plain</p>',
			'<p style="text-align: \\63 enter">plain</p>',
			'<p style="text-align: left url(javascript:alert(1))">plain</p>',
			'<p style="-webkit-text-align: center">plain</p>',
		];
		for (const html of payloads) {
			const result = sanitizeHTML(html);
			expect(result).toContain("plain");
			expect(result.toLowerCase()).not.toContain("text-align");
			expect(result.toLowerCase()).not.toContain("expression");
			expect(result.toLowerCase()).not.toContain("url(");
		}
	});

	it("SEC3: mixed style keeps validated text-align and drops url-bearing props", () => {
		const result = sanitizeHTML(
			'<p style="text-align: center; background-image: url(https://exfil.example)">plain</p>',
		);
		expect(result).toContain("plain");
		expect(result).toContain("text-align: center");
		expect(result.toLowerCase()).not.toContain("background-image");
		expect(result.toLowerCase()).not.toContain("url(");
	});

	it("SEC3: drops id and data-* that conversion does not read", () => {
		const result = sanitizeHTML(
			'<p id="docs-internal-guid" data-pen-blocks="abc" data-title="x" class="language-js">ok</p>',
		);
		expect(result).not.toContain("id=");
		expect(result).not.toContain("data-pen-blocks");
		expect(result).not.toContain("data-title");
		expect(result).toContain("language-js");
		expect(result).toContain("ok");
	});

	it("SEC3: ALLOWED_DATA_PEN_ATTRS is the conversion-read list (empty)", () => {
		expect(ALLOWED_DATA_PEN_ATTRS).toEqual([]);
		expect(Object.isFrozen(ALLOWED_DATA_PEN_ATTRS)).toBe(true);
	});

	it("SEC3: mXSS svg/math payloads that defeat regex post-processing are inert", () => {
		const result = sanitizeHTML(
			`<svg><desc><![CDATA[</desc><script>window.__xssProbe()</script>]]></svg>
<math><mtext></mtext><script>window.__xssProbe()</script></math>
<p>safe</p>`,
		);
		expect(result).not.toMatch(/<script/i);
		expect(result).not.toMatch(/<svg/i);
		expect(result).not.toMatch(/<math/i);
		expect(result).toContain("safe");
	});
});
describe("parseInlineContent", () => {
	it("extracts text from text nodes", () => {
		const node: DOMNode = { type: "text", textContent: "hello" };
		const result = parseInlineContent(node);
		expect(result.text).toBe("hello");
		expect(result.marks).toHaveLength(0);
	});

	it("extracts bold mark", () => {
		const node: DOMNode = {
			type: "element",
			tagName: "strong",
			children: [{ type: "text", textContent: "bold" }],
		};
		const result = parseInlineContent(node);
		expect(result.text).toBe("bold");
		expect(result.marks).toHaveLength(1);
		expect(result.marks[0]).toMatchObject({
			type: "bold",
			start: 0,
			end: 4,
		});
	});

	it("extracts link mark with href", () => {
		const node: DOMNode = {
			type: "element",
			tagName: "a",
			attributes: { href: "https://example.com", title: "Example" },
			children: [{ type: "text", textContent: "link" }],
		};
		const result = parseInlineContent(node);
		expect(result.text).toBe("link");
		expect(result.marks[0]).toMatchObject({
			type: "link",
			props: { href: "https://example.com", title: "Example" },
		});
	});

	it("handles nested marks", () => {
		const node: DOMNode = {
			type: "element",
			tagName: "strong",
			children: [
				{
					type: "element",
					tagName: "em",
					children: [{ type: "text", textContent: "both" }],
				},
			],
		};
		const result = parseInlineContent(node);
		expect(result.text).toBe("both");
		expect(result.marks).toHaveLength(2);
		expect(result.marks.some((m) => m.type === "bold")).toBe(true);
		expect(result.marks.some((m) => m.type === "italic")).toBe(true);
	});
});
