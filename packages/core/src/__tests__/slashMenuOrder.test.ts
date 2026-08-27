import { describe, expect, it } from "vitest";
import type { BlockDisplay } from "@input/pen-types";

import { orderSlashMenuItemsByGroup, slashMenuGroupOf } from "../index";

interface MenuItem {
	type: string;
	display: BlockDisplay;
}

function item(type: string, group?: string): MenuItem {
	return { type, display: group ? { title: type, group } : { title: type } };
}

function typesOf(items: readonly MenuItem[]): string[] {
	return items.map((entry) => entry.type);
}

describe("slash menu group ordering (spec/packages/rendering/react.md, API6)", () => {
	it("puts a group's blocks together without reordering within a group", () => {
		// registration order interleaves basic and list, the shape the default
		// schema produces and the shape that desynced render from navigation.
		const ordered = orderSlashMenuItemsByGroup([
			item("paragraph", "basic"),
			item("heading", "basic"),
			item("bulletListItem", "list"),
			item("codeBlock", "basic"),
			item("numberedListItem", "list"),
			item("image", "media"),
		]);

		expect(typesOf(ordered)).toEqual([
			"paragraph",
			"heading",
			"codeBlock",
			"bulletListItem",
			"numberedListItem",
			"image",
		]);
	});

	it("orders groups by first appearance, not alphabetically", () => {
		const ordered = orderSlashMenuItemsByGroup([
			item("image", "media"),
			item("paragraph", "basic"),
		]);

		expect(typesOf(ordered)).toEqual(["image", "paragraph"]);
	});

	it("keeps every input item exactly once", () => {
		const input = [
			item("a", "one"),
			item("b", "two"),
			item("c", "one"),
			item("d"),
		];

		const ordered = orderSlashMenuItemsByGroup(input);

		expect(ordered).toHaveLength(input.length);
		expect(new Set(typesOf(ordered))).toEqual(
			new Set(["a", "b", "c", "d"]),
		);
	});

	it("collects blocks with no declared group under one fallback group", () => {
		expect(slashMenuGroupOf({ title: "Loose" })).toBe("other");
		expect(slashMenuGroupOf({ title: "Text", group: "basic" })).toBe(
			"basic",
		);

		const ordered = orderSlashMenuItemsByGroup([
			item("loose"),
			item("paragraph", "basic"),
			item("alsoLoose"),
		]);

		expect(typesOf(ordered)).toEqual(["loose", "alsoLoose", "paragraph"]);
	});

	it("is idempotent, so an already-grouped list is untouched", () => {
		const once = orderSlashMenuItemsByGroup([
			item("paragraph", "basic"),
			item("bulletListItem", "list"),
			item("heading", "basic"),
		]);

		expect(typesOf(orderSlashMenuItemsByGroup(once))).toEqual(
			typesOf(once),
		);
	});
});
