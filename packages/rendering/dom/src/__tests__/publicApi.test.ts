import { describe, expect, it } from "vitest";
import {
	DEFAULT_SELECT_ALL_BEHAVIOR,
	resolveSelectAllBehavior,
} from "../index";
import {
	DATA_ATTRS,
	buildDataAttributes,
	penDataAttr,
} from "../utils/dataAttributes";

describe("@pen/dom public helpers", () => {
	it("resolves select-all behavior from the interaction model", () => {
		expect(DEFAULT_SELECT_ALL_BEHAVIOR).toBe("document-first");
		expect(resolveSelectAllBehavior("block-first")).toBe("block-first");
		expect(resolveSelectAllBehavior("content-first")).toBe("document-first");
	});

	it("builds DOM data attributes predictably", () => {
		expect(penDataAttr("editor-root")).toBe("data-pen-editor-root");
		expect(DATA_ATTRS.editorRoot).toBe("data-pen-editor-root");
		expect(
			buildDataAttributes({
				role: "editor",
				active: true,
				hidden: false,
				index: 2,
				empty: undefined,
			}),
		).toEqual({
			"data-role": "editor",
			"data-active": "",
			"data-index": "2",
		});
	});
});
