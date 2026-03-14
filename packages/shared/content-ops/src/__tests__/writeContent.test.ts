import { createDefaultSchema } from "@pen/schema-default";
import { describe, expect, it, vi } from "vitest";
import { parseMarkdownToBlocks } from "../markdown";
import { buildDocumentWriteOps } from "../writeContent";

const schema = createDefaultSchema();

function createEditorStub(documentProfile: "structured" | "flow") {
	return {
		documentProfile,
		schema,
		internals: {
			emit: vi.fn(),
		},
	};
}

describe("@pen/content-ops", () => {
	it("builds structured ops from markdown content", () => {
		const editor = createEditorStub("structured");

		const result = buildDocumentWriteOps(editor, {
			format: "markdown",
			content: "# Heading\n\n- Item",
			position: "last",
			surface: "test",
		});

		expect(result.blocks.map((block) => block.type)).toEqual([
			"heading",
			"bulletListItem",
		]);
		expect(result.ops.filter((op) => op.type === "insert-block")).toHaveLength(2);
	});

	it("filters flow-disallowed markdown blocks during normalization", () => {
		const editor = createEditorStub("flow");
		const markdown =
			"<!-- pen-database:%7B%22columns%22%3A%5B%7B%22id%22%3A%22name%22%2C%22title%22%3A%22Name%22%2C%22type%22%3A%22text%22%7D%5D%2C%22rows%22%3A%5B%7B%22id%22%3A%22row-1%22%2C%22values%22%3A%7B%22name%22%3A%22Ship%22%7D%7D%5D%7D -->\n\n| Name |\n| --- |\n| Ship |\n\n## Allowed";

		const result = buildDocumentWriteOps(editor, {
			format: "markdown",
			content: markdown,
			position: "last",
			surface: "test",
		});

		expect(result.blocks.map((block) => block.type)).toEqual(["heading"]);
		expect(editor.internals.emit).toHaveBeenCalled();
	});

	it("parses database markers into database blocks", () => {
		const markdown =
			"<!-- pen-database:%7B%22title%22%3A%22Roadmap%22%2C%22columns%22%3A%5B%7B%22id%22%3A%22name%22%2C%22title%22%3A%22Name%22%2C%22type%22%3A%22text%22%7D%5D%2C%22rows%22%3A%5B%7B%22id%22%3A%22row-1%22%2C%22values%22%3A%7B%22name%22%3A%22Ship%22%7D%7D%5D%7D -->\n\n| Name |\n| --- |\n| Ship |";

		const blocks = parseMarkdownToBlocks(markdown, { schema });

		expect(blocks).toHaveLength(1);
		expect(blocks[0]).toMatchObject({
			type: "database",
			props: {
				title: "Roadmap",
				dataSource: "local",
			},
		});
	});

	it("lifts image-only paragraphs into image blocks", () => {
		const blocks = parseMarkdownToBlocks(
			'![alt text](https://example.com/image.png "caption")',
			{ schema },
		);

		expect(blocks).toEqual([
			expect.objectContaining({
				type: "image",
				props: expect.objectContaining({
					src: "https://example.com/image.png",
					alt: "alt text",
					caption: "caption",
				}),
			}),
		]);
	});
});
