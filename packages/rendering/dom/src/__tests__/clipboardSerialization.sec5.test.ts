import { describe, expect, it } from "vitest";
import { defaultSchema } from "@input/pen-schema";
import type { Editor } from "@input/pen-types";
import { serializeDeltasToFormat } from "../utils/clipboardSerialization";

function stubEditor(): Editor {
	return {
		schema: defaultSchema,
		facet: () => undefined,
	} as unknown as Editor;
}

describe("SEC5 clipboard HTML escaping", () => {
	it("SEC5: unmarked hostile text is escaped, not emitted as markup", () => {
		const html = serializeDeltasToFormat(
			[{ insert: `<img src=x onerror=alert(1)>` }],
			stubEditor(),
			"html",
		);

		expect(html).toBe("&lt;img src=x onerror=alert(1)&gt;");
		expect(html).not.toContain("<img");
	});

	it("SEC5: mark wrappers receive already-escaped text", () => {
		const html = serializeDeltasToFormat(
			[
				{
					insert: `<script>alert(1)</script>`,
					attributes: { bold: true },
				},
			],
			stubEditor(),
			"html",
		);

		expect(html).toBe(
			"<strong>&lt;script&gt;alert(1)&lt;/script&gt;</strong>",
		);
		expect(html).not.toContain("<script>");
	});

	it("SEC5: javascript: link href is omitted from clipboard HTML", () => {
		const html = serializeDeltasToFormat(
			[
				{
					insert: "click",
					attributes: { link: { href: "javascript:alert(1)" } },
				},
			],
			stubEditor(),
			"html",
		);

		expect(html).toContain('<a href="">click</a>');
		expect(html).not.toContain("javascript:");
	});

	it("SEC5: markdown flavor is not HTML-escaped", () => {
		const markdown = serializeDeltasToFormat(
			[{ insert: `<img src=x onerror=alert(1)>` }],
			stubEditor(),
			"markdown",
		);

		expect(markdown).toBe(`<img src=x onerror=alert(1)>`);
	});
});
