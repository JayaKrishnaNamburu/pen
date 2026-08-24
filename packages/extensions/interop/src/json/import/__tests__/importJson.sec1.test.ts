import { describe, expect, it } from "vitest";
import { urlPolicy } from "@input/pen-core";
import { createEditor } from "@input/pen-core";
import { createDefaultSchema } from "@input/pen-schema-default";
import { parseJsonToBlocks } from "../importer";

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

function createBareEditor() {
	return createEditor({
		schema: createDefaultSchema(),
		preset: noDefaultExtensionsPreset,
	});
}

describe("SEC1 JSON import stores URLs; urlPolicy is the render gate", () => {
	it("SEC1: hostile href and src are stored verbatim", () => {
		const editor = createBareEditor();
		const blocks = parseJsonToBlocks(
			{
				version: 1,
				blocks: [
					{
						type: "paragraph",
						props: {},
						content: {
							text: "js",
							marks: [
								{
									type: "link",
									start: 0,
									end: 2,
									props: { href: "javascript:alert(1)" },
								},
							],
						},
					},
					{
						type: "image",
						props: { src: "file:///etc/passwd", alt: "file" },
					},
					{
						type: "image",
						props: { src: "filesystem:https://x/temporary/a" },
					},
					{
						type: "paragraph",
						props: {},
						content: {
							text: "vs",
							marks: [
								{
									type: "link",
									start: 0,
									end: 2,
									props: { href: "view-source:https://example.com" },
								},
							],
						},
					},
				],
			},
			editor,
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

		editor.destroy();
	});

	it("SEC1: render-time urlPolicy rejects those stored destinations", () => {
		expect(urlPolicy.resolve("javascript:alert(1)", "link")).toBeNull();
		expect(urlPolicy.resolve("file:///etc/passwd", "image")).toBeNull();
		expect(urlPolicy.resolve("filesystem:https://x/temporary/a", "image")).toBeNull();
		expect(urlPolicy.resolve("view-source:https://example.com", "link")).toBeNull();
	});
});
