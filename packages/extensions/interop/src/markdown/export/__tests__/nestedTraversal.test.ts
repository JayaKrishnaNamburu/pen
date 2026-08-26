import { describe, expect, it } from "vitest";
import {
	createBareInteropEditor,
	NESTED_TRAVERSAL_MARKERS,
	nestedTraversalDocumentOps,
} from "../../../__tests__/interopCorpus";
import { markdownExporter } from "../exporter";

const MARKERS = NESTED_TRAVERSAL_MARKERS;

describe("Markdown export nested traversal", () => {
	it("exports nested children, layout children, table cells, and list items", () => {
		const editor = createBareInteropEditor();
		editor.apply(nestedTraversalDocumentOps());

		const toggle = editor.getBlock("toggle-1");
		const callout = editor.getBlock("callout-1");
		expect(toggle?.children.some((child) => child.id === "toggle-child")).toBe(
			true,
		);
		expect(callout?.children.some((child) => child.id === "callout-child")).toBe(
			true,
		);

		const markdown = markdownExporter.export(editor);
		if (typeof markdown !== "string") {
			throw new Error("Expected synchronous markdown export.");
		}

		for (const marker of Object.values(MARKERS)) {
			expect(markdown).toContain(marker);
		}

		// Flattening is the markdown contract: children are siblings after the
		// parent construct, not dropped and not nested inside details/blockquote.
		expect(markdown).toContain("<summary>TOGGLE-TITLE</summary>");
		expect(markdown).not.toMatch(
			/<details>[\s\S]*NESTED-TOGGLE-CHILD[\s\S]*<\/details>/,
		);
		expect(markdown).toMatch(/<\/details>\s+NESTED-TOGGLE-CHILD/);
		expect(markdown).toContain("> **Note:** CALLOUT-TITLE");
		expect(markdown).toMatch(
			/> \*\*Note:\*\* CALLOUT-TITLE\s+NESTED-CALLOUT-CHILD/,
		);
		expect(markdown).toContain(MARKERS.tableCell);
		expect(markdown).toContain("- LIST-ITEM-FIRST\n  - LIST-ITEM-NESTED");

		editor.destroy();
	});
});
