import { describe, expect, it } from "vitest";
import {
	createBareInteropEditor,
	NESTED_TRAVERSAL_MARKERS,
	nestedTraversalDocumentOps,
} from "../../../__tests__/interopCorpus";
import { jsonExporter } from "../exporter";

const MARKERS = NESTED_TRAVERSAL_MARKERS;

describe("JSON export nested traversal", () => {
	it("nests layout children and keeps table and list content", async () => {
		const editor = createBareInteropEditor();
		editor.apply(nestedTraversalDocumentOps());

		const json = await jsonExporter.export(editor);
		const topIds = json.blocks.map((block) => block.id);
		expect(topIds).toEqual(["h1", "toggle-1", "callout-1", "t1", "l1", "l2"]);
		expect(topIds).not.toContain("toggle-child");
		expect(topIds).not.toContain("callout-child");

		const toggle = json.blocks.find((block) => block.id === "toggle-1");
		const callout = json.blocks.find((block) => block.id === "callout-1");
		expect(toggle?.children).toHaveLength(1);
		expect(toggle?.children?.[0]?.id).toBe("toggle-child");
		expect(toggle?.children?.[0]?.content?.text).toBe(MARKERS.toggleChild);
		expect(callout?.children).toHaveLength(1);
		expect(callout?.children?.[0]?.id).toBe("callout-child");
		expect(callout?.children?.[0]?.content?.text).toBe(MARKERS.calloutChild);

		const table = json.blocks.find((block) => block.id === "t1");
		expect(table?.children?.[0]?.children?.[0]?.content?.text).toBe(
			MARKERS.tableCell,
		);

		const listTexts = json.blocks
			.filter((block) => block.type === "bulletListItem")
			.map((block) => block.content?.text);
		expect(listTexts).toEqual([MARKERS.listFirst, MARKERS.listNested]);

		editor.destroy();
	});
});
