import { describe, expect, it } from "vitest";
import {
	createBareInteropEditor,
	NESTED_TRAVERSAL_MARKERS,
	nestedTraversalDocumentOps,
} from "../../../__tests__/interopCorpus";
import { htmlExporter } from "../exporter";

const MARKERS = NESTED_TRAVERSAL_MARKERS;

describe("HTML export nested traversal", () => {
	it("exports nested children, layout children, table cells, and list items", () => {
		const editor = createBareInteropEditor();
		editor.apply(nestedTraversalDocumentOps());

		const toggle = editor.getBlock("toggle-1");
		const callout = editor.getBlock("callout-1");
		expect(
			toggle?.children.some((child) => child.id === "toggle-child"),
		).toBe(true);
		expect(
			callout?.children.some((child) => child.id === "callout-child"),
		).toBe(true);
		expect(
			[...editor.documentState.allBlocks()].some(
				(handle) =>
					handle.id === "toggle-child" && handle.parent !== null,
			),
		).toBe(true);

		const html = htmlExporter.export(editor);
		if (typeof html !== "string") {
			throw new Error("Expected synchronous HTML export.");
		}

		for (const marker of Object.values(MARKERS)) {
			expect(html).toContain(marker);
		}

		// Flattening is the HTML contract: children are siblings, not dropped
		// and not nested inside the parent markup (toggle/callout serializers
		// only emit the title).
		expect(html).toContain(
			"<details><summary>TOGGLE-TITLE</summary></details>",
		);
		expect(html).not.toMatch(
			/<details[\s\S]*NESTED-TOGGLE-CHILD[\s\S]*<\/details>/,
		);
		expect(html).toContain(`<p>${MARKERS.toggleChild}</p>`);
		expect(html).toContain(
			`<div class="callout callout-info">CALLOUT-TITLE</div>`,
		);
		expect(html).not.toContain(
			`<div class="callout callout-info">CALLOUT-TITLE${MARKERS.calloutChild}`,
		);
		expect(html).toContain(`<p>${MARKERS.calloutChild}</p>`);
		expect(html).toContain(`<th>${MARKERS.tableCell}</th>`);
		expect(html).toContain(
			`<ul><li>LIST-ITEM-FIRST<ul><li>LIST-ITEM-NESTED</li></ul></li></ul>`,
		);

		editor.destroy();
	});
});
