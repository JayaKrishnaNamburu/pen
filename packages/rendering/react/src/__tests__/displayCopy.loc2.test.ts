import { createHeadlessEditor } from "@input/pen-core";
import { describe, expect, it } from "vitest";

import {
	displayCatalogForEditor,
	resolveSlashMenuGroup,
	resolveSlashMenuTitle,
} from "../utils/displayCopy";

describe("slash menu display copy (LOC2)", () => {
	it("LOC2: group slugs resolve to catalog headings and host overrides win", () => {
		const editor = createHeadlessEditor({
			messages: {
				"pen.display.group.basic": "Grundlagen",
				"pen.schema.paragraph.title": "Absatz",
			},
		});
		const catalog = displayCatalogForEditor(editor);

		expect(resolveSlashMenuGroup("basic", catalog)).toBe("Grundlagen");
		expect(resolveSlashMenuTitle("paragraph", "Paragraph", catalog)).toBe(
			"Absatz",
		);
		expect(resolveSlashMenuTitle("myBlock", "My Block", catalog)).toBe(
			"My Block",
		);
		expect(resolveSlashMenuGroup("custom", catalog)).toBe("custom");
		editor.destroy();
	});

	it("LOC2: default English catalog is used when the host omits keys", () => {
		const catalog = displayCatalogForEditor();
		expect(resolveSlashMenuGroup("basic", catalog)).toBe("Basic");
		expect(resolveSlashMenuGroup("lists", catalog)).toBe("Lists");
		expect(resolveSlashMenuTitle("heading", "Heading", catalog)).toBe(
			"Heading",
		);
	});
});
