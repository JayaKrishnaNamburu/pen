import { defineExtension } from "@input/pen-core";
import { describe, expect, it } from "vitest";

import {
	A11Y_MISSING_LABEL_CODE,
	a11yLabelFacet,
	createHeadlessEditor,
	resolveEditorA11yLabel,
} from "../index";
import { getFacetSpec } from "../facets/defineFacet";
import { defaultSchema } from "./fixtures/testSchema";

describe("pen.a11yLabel facet (AX1)", () => {
	it("AX1: names the facet pen.a11yLabel and first usable provider wins", () => {
		expect(a11yLabelFacet.name).toBe("pen.a11yLabel");
		const spec = getFacetSpec(a11yLabelFacet);
		expect(spec.combine(["Compose", "Other"])).toBe("Compose");
		expect(spec.combine(["", { labelledBy: "title" }])).toEqual({
			labelledBy: "title",
		});
		expect(spec.combine([])).toBeUndefined();
	});

	it("AX1: createEditor a11yLabel becomes the facet value", () => {
		const editor = createHeadlessEditor({
			schema: defaultSchema,
			a11yLabel: "Compose email",
		});
		expect(editor.facet(a11yLabelFacet)).toBe("Compose email");
		expect(resolveEditorA11yLabel(editor)).toEqual({
			"aria-label": "Compose email",
		});
		editor.destroy();
	});

	it("AX1: host a11yLabel beats an extension at the same precedence", () => {
		const editor = createHeadlessEditor({
			schema: defaultSchema,
			a11yLabel: "Host label",
			extensions: [
				defineExtension({
					name: "a11y-ext",
					facets: [a11yLabelFacet.of("Extension label", "highest")],
				}),
			],
		});
		expect(editor.facet(a11yLabelFacet)).toBe("Host label");
		editor.destroy();
	});

	it("AX1: labelledBy maps to aria-labelledby", () => {
		const editor = createHeadlessEditor({
			schema: defaultSchema,
			a11yLabel: { labelledBy: "page-title" },
		});
		expect(resolveEditorA11yLabel(editor)).toEqual({
			"aria-labelledby": "page-title",
		});
		editor.destroy();
	});

	it("AX1: a missing label emits a11y-missing-label once and falls back to the catalog", () => {
		const editor = createHeadlessEditor({ schema: defaultSchema });
		const codes: string[] = [];
		editor.on("diagnostic", (event) => {
			if (event.code === A11Y_MISSING_LABEL_CODE) {
				codes.push(event.code);
			}
		});

		expect(editor.facet(a11yLabelFacet)).toBeUndefined();
		expect(resolveEditorA11yLabel(editor)).toEqual({
			"aria-label": "Editor",
		});
		expect(resolveEditorA11yLabel(editor)).toEqual({
			"aria-label": "Editor",
		});
		expect(codes).toEqual([A11Y_MISSING_LABEL_CODE]);
		editor.destroy();
	});
});
