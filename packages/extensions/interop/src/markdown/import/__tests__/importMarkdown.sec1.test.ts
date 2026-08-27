import { describe, expect, it } from "vitest";
import { urlPolicy } from "@input/pen-core";
import { createDefaultSchema } from "@input/pen-schema";
import { parseMarkdownToBlocks } from "../importer";

const defaultRegistry = createDefaultSchema();

function convert(md: string) {
	return parseMarkdownToBlocks(md, {
		schema: defaultRegistry,
	} as never);
}

describe("SEC1 markdown import stores URLs; urlPolicy is the render gate", () => {
	it("SEC1: hostile markdown link and image destinations are stored verbatim", () => {
		const blocks = convert(
			[
				"[js](javascript:alert(1))",
				"![file](file:///etc/passwd)",
				"![fs](filesystem:https://x/temporary/a)",
				"[vs](view-source:https://example.com)",
			].join("\n\n"),
		);

		const hrefs = blocks.flatMap((block) =>
			(block.marks ?? [])
				.filter((mark) => mark.type === "link")
				.map((mark) => mark.props?.href),
		);
		const srcs = blocks
			.filter((block) => block.type === "image")
			.map((block) => block.props.src);

		expect(hrefs).toEqual([
			"javascript:alert(1)",
			"view-source:https://example.com",
		]);
		expect(srcs).toEqual([
			"file:///etc/passwd",
			"filesystem:https://x/temporary/a",
		]);
	});

	it("SEC1: render-time urlPolicy rejects those stored destinations", () => {
		expect(urlPolicy.resolve("javascript:alert(1)", "link")).toBeNull();
		expect(urlPolicy.resolve("file:///etc/passwd", "image")).toBeNull();
		expect(urlPolicy.resolve("filesystem:https://x/temporary/a", "image")).toBeNull();
		expect(urlPolicy.resolve("view-source:https://example.com", "link")).toBeNull();
	});

	it("SEC1: HTML-in-markdown HREF is captured case-insensitively and still stored", () => {
		const blocks = convert(
			'<details><summary><a HREF="javascript:alert(1)">x</a></summary></details>',
		);

		expect(blocks).toHaveLength(1);
		expect(blocks[0]?.type).toBe("toggle");
		expect(blocks[0]?.marks?.find((mark) => mark.type === "link")?.props?.href).toBe(
			"javascript:alert(1)",
		);
	});
});
