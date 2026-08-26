import { describe, expect, it } from "vitest";
import {
	createBareInteropEditor,
	NESTED_TRAVERSAL_MARKERS,
	nestedTraversalDocumentOps,
} from "../../__tests__/interopCorpus";
import { xmlExporter } from "../exporter";
import { xmlImporter } from "../importer";

const MARKERS = NESTED_TRAVERSAL_MARKERS;

function expectChildNestedInParent(
	xml: string,
	parentId: string,
	childId: string,
): void {
	const parentStart = xml.indexOf(`<block id="${parentId}"`);
	const childrenStart = xml.indexOf("<children>", parentStart);
	const childStart = xml.indexOf(`<block id="${childId}"`, childrenStart);
	expect(parentStart).toBeGreaterThan(-1);
	expect(childrenStart).toBeGreaterThan(parentStart);
	expect(childStart).toBeGreaterThan(childrenStart);
}

describe("XML export nested traversal", () => {
	it("nests layout children and keeps table and list content", async () => {
		const editor = createBareInteropEditor();
		editor.apply(nestedTraversalDocumentOps());

		const xml = await xmlExporter.export(editor);
		if (typeof xml !== "string") {
			throw new Error("Expected synchronous XML export.");
		}

		expectChildNestedInParent(xml, "toggle-1", "toggle-child");
		expectChildNestedInParent(xml, "callout-1", "callout-child");

		for (const marker of Object.values(MARKERS)) {
			expect(xml).toContain(marker);
		}

		editor.destroy();
	});

	it("round-trips nested children, a table, and a list", async () => {
		const source = createBareInteropEditor();
		source.apply(nestedTraversalDocumentOps());

		const exported = await xmlExporter.export(source);
		const target = createBareInteropEditor();
		await xmlImporter.import(exported, target, { replace: true });
		const reexported = await xmlExporter.export(target);

		expect(reexported).toEqual(exported);
		for (const marker of Object.values(MARKERS)) {
			expect(reexported).toContain(marker);
		}

		source.destroy();
		target.destroy();
	});
});
