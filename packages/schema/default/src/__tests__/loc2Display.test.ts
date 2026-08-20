import { describe, expect, it } from "vitest";

import { defaultBlocks, defaultInlines } from "../defs";
import {
	SCHEMA_DISPLAY_CATALOG,
	resolveDisplayCopy,
	resolveDisplayGroup,
	schemaDisplayKey,
	schemaGroupKey,
	type SchemaDisplayMessageKey,
} from "../messages";

function expectedBlockKeys(): string[] {
	const keys: string[] = [];
	for (const block of defaultBlocks) {
		keys.push(schemaDisplayKey(block.type, "title"));
		keys.push(schemaDisplayKey(block.type, "description"));
		if (block.placeholder != null) {
			keys.push(schemaDisplayKey(block.type, "placeholder"));
		}
	}
	return keys;
}

function expectedInlineKeys(): string[] {
	const keys: string[] = [];
	for (const inline of defaultInlines) {
		keys.push(schemaDisplayKey(inline.type, "title"));
		keys.push(schemaDisplayKey(inline.type, "description"));
	}
	return keys;
}

function expectedGroupKeys(): string[] {
	const groups = new Set<string>();
	for (const block of defaultBlocks) {
		const group = block.display?.group;
		if (group) {
			groups.add(schemaGroupKey(group));
		}
	}
	return [...groups];
}

describe("LOC2 schema display catalog", () => {
	it("LOC2: every default block title, description, and placeholder maps to the catalog", () => {
		for (const block of defaultBlocks) {
			expect(block.display, `${block.type} has display`).toBeDefined();
			const titleKey = schemaDisplayKey(block.type, "title");
			expect(SCHEMA_DISPLAY_CATALOG[titleKey as SchemaDisplayMessageKey]).toBe(
				block.display?.title,
			);
			expect(resolveDisplayCopy(titleKey)).toBe(block.display?.title);

			const descriptionKey = schemaDisplayKey(block.type, "description");
			expect(
				SCHEMA_DISPLAY_CATALOG[descriptionKey as SchemaDisplayMessageKey],
			).toBe(block.display?.description);
			expect(resolveDisplayCopy(descriptionKey)).toBe(block.display?.description);

			if (block.placeholder != null) {
				const placeholderKey = schemaDisplayKey(block.type, "placeholder");
				expect(
					SCHEMA_DISPLAY_CATALOG[placeholderKey as SchemaDisplayMessageKey],
				).toBe(block.placeholder);
				expect(resolveDisplayCopy(placeholderKey)).toBe(block.placeholder);
			}
		}
	});

	it("LOC2: group slugs resolve to catalog headings, not the slug", () => {
		const groups = new Set(
			defaultBlocks
				.map((block) => block.display?.group)
				.filter((group): group is string => group != null),
		);
		expect(groups.size).toBeGreaterThan(0);
		for (const group of groups) {
			const heading = resolveDisplayGroup(group);
			expect(heading, `group ${group}`).toBeDefined();
			expect(heading).not.toBe(group);
			expect(heading).toBe(
				SCHEMA_DISPLAY_CATALOG[schemaGroupKey(group) as SchemaDisplayMessageKey],
			);
		}
	});

	it("LOC2: marks and inline nodes have catalog title and description entries", () => {
		for (const inline of defaultInlines) {
			const titleKey = schemaDisplayKey(inline.type, "title");
			const descriptionKey = schemaDisplayKey(inline.type, "description");
			const title =
				SCHEMA_DISPLAY_CATALOG[titleKey as SchemaDisplayMessageKey];
			const description =
				SCHEMA_DISPLAY_CATALOG[descriptionKey as SchemaDisplayMessageKey];
			expect(title, titleKey).toBeTruthy();
			expect(title).not.toBe(inline.type);
			expect(description, descriptionKey).toBe(inline.aiDescription);
		}
	});

	it("LOC2: catalog keys match default-schema copy in both directions", () => {
		const expected = new Set([
			...expectedBlockKeys(),
			...expectedInlineKeys(),
			...expectedGroupKeys(),
			"pen.schema.document.emptyPlaceholder",
			"pen.display.group.other",
		]);
		expect(new Set(Object.keys(SCHEMA_DISPLAY_CATALOG))).toEqual(expected);
	});

	it("LOC2: display fields accept a catalog key or keep a literal", () => {
		expect(resolveDisplayCopy("pen.schema.paragraph.title")).toBe("Paragraph");
		expect(resolveDisplayCopy("Custom Title")).toBe("Custom Title");
		expect(resolveDisplayCopy(undefined)).toBeUndefined();
		expect(resolveDisplayCopy("Text")).toBe("Text");
	});

	it("LOC2: a custom block with literal display strings still resolves them", () => {
		const custom = {
			title: "My Block",
			description: "Host-owned copy",
			group: "custom",
			placeholder: "Type here",
		};
		expect(resolveDisplayCopy(custom.title)).toBe("My Block");
		expect(resolveDisplayCopy(custom.description)).toBe("Host-owned copy");
		expect(resolveDisplayCopy(custom.placeholder)).toBe("Type here");
		expect(resolveDisplayGroup(custom.group)).toBe("custom");
	});

	it("LOC2: overlapping L.1 seed keys keep the same English", () => {
		expect(SCHEMA_DISPLAY_CATALOG["pen.schema.paragraph.title"]).toBe(
			"Paragraph",
		);
		expect(SCHEMA_DISPLAY_CATALOG["pen.schema.paragraph.description"]).toBe(
			"Plain text paragraph",
		);
		expect(SCHEMA_DISPLAY_CATALOG["pen.schema.paragraph.placeholder"]).toBe(
			"Text",
		);
		expect(SCHEMA_DISPLAY_CATALOG["pen.schema.heading.title"]).toBe("Heading");
		expect(SCHEMA_DISPLAY_CATALOG["pen.schema.heading.placeholder"]).toBe(
			"Heading",
		);
		expect(SCHEMA_DISPLAY_CATALOG["pen.display.group.basic"]).toBe("Basic");
		expect(SCHEMA_DISPLAY_CATALOG["pen.display.group.lists"]).toBe("Lists");
	});

	it("LOC2: document emptyPlaceholder has a catalog default", () => {
		expect(SCHEMA_DISPLAY_CATALOG["pen.schema.document.emptyPlaceholder"]).toBe(
			"Start writing...",
		);
		expect(resolveDisplayCopy("pen.schema.document.emptyPlaceholder")).toBe(
			"Start writing...",
		);
	});
});
