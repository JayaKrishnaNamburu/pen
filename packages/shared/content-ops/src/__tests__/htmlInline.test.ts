import { describe, expect, it } from "vitest";
import { collectInlineHtmlContent } from "../htmlInline";

describe("collectInlineHtmlContent", () => {
	it("keeps text and maps strong/em to bold/italic marks", () => {
		expect(collectInlineHtmlContent("hello <strong>bold</strong> <em>italic</em>")).toEqual({
			text: "hello bold italic",
			marks: [
				{ type: "bold", start: 6, end: 10 },
				{ type: "italic", start: 11, end: 17 },
			],
		});
	});

	it("keeps link href from anchor tags", () => {
		expect(collectInlineHtmlContent('<a href="https://example.com">link</a>')).toEqual({
			text: "link",
			marks: [
				{
					type: "link",
					props: { href: "https://example.com", title: undefined },
					start: 0,
					end: 4,
				},
			],
		});
	});
});
