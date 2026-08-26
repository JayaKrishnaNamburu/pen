import { describe, expect, it } from "vitest";
import { toStreamingPreviewText } from "../runtime/streamingPreviewText";
import { extractEditDocumentPreview } from "../runtime/editDocumentPreview";

describe("streaming preview text", () => {
	it("strips block syntax the preview cannot render as structure", () => {
		expect(
			toStreamingPreviewText(
				"## Written by a tool call\n\nThe scripted model asked for a tool.\n\n- One real operation\n- Another one\n\n1. First\n2. Second\n\n> A quote",
			),
		).toBe(
			[
				"Written by a tool call",
				"The scripted model asked for a tool.",
				"One real operation",
				"Another one",
				"First",
				"Second",
				"A quote",
			].join("\n"),
		);
	});

	it("strips inline emphasis, code, and link syntax", () => {
		expect(
			toStreamingPreviewText(
				"A **bold** and *italic* line with `code`, ~~cuts~~, and a [link](https://example.com).",
			),
		).toBe("A bold and italic line with code, cuts, and a link.");
	});

	it("reads a table as its cells, without pipes or the separator row", () => {
		expect(
			toStreamingPreviewText(
				"| Block | Use for |\n| --- | --- |\n| Heading | Sections |",
			),
		).toBe("Block  Use for\nHeading  Sections");
	});

	/**
	 * The formatter runs on every fragment, so a rule that needed a closing
	 * marker would reformat text already on screen. Each prefix of the payload
	 * has to format to a prefix of the finished text.
	 */
	it("formats a growing payload without rewriting what it already showed", () => {
		const markdown = "## A title\n\n- **bold** item\n- second item";
		let previous = "";
		for (let length = 1; length <= markdown.length; length += 1) {
			const current = toStreamingPreviewText(markdown.slice(0, length));
			if (
				!current.startsWith(previous) &&
				!previous.startsWith(current)
			) {
				throw new Error(
					`fragment ${length} reflowed: "${previous}" then "${current}"`,
				);
			}
			previous = current;
		}
		expect(previous).toBe("A title\nbold item\nsecond item");
	});

	it("does not flash an incomplete list marker", () => {
		expect(toStreamingPreviewText("-")).toBe("");
		expect(toStreamingPreviewText("- ")).toBe("");
		expect(toStreamingPreviewText("- Hello")).toBe("Hello");
		expect(toStreamingPreviewText("1.")).toBe("");
		expect(toStreamingPreviewText("1. Next")).toBe("Next");
	});

	it("formats a markdown payload but leaves a plain-text payload alone", () => {
		expect(
			extractEditDocumentPreview(
				'{"operations":[{"operation":"insert_blocks","blockId":"b1","markdown":"## Heading',
				"call-1",
			),
		).toMatchObject({ operation: "insert_blocks", text: "Heading" });

		expect(
			extractEditDocumentPreview(
				'{"operations":[{"operation":"replace_block_text","blockId":"b1","text":"# not a heading',
				"call-1",
			),
		).toMatchObject({
			operation: "replace_block_text",
			text: "# not a heading",
		});
	});
});
